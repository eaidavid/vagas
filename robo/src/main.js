// Robô de candidatura: pede a próxima vaga da fila, aplica e devolve o resultado.
// Uma vaga por vez, com pausa entre candidaturas e limite por dia (configurados no Perfil do painel).
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { applyJob } from './apply.js';

const API = process.env.API_URL || 'http://vagas:3000';
const TOKEN = process.env.ROBO_TOKEN;
const PROFILE_DIR = process.env.BROWSER_DIR || '/data/browser';
const RESUME = '/tmp/curriculo.pdf';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (t) => console.log(`${new Date().toISOString()} ${t}`);

async function call(path, body) {
  const res = await fetch(`${API}/api/public/robo${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${path}: HTTP ${res.status}`);
  return res.headers.get('content-type')?.includes('json') ? res.json() : Buffer.from(await res.arrayBuffer());
}

async function resume() {
  try { await writeFile(RESUME, await call('/curriculo')); return RESUME; } catch { return null; }
}

if (!TOKEN) { console.error('Defina ROBO_TOKEN'); process.exit(1); }

// Navegador com perfil salvo: os logins feitos pela tela do robô (LinkedIn, Gupy) continuam valendo
const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: !process.env.DISPLAY,
  viewport: { width: 1280, height: 860 },
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  ...(process.env.ROBO_PROXY ? { proxy: { server: process.env.ROBO_PROXY } } : {}),
});
if (!context.pages().length) await context.newPage();
log(`robô ligado (${process.env.DISPLAY ? 'com tela' : 'sem tela'}), API ${API}`);

let idle = 0;
for (;;) {
  let next;
  try {
    next = await call('/proxima', {});
  } catch (e) {
    log(`sem contato com a API: ${e.message}`);
    await sleep(30000);
    continue;
  }
  if (next.vazia || next.pausado || next.limite || next.foraDoHorario) {
    if (idle++ % 20 === 0) log(next.pausado ? 'pausado no painel' : next.limite ? 'limite do dia atingido' : next.foraDoHorario ? 'fora do horário' : 'fila vazia');
    await sleep(30000);
    continue;
  }
  idle = 0;
  const { application, job, profile, config, contas = {} } = next;
  const ensaio = config.ensaio && !application.enviar;
  log(`candidatura ${application.id}: ${job.data.title} · ${job.data.company} (${job.ats})${ensaio ? ' [ensaio]' : ''}`);
  // Progresso ao vivo para o painel: etapa, porcentagem e, quando vale, um print da tela
  const progress = async (pct, texto, page = null) => {
    try {
      const shot = page ? (await page.screenshot({ type: 'jpeg', quality: 45 }).catch(() => null))?.toString('base64') : undefined;
      await call(`/${application.id}/progresso`, { pct, texto, screenshot: shot });
    } catch { /* progresso é só informativo */ }
  };
  const result = await Promise.race([
    applyJob(context, { job, profile, resumePath: await resume(), ensaio, contas, log: (t) => log(`  ${t}`), progress }),
    sleep(6 * 60000).then(() => ({ status: 'erro', text: 'Demorou demais', error: 'A candidatura passou de 6 minutos.' })),
  ]);
  log(`  resultado: ${result.status} · ${result.text}`);
  try { await call(`/${application.id}/resultado`, result); } catch (e) { log(`  não consegui avisar a API: ${e.message}`); }

  // Pausa entre candidaturas, com variação, para manter um ritmo humano
  const [min, max] = [config.pausaMin ?? 2, config.pausaMax ?? 6];
  if (result.status === 'aplicada' && !ensaio) await sleep((min + Math.random() * (max - min)) * 60000);
  else await sleep(5000);
}
