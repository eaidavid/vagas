// API do painel.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { q, kvGet, kvSet } from './db.js';
import { getProfile, saveProfile } from './profile.js';
import { runCollectors, isRunning, recentActivity, rescoreAll } from './collectors/index.js';
import { enqueue, setStatus, claimNext, report } from './queue.js';
import { ATS_INFO } from './ats.js';

const DATA = process.env.DATA_DIR || '/data';
const CV = path.join(DATA, 'curriculo.pdf');
const PRINTS = path.join(DATA, 'prints');

/* Ajustes do robô (Perfil → Robô). Começa ligado e em modo ensaio: preenche tudo e não envia. */
const ROBO_DEFAULT = { ligado: true, ensaio: true, limiteDia: 20, horaInicio: 8, horaFim: 22, pausaMin: 2, pausaMax: 6 };
export async function roboConfig() {
  return { ...ROBO_DEFAULT, ...(await kvGet('roboConfig', {})) };
}

const summary = (r) => ({
  id: r.id,
  status: r.status,
  score: r.score,
  ats: r.ats,
  atsInfo: ATS_INFO[r.ats] || ATS_INFO.desconhecido,
  source: r.source,
  title: r.data.title,
  company: r.data.company,
  location: r.data.location,
  workplace: r.data.workplace,
  salaryText: r.data.salaryText || null,
  postedAt: r.data.postedAt,
  employmentType: r.data.employmentType || null,
  intern: !!r.data.intern,
  logo: r.data.logo || null,
  url: r.data.url,
  applyUrl: r.data.applyUrl || null,
  reasons: r.data.reasons || [],
  block: r.data.block || null,
  skills: r.data.skills || [],
  fontes: r.data.fontes || [],
  createdAt: r.created_at,
});
const full = (r) => ({ ...summary(r), description: r.data.description || '' });

export function registerRoutes(app) {
  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/stats', async () => {
    const { rows: js } = await q('select status, count(*)::int n from jobs group by status');
    const { rows: as } = await q('select status, count(*)::int n from applications group by status');
    const { rows: today } = await q("select count(*)::int n from jobs where created_at > now() - interval '24 hours'");
    return {
      jobs: Object.fromEntries(js.map((r) => [r.status, r.n])),
      applications: Object.fromEntries(as.map((r) => [r.status, r.n])),
      novas24h: today[0].n,
      lastCollect: await kvGet('lastCollect'),
      collecting: isRunning(),
      roboLastSeen: await kvGet('roboLastSeen'),
      robo: await roboConfig(),
    };
  });

  /* Feed */
  app.get('/api/jobs', async (req) => {
    const { status = 'nova', min, q: text = '', ats = '', workplace = '', limit = '60', offset = '0', blocked = '0' } = req.query;
    // Feed normal usa a nota mínima do perfil; "mostrar todas" e as outras abas não filtram por nota
    const minScore = min != null ? Number(min) || 0 : status === 'nova' && blocked !== '1' ? (await getProfile()).preferencias.notaMinimaFeed || 0 : 0;
    const where = ['status = $1', 'score >= $2'];
    const params = [status, minScore];
    if (text) { params.push(`%${text}%`); where.push(`(data->>'title' ilike $${params.length} or data->>'company' ilike $${params.length})`); }
    if (ats) { params.push(ats); where.push(`ats = $${params.length}`); }
    if (workplace) { params.push(workplace); where.push(`data->>'workplace' = $${params.length}`); }
    if (blocked !== '1') where.push("(data->>'block') is null");
    params.push(Math.min(200, Number(limit) || 60), Number(offset) || 0);
    const { rows } = await q(`select * from jobs where ${where.join(' and ')} order by score desc, created_at desc limit $${params.length - 1} offset $${params.length}`, params);
    const { rows: c } = await q(`select count(*)::int n from jobs where ${where.join(' and ')}`, params.slice(0, -2));
    return { total: c[0].n, items: rows.map(summary) };
  });

  app.get('/api/jobs/:id', async (req, reply) => {
    const { rows } = await q('select * from jobs where id = $1', [req.params.id]);
    if (!rows[0]) return reply.code(404).send({ error: 'Vaga não encontrada.' });
    return full(rows[0]);
  });

  /* Mudar status: nova · triagem · descartada */
  app.post('/api/jobs/status', async (req, reply) => {
    const { ids = [], status } = req.body || {};
    if (!['nova', 'triagem', 'descartada'].includes(status)) return reply.code(400).send({ error: 'Status inválido.' });
    await q(
      `update jobs set status = $2, triage_pos = case when $2 = 'triagem' then extract(epoch from now()) + id / 1e6 else triage_pos end, updated_at = now()
       where id = any($1::int[]) and status <> 'minha'`,
      [ids.map(Number), status],
    );
    return { ok: true };
  });

  /* Modo Reels */
  app.get('/api/triagem', async () => {
    const { rows } = await q("select * from jobs where status = 'triagem' order by triage_pos asc nulls last, id limit 100");
    return rows.map(full);
  });
  app.post('/api/triagem/:id/depois', async (req) => {
    await q("update jobs set triage_pos = (select coalesce(max(triage_pos), 0) + 1 from jobs where status = 'triagem') where id = $1", [req.params.id]);
    return { ok: true };
  });
  app.post('/api/jobs/:id/minha', async (req) => {
    const a = await enqueue(Number(req.params.id));
    return { ok: true, application: a.id };
  });
  /* Desfazer o "É minha!" enquanto o robô ainda não começou */
  app.post('/api/jobs/:id/desfazer-minha', async (req, reply) => {
    const id = Number(req.params.id);
    const { rowCount } = await q("delete from applications where job_id = $1 and status = 'aguardando'", [id]);
    if (!rowCount) return reply.code(409).send({ error: 'O robô já começou essa candidatura.' });
    await q("update jobs set status = 'triagem', updated_at = now() where id = $1", [id]);
    return { ok: true };
  });

  /* Fila de aplicação */
  app.get('/api/applications', async () => {
    const { rows } = await q('select a.*, row_to_json(j) j from applications a join jobs j on j.id = a.job_id order by a.updated_at desc limit 300');
    return rows.map((r) => ({
      id: r.id, status: r.status, attempts: r.attempts, error: r.error, log: r.log, updatedAt: r.updated_at, createdAt: r.created_at, nextRunAt: r.next_run_at,
      job: summary({ ...r.j, data: r.j.data }),
    }));
  });
  app.post('/api/applications/:id/:action', async (req, reply) => {
    const id = Number(req.params.id);
    const actions = {
      'tentar-de-novo': ['aguardando', 'Você mandou tentar de novo'],
      cancelar: ['cancelada', 'Você cancelou'],
      'apliquei-eu': ['aplicada', 'Você aplicou manualmente'],
    };
    if (req.params.action === 'responder') {
      const { answers = [] } = req.body || {};
      const profile = await getProfile();
      for (const a of answers) {
        if (!a.pergunta || !a.resposta) continue;
        const i = profile.respostas.findIndex((r) => r.pergunta.toLowerCase() === a.pergunta.toLowerCase());
        if (i >= 0) profile.respostas[i].resposta = a.resposta; else profile.respostas.push({ pergunta: a.pergunta, resposta: a.resposta });
      }
      await saveProfile(profile);
      await setStatus(id, 'aguardando', `Você respondeu ${answers.length} pergunta(s); voltou para a fila`);
      return { ok: true };
    }
    const act = actions[req.params.action];
    if (!act) return reply.code(400).send({ error: 'Ação inválida.' });
    await setStatus(id, act[0], act[1]);
    return { ok: true };
  });

  /* Robô: ajustes e prints */
  app.get('/api/robo/config', async () => roboConfig());
  app.put('/api/robo/config', async (req) => {
    const b = req.body || {};
    const cur = await roboConfig();
    const num = (v, d, min, max) => (Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Number(v))) : d);
    const next = {
      ligado: b.ligado ?? cur.ligado,
      ensaio: b.ensaio ?? cur.ensaio,
      limiteDia: num(b.limiteDia, cur.limiteDia, 1, 100),
      horaInicio: num(b.horaInicio, cur.horaInicio, 0, 23),
      horaFim: num(b.horaFim, cur.horaFim, 1, 24),
      pausaMin: num(b.pausaMin, cur.pausaMin, 0, 60),
      pausaMax: num(b.pausaMax, cur.pausaMax, 0, 120),
    };
    await kvSet('roboConfig', next);
    return next;
  });
  app.get('/api/prints/:name', async (req, reply) => {
    const name = path.basename(req.params.name);
    const file = path.join(PRINTS, name);
    if (!/^\d+-\d+\.jpg$/.test(name) || !existsSync(file)) return reply.code(404).send({ error: 'Print não encontrado.' });
    return reply.type('image/jpeg').header('cache-control', 'private, max-age=86400').send(await readFile(file));
  });

  /* Perfil */
  app.get('/api/profile', async () => ({ ...(await getProfile()), temCurriculo: existsSync(CV) }));
  app.put('/api/profile', async (req) => {
    const { temCurriculo, ...p } = req.body || {};
    await saveProfile(p);
    const n = await rescoreAll();
    return { ok: true, rescored: n };
  });
  app.post('/api/profile/curriculo', async (req, reply) => {
    const { base64 } = req.body || {};
    const buf = Buffer.from(String(base64 || ''), 'base64');
    if (buf.subarray(0, 4).toString() !== '%PDF') return reply.code(400).send({ error: 'Envie o currículo em PDF.' });
    await mkdir(DATA, { recursive: true });
    await writeFile(CV, buf);
    return { ok: true };
  });
  app.get('/api/profile/curriculo', async (req, reply) => {
    if (!existsSync(CV)) return reply.code(404).send({ error: 'Nenhum currículo enviado.' });
    return reply.type('application/pdf').header('content-disposition', 'inline; filename="curriculo.pdf"').send(await readFile(CV));
  });

  /* Buscas */
  app.get('/api/collect', async () => {
    const { rows } = await q('select * from collector_runs order by id desc limit 30');
    return { running: isRunning(), activity: recentActivity(), runs: rows, last: await kvGet('lastCollect') };
  });
  app.post('/api/collect', async (req) => {
    if (isRunning()) return { ok: true, already: true };
    runCollectors(req.body?.source || null).catch((e) => app.log.error(e));
    return { ok: true };
  });

  /* Robô (fase 2): pega a próxima vaga e devolve o resultado. Protegido por token próprio. */
  const robo = (req, reply) => {
    const token = process.env.ROBO_TOKEN;
    if (!token || req.headers.authorization !== `Bearer ${token}`) { reply.code(401).send({ error: 'Token do robô inválido.' }); return false; }
    return true;
  };
  app.post('/api/public/robo/proxima', async (req, reply) => {
    if (!robo(req, reply)) return;
    await kvSet('roboLastSeen', new Date().toISOString());
    const config = await roboConfig();
    if (!config.ligado) return { pausado: true };
    const hora = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })) % 24;
    if (hora < config.horaInicio || hora >= config.horaFim) return { foraDoHorario: true };
    const { rows } = await q("select count(*)::int n from applications where status = 'aplicada' and (updated_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date");
    if (rows[0].n >= config.limiteDia) return { limite: true };
    const next = await claimNext();
    if (!next) return { vazia: true };
    return { ...next, profile: await getProfile(), temCurriculo: existsSync(CV), config };
  });
  app.post('/api/public/robo/:id/resultado', async (req, reply) => {
    if (!robo(req, reply)) return;
    const body = { ...(req.body || {}) };
    // Print da tela do robô: guardado no servidor, aparece no histórico da candidatura
    if (body.screenshot) {
      const name = `${Number(req.params.id)}-${Date.now()}.jpg`;
      await mkdir(PRINTS, { recursive: true });
      await writeFile(path.join(PRINTS, name), Buffer.from(String(body.screenshot), 'base64'));
      body.screenshot = name;
    }
    await report(Number(req.params.id), body);
    return { ok: true };
  });
  app.get('/api/public/robo/curriculo', async (req, reply) => {
    if (!robo(req, reply)) return;
    if (!existsSync(CV)) return reply.code(404).send({ error: 'Nenhum currículo enviado.' });
    return reply.type('application/pdf').send(await readFile(CV));
  });
}
