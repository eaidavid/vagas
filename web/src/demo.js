// Modo demonstração: as mesmas telas, sem servidor. As vagas são reais (buscadas no LinkedIn pelo teste);
// as ações ficam só na memória do navegador e o robô é simulado.
import seed from './demo-data.json';

const clone = (o) => JSON.parse(JSON.stringify(o));
const now = () => new Date().toISOString();

// 3 vagas boas ficam guardadas para o "Buscar agora" encontrar
const good = seed.jobs.filter((j) => !j.block);
const heldIds = new Set(good.slice(-3).map((j) => j.id));
let jobs = seed.jobs.filter((j) => !heldIds.has(j.id)).map((j) => ({ ...clone(j), status: 'nova' }));
const held = seed.jobs.filter((j) => heldIds.has(j.id)).map((j) => ({ ...clone(j), status: 'nova' }));
let profile = clone(seed.profile);
let apps = [];
let appSeq = 1;
let triagePos = 0;
let collecting = false;
const pedidos = [];
let lastCollect = { at: new Date(Date.now() - 2 * 3600000).toISOString(), summary: {} };
const activity = [];
const runs = [
  { source: 'linkedin', started_at: lastCollect.at, finished_at: lastCollect.at, found: 26, inserted: 26, error: null },
  { source: 'gupy', started_at: lastCollect.at, finished_at: lastCollect.at, found: 0, inserted: 0, error: 'demonstração: a Gupy entra quando o sistema estiver na VPS' },
];

const summary = (j) => { const { description, ...s } = j; return s; };
const log = (a, text, extra = {}) => { a.log.push({ at: now(), text, ...extra }); a.updatedAt = now(); };

/* Robô simulado: mostra o caminho que cada candidatura percorre */
function simulate(a) {
  const job = jobs.find((j) => j.id === a.jobId);
  setTimeout(() => {
    if (a.status !== 'aguardando') return;
    a.status = 'aplicando'; a.attempts += 1;
    a.progress = { pct: 15, texto: `Abrindo a vaga em ${job.atsInfo.nome}`, at: now() };
    log(a, `Robô abriu a candidatura em ${job.atsInfo.nome}`);
  }, 2500);
  setTimeout(() => { if (a.status === 'aplicando') a.progress = { pct: 45, texto: 'Preenchendo o formulário', at: now() }; }, 4000);
  setTimeout(() => { if (a.status === 'aplicando') a.progress = { pct: 80, texto: '14 campos preenchidos', at: now() }; }, 5500);
  setTimeout(() => {
    if (a.status !== 'aplicando') return;
    a.progress = null;
    if (job.atsInfo.robo === 'auto') {
      a.status = 'aplicada';
      log(a, 'Formulário preenchido com o seu perfil e enviado');
    } else {
      a.status = 'precisa_voce';
      a.error = 'O formulário tem uma pergunta que ainda não está no seu banco de respostas.';
      log(a, 'Parou numa pergunta nova', { questions: [{ pergunta: 'Tem disponibilidade para trabalhar como PJ?' }] });
    }
  }, 7000);
}

const ok = (data = { ok: true }) => data;
const fail = (status, error) => { throw Object.assign(new Error(error), { status }); };

export async function demoApi(path, { method = 'GET', body } = {}) {
  await new Promise((r) => setTimeout(r, 120));
  const [p, qs] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  let m;

  if (p === '/me' || p === '/login') return { id: 1, email: profile.email, name: profile.nome };
  if (p === '/logout') return ok();

  if (p === '/stats') {
    const count = (list) => list.reduce((acc, x) => ({ ...acc, [x.status]: (acc[x.status] || 0) + 1 }), {});
    return { jobs: count(jobs), applications: count(apps), novas24h: jobs.length, novasVisiveis: jobs.filter((j) => j.status === 'nova' && !j.block && j.score >= (profile.preferencias.notaMinimaFeed || 0)).length, lastCollect, collecting, roboLastSeen: now(), roboStatus: { estado: 'esperando' }, robo: { ligado: true, ensaio: false, limiteDia: 20, horaInicio: 8, horaFim: 22 }, aplicadasHoje: apps.filter((x) => x.status === 'aplicada').length, pedidos: pedidos.filter((x) => x.status === 'pendente').length };
  }

  if (p === '/jobs' && method === 'GET') {
    const status = query.status || 'nova';
    const blocked = query.blocked === '1';
    const min = status === 'nova' && !blocked ? profile.preferencias.notaMinimaFeed || 0 : 0;
    const text = (query.q || '').toLowerCase();
    let list = jobs.filter((j) => j.status === status && j.score >= min && (blocked || !j.block));
    if (query.workplace) list = list.filter((j) => j.workplace === query.workplace);
    if (text) list = list.filter((j) => `${j.title} ${j.company}`.toLowerCase().includes(text));
    list.sort((a, b) => b.score - a.score);
    return { total: list.length, items: list.map(summary) };
  }
  if ((m = p.match(/^\/jobs\/(\d+)$/))) return jobs.find((j) => j.id === Number(m[1])) || fail(404, 'Vaga não encontrada.');
  if (p === '/jobs/status') {
    for (const j of jobs) if (body.ids.includes(j.id) && j.status !== 'minha') { j.status = body.status === 'triagem' ? 'nova' : body.status; j.triagePos = 0; }
    return ok();
  }
  if (p === '/triagem') return jobs.filter((j) => j.status === 'nova' && !j.block && j.score >= (profile.preferencias.notaMinimaFeed || 0)).sort((a, b) => (a.triagePos || 0) - (b.triagePos || 0) || b.score - a.score);
  if ((m = p.match(/^\/triagem\/(\d+)\/depois$/))) { const j = jobs.find((x) => x.id === Number(m[1])); j.triagePos = ++triagePos; return ok(); }
  if ((m = p.match(/^\/jobs\/(\d+)\/minha$/))) {
    const j = jobs.find((x) => x.id === Number(m[1]));
    j.status = 'minha';
    const a = { id: appSeq++, jobId: j.id, status: 'aguardando', attempts: 0, error: null, log: [], createdAt: now(), updatedAt: now() };
    log(a, 'Entrou na fila de aplicação');
    apps.unshift(a);
    simulate(a);
    return ok({ ok: true, application: a.id });
  }
  if ((m = p.match(/^\/jobs\/(\d+)\/desfazer-minha$/))) {
    const id = Number(m[1]);
    const a = apps.find((x) => x.jobId === id);
    if (a && a.status !== 'aguardando') fail(409, 'O robô já começou essa candidatura.');
    apps = apps.filter((x) => x.jobId !== id);
    jobs.find((x) => x.id === id).status = 'nova';
    return ok();
  }

  if (p === '/applications') {
    return apps.map((a) => ({ ...a, job: summary(jobs.find((j) => j.id === a.jobId)) })).sort((x, y) => (y.updatedAt > x.updatedAt ? 1 : -1));
  }
  if ((m = p.match(/^\/applications\/(\d+)\/(.+)$/))) {
    const a = apps.find((x) => x.id === Number(m[1]));
    const action = m[2];
    if (action === 'responder') {
      for (const ans of body.answers) if (ans.pergunta && ans.resposta) profile.respostas.push({ pergunta: ans.pergunta, resposta: ans.resposta });
      a.status = 'aguardando'; a.error = null;
      log(a, `Você respondeu ${body.answers.length} pergunta(s); voltou para a fila`);
      setTimeout(() => { a.status = 'aplicando'; a.attempts += 1; log(a, 'Robô voltou para a candidatura'); }, 2000);
      setTimeout(() => { if (a.status === 'aplicando') { a.status = 'aplicada'; log(a, 'Usou a sua resposta e enviou'); } }, 5000);
      return ok();
    }
    const map = { 'tentar-de-novo': ['aguardando', 'Você mandou tentar de novo'], cancelar: ['cancelada', 'Você cancelou'], 'apliquei-eu': ['aplicada', 'Você aplicou manualmente'] };
    const [status, text] = map[action];
    a.status = status; a.error = null;
    log(a, text);
    if (status === 'aguardando') simulate(a);
    return ok();
  }

  if (p === '/pedidos' && method === 'GET') return pedidos;
  if (p === '/pedidos') {
    const j = jobs.find((x) => x.id === body.jobId);
    const r = { id: pedidos.length + 1, tipo: body.tipo, jobId: body.jobId, titulo: j?.title, status: 'pendente', createdAt: now() };
    pedidos.unshift(r);
    // Na demonstração o "Claude" responde sozinho depois de alguns segundos
    setTimeout(() => {
      r.status = 'feito'; r.resultado = 'Feito (simulado)';
      if (j && body.tipo === 'analisar') j.claude = { nota: Math.min(95, j.score), resumo: 'Simulação: aqui aparece a análise que o Claude escreve pelo conector, com o encaixe da vaga no seu currículo.', pontosFortes: j.skills.slice(0, 3).map((s) => `Pede ${s}, que você já usa`), riscos: [] };
    }, 4000);
    return { ok: true, id: r.id };
  }
  if (p === '/profile' && method === 'GET') return clone(profile);
  if (p === '/profile' && method === 'PUT') { const { temCurriculo, ...rest } = body; profile = { ...rest, temCurriculo: true }; return ok({ ok: true, rescored: jobs.length }); }
  if (p === '/profile/curriculo') return ok();

  if (p === '/collect' && method === 'GET') return { running: collecting, activity: activity.slice(-30), runs: [...runs].reverse(), last: lastCollect };
  if (p === '/collect' && method === 'POST') {
    if (collecting) return ok({ ok: true, already: true });
    collecting = true;
    const run = { source: 'linkedin', started_at: now(), finished_at: null, found: 0, inserted: 0, error: null };
    runs.push(run);
    activity.push({ at: now(), text: 'linkedin: buscando' });
    held.forEach((j, i) => setTimeout(() => {
      jobs.push({ ...j, postedAt: now() });
      run.found += 9; run.inserted += 1;
      activity.push({ at: now(), text: `LinkedIn: nova vaga "${j.title}"` });
    }, 2500 + i * 2000));
    setTimeout(() => {
      collecting = false;
      run.finished_at = now();
      lastCollect = { at: now(), summary: { linkedin: { found: run.found, inserted: run.inserted } } };
      activity.push({ at: now(), text: `linkedin: ${run.found} vagas lidas, ${run.inserted} novas` });
    }, 2500 + held.length * 2000 + 500);
    return ok();
  }

  return fail(404, 'Não encontrado.');
}
