// Ajustes do robô e piloto automático: com ele ligado, as vagas com nota alta entram na fila sozinhas,
// sem precisar do "É minha!", respeitando o limite por dia.
import { q, kvGet } from './db.js';
import { enqueue, addLog } from './queue.js';
import { contasParaRobo } from './contas.js';

/* Começa ligado e em modo ensaio (preenche tudo e não envia). Piloto automático começa desligado. */
export const ROBO_DEFAULT = { ligado: true, ensaio: true, limiteDia: 20, horaInicio: 8, horaFim: 22, pausaMin: 2, pausaMax: 6, autoAplicar: false, autoNota: 80 };

export async function roboConfig() {
  return { ...ROBO_DEFAULT, ...(await kvGet('roboConfig', {})) };
}

export async function appliedToday() {
  const { rows } = await q("select count(*)::int n from applications where status = 'aplicada' and (updated_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date");
  return rows[0].n;
}

/**
 * Coloca na fila as melhores vagas novas (nota ≥ autoNota) até completar o limite do dia.
 * Pula vagas por e-mail e as de sites cujo login ainda não está pronto (sem sessão nem senha salva).
 */
export async function autoEnqueue(log = () => {}) {
  const cfg = await roboConfig();
  if (!cfg.ligado || !cfg.autoAplicar) return 0;
  const { rows: w } = await q("select count(*)::int n from applications where status in ('aguardando', 'aplicando')");
  const room = cfg.limiteDia - (await appliedToday()) - w[0].n;
  if (room <= 0) return 0;

  const skip = ['email', 'github'];
  const ses = await kvGet('roboSessoes', {});
  const contas = await contasParaRobo();
  if (!ses.linkedin && !contas.linkedin) skip.push('linkedin', 'linkedin_easy', 'linkedin_externo');
  if (!ses.gupy && !contas.gupy) skip.push('gupy');

  const { rows } = await q(
    `select id, score, data->>'title' title from jobs
     where status = 'nova' and (data->>'block') is null and score >= $1 and ats <> all($2::text[])
     order by score desc, created_at desc limit $3`,
    [cfg.autoNota, skip, room],
  );
  for (const r of rows) {
    const a = await enqueue(r.id);
    await addLog(a.id, `Entrou na fila sozinha pelo piloto automático (nota ${r.score}, mínimo ${cfg.autoNota})`);
  }
  if (rows.length) log(`piloto automático: ${rows.length} vaga(s) na fila`);
  return rows.length;
}
