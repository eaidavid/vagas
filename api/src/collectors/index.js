// Orquestra as buscas: roda cada fonte, dá nota, junta vagas repetidas e guarda.
import { q, kvGet, kvSet } from '../db.js';
import { getProfile } from '../profile.js';
import { scoreJob, norm } from '../scoring.js';
import { detectAts, applyKey } from '../ats.js';
import { htmlToText } from './http.js';
import { collectLinkedin } from './linkedin.js';
import { collectGupy } from './gupy.js';
import { collectGreenhouse, collectLever } from './boards.js';
import { collectRemotar, collectProgramathor, collectGithub } from './extras.js';

const activity = [];
export const recentActivity = () => activity.slice(-80);
const log = (text) => {
  activity.push({ at: new Date().toISOString(), text });
  if (activity.length > 200) activity.shift();
  console.log(`[busca] ${text}`);
};

const keyText = (s) => norm(s).replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
export const dedupeKey = (j) => `${keyText(j.company)}|${keyText(j.title)}`;

function inferWorkplace(job) {
  if (job.workplace) return job.workplace;
  const t = norm(`${job.title} ${job.location} ${job.description.slice(0, 3000)}`);
  if (/\b(100% remot|totalmente remot|trabalho remoto|modelo remoto|home ?office|remote)\b/.test(t)) return 'remoto';
  if (/\bhibrid|\bhybrid/.test(t)) return 'hibrido';
  if (/\bpresencial\b|\bon-?site\b/.test(t)) return 'presencial';
  return null;
}

function resolveAts(job) {
  if (job.applyMode === 'email') return 'email';
  if (job.source === 'linkedin') {
    if (job.applyMode === 'easy') return 'linkedin_easy';
    if (job.applyUrl) return detectAts(job.applyUrl);
    if (job.applyMode === 'externo') return 'linkedin_externo';
    return 'linkedin';
  }
  return detectAts(job.applyUrl || job.url);
}

export function finalize(raw, prefs) {
  const job = { ...raw };
  job.description = htmlToText(raw.descriptionHtml || raw.description || '').slice(0, 15000);
  delete job.descriptionHtml;
  job.workplace = inferWorkplace(job);
  job.ats = resolveAts(job);
  const s = scoreJob(job, prefs);
  job.reasons = s.reasons;
  job.block = s.block;
  job.skills = s.skills;
  job.intern = s.intern;
  job.area = s.area;
  job.score = s.score;
  return job;
}

const VAGUE = new Set(['linkedin', 'linkedin_externo', 'desconhecido']);

async function upsert(job) {
  const dk = dedupeKey(job);
  const ak = applyKey(job.applyUrl);
  const { rows } = await q('select id, ats, data from jobs where dedupe_key = $1 or (apply_key is not null and apply_key = $2) limit 1', [dk, ak]);
  const fonte = { source: job.source, url: job.url };
  if (!rows[0]) {
    const data = { ...job, fontes: [fonte], firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString() };
    await q('insert into jobs(dedupe_key, apply_key, source, external_id, score, ats, data) values ($1,$2,$3,$4,$5,$6,$7) on conflict (dedupe_key) do nothing', [dk, ak, job.source, job.externalId, job.score, job.ats, data]);
    return 'new';
  }
  // Já existe: registra a nova fonte e, se ela diz melhor onde aplicar, atualiza
  const cur = rows[0];
  const data = cur.data;
  data.lastSeen = new Date().toISOString();
  data.fontes = data.fontes || [];
  if (!data.fontes.some((f) => f.url === fonte.url)) data.fontes.push(fonte);
  let ats = cur.ats;
  let applyK = applyKey(data.applyUrl);
  if (VAGUE.has(cur.ats) && !VAGUE.has(job.ats)) {
    ats = job.ats;
    data.ats = job.ats;
    data.applyUrl = job.applyUrl;
    data.applyMode = job.applyMode;
    applyK = ak;
  }
  if (!data.description && job.description) data.description = job.description;
  await q('update jobs set data = $2, ats = $3, apply_key = $4, updated_at = now() where id = $1', [cur.id, data, ats, applyK]);
  return 'seen';
}

async function known(source, externalId) {
  const { rows } = await q('select 1 from jobs where source = $1 and external_id = $2 limit 1', [source, externalId]);
  return rows.length > 0;
}

let running = false;
export const isRunning = () => running;

export async function runCollectors(only = null) {
  if (running) return { skipped: true };
  running = true;
  const profile = await getProfile();
  const prefs = profile.preferencias;
  const prefilter = (raw) => {
    const s = scoreJob({ ...raw, description: '' }, prefs);
    return !['area', 'nivel', 'local'].includes(s.block) && s.score >= 35;
  };
  const sources = [
    ['linkedin', (emit) => collectLinkedin({ termos: prefs.termos, cidades: prefs.cidadesPresencial }, { prefilter, known, log, emit })],
    ['gupy', (emit) => collectGupy({ termos: prefs.termos }, { log, emit })],
    ['remotar', (emit) => collectRemotar({ termos: prefs.termos }, { log, emit })],
    ['programathor', (emit) => collectProgramathor({}, { log, emit, prefilter })],
    ['github', (emit) => collectGithub({}, { log, emit })],
    ['greenhouse', (emit) => (profile.empresas.greenhouse.length ? collectGreenhouse(profile.empresas.greenhouse, { log, emit }) : 0)],
    ['lever', (emit) => (profile.empresas.lever.length ? collectLever(profile.empresas.lever, { log, emit }) : 0)],
  ].filter(([name]) => !only || only === name);

  const summary = {};
  try {
    for (const [name, fn] of sources) {
      const { rows } = await q('insert into collector_runs(source) values ($1) returning id', [name]);
      const runId = rows[0].id;
      log(`${name}: buscando`);
      let found = 0, inserted = 0, error = null;
      // Cada vaga é gravada assim que chega: aparece no feed durante a busca e nada se perde se a busca cair
      const emit = async (raw) => {
        found++;
        if (!raw.title) return;
        try {
          if ((await upsert(finalize(raw, prefs))) === 'new') inserted++;
          if (found % 10 === 0) await q('update collector_runs set found = $2, inserted = $3 where id = $1', [runId, found, inserted]);
        } catch (e) {
          log(`${name}: não deu para salvar "${raw.title}" (${e.message})`);
        }
      };
      try {
        await fn(emit);
        log(`${name}: ${found} vagas lidas, ${inserted} novas`);
      } catch (e) {
        error = e.message;
        log(`${name}: erro (${e.message})`);
      }
      await q('update collector_runs set finished_at = now(), found = $2, inserted = $3, error = $4 where id = $1', [runId, found, inserted, error]);
      summary[name] = { found, inserted, error };
    }
    await kvSet('lastCollect', { at: new Date().toISOString(), summary });
  } finally {
    running = false;
  }
  return summary;
}

/* Recalcula a nota de todas as vagas (depois de mudar o perfil) */
export async function rescoreAll() {
  const profile = await getProfile();
  const { rows } = await q("select id, data from jobs where status in ('nova', 'triagem')");
  for (const r of rows) {
    const s = scoreJob(r.data, profile.preferencias);
    const data = { ...r.data, reasons: s.reasons, block: s.block, skills: s.skills, intern: s.intern, area: s.area, score: s.score };
    await q('update jobs set score = $2, data = $3 where id = $1', [r.id, s.score, data]);
  }
  return rows.length;
}

/* Agenda: roda a cada N horas (padrão 6), sem sobrepor */
export function startScheduler() {
  const hours = Number(process.env.COLLECT_EVERY_HOURS || 6);
  if (!hours) return;
  const tick = async () => {
    const last = await kvGet('lastCollect');
    const due = !last || Date.now() - new Date(last.at).getTime() > hours * 3600000;
    if (due) runCollectors().catch((e) => log(`agenda: ${e.message}`));
  };
  setTimeout(tick, 15000);
  setInterval(tick, 10 * 60000);
}
