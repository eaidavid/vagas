// Fila de aplicação no próprio Postgres. O robô pega uma vaga por vez
// ("for update skip locked"), então duas execuções nunca aplicam na mesma vaga.
import { q } from './db.js';

export async function enqueue(jobId) {
  await q("update jobs set status = 'minha', updated_at = now() where id = $1", [jobId]);
  const { rows } = await q(
    `insert into applications(job_id, log) values ($1, $2)
     on conflict (job_id) do update set status = case when applications.status in ('cancelada', 'falhou') then 'aguardando' else applications.status end, updated_at = now()
     returning *`,
    [jobId, JSON.stringify([{ at: new Date().toISOString(), text: 'Entrou na fila de aplicação' }])],
  );
  return rows[0];
}

export async function addLog(id, text, extra = {}) {
  await q("update applications set log = log || $2::jsonb, updated_at = now() where id = $1", [id, JSON.stringify([{ at: new Date().toISOString(), text, ...extra }])]);
}

/* O robô pede a próxima vaga. Destrava sozinha uma vaga presa há mais de 20 minutos */
export async function claimNext() {
  await q("update applications set status = 'aguardando', locked_at = null where status = 'aplicando' and locked_at < now() - interval '20 minutes'");
  const { rows } = await q(
    `update applications set status = 'aplicando', locked_at = now(), attempts = attempts + 1, updated_at = now()
     where id = (select id from applications where status = 'aguardando' and next_run_at <= now() order by next_run_at, id for update skip locked limit 1)
     returning *`,
  );
  if (!rows[0]) return null;
  const { rows: jr } = await q('select id, ats, data from jobs where id = $1', [rows[0].job_id]);
  return { application: rows[0], job: jr[0] };
}

const MAX_ATTEMPTS = 3;

/* Resultado do robô: aplicada | precisa_voce | erro (tenta de novo com espera crescente até 3 vezes) */
export async function report(id, { status, text, error, questions, screenshot, filled }) {
  const { rows } = await q('select * from applications where id = $1', [id]);
  const app = rows[0];
  if (!app) return null;
  if (status === 'aplicada') {
    await q("update applications set status = 'aplicada', locked_at = null, error = null, updated_at = now() where id = $1", [id]);
  } else if (status === 'precisa_voce') {
    await q("update applications set status = 'precisa_voce', locked_at = null, error = $2, updated_at = now() where id = $1", [id, error || null]);
  } else {
    const last = app.attempts >= MAX_ATTEMPTS;
    await q(
      `update applications set status = $2, locked_at = null, error = $3, next_run_at = now() + ($4 || ' minutes')::interval, updated_at = now() where id = $1`,
      [id, last ? 'falhou' : 'aguardando', error || 'Erro desconhecido', String(15 * 2 ** (app.attempts - 1))],
    );
  }
  await addLog(id, text || status, { error: error || undefined, questions: questions?.length ? questions : undefined, screenshot: screenshot || undefined, filled: filled?.length ? filled.slice(0, 60) : undefined });
  return true;
}

export async function setStatus(id, status, text) {
  await q('update applications set status = $2, locked_at = null, next_run_at = now(), updated_at = now() where id = $1', [id, status]);
  if (status === 'aguardando') await q('update applications set error = null where id = $1', [id]);
  await addLog(id, text);
}
