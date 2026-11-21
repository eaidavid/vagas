// Uma candidatura do começo ao fim: abre a vaga, entra no formulário (direto, modal do LinkedIn,
// etapas da Gupy ou site externo), preenche etapa por etapa e envia. Em modo ensaio, para antes de enviar.
import { fillForm, findButton, hasCaptcha, successText, formErrors, SUBMIT, NEXT } from './fill.js';

const NEXT_RE = new RegExp(`${NEXT.source}|salvar e (continuar|avan[cç]ar)|ir para (a )?pr[oó]xima`, 'i');
const ENTRY = {
  linkedin_easy: /candidatura simplificada|easy apply/i,
  linkedin: /candidatura simplificada|easy apply|candidatar-se|^apply$|^candidatar/i,
  linkedin_externo: /candidatar-se|^apply|^candidatar/i,
  gupy: /candidatar-se|candidatar|aplicar para a vaga|quero me candidatar/i,
  generic: /candidatar|candidate-se|apply|aplicar|inscrever|inscreva-se|quero participar/i,
};
const MODAL = '.jobs-easy-apply-modal, .artdeco-modal[role="dialog"], [data-test-modal][role="dialog"]';

export function hostAts(url) {
  const h = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
  if (/gupy\.io$/.test(h)) return 'gupy';
  if (/lever\.co$/.test(h)) return 'lever';
  if (/greenhouse\.io$/.test(h)) return 'greenhouse';
  if (/linkedin\.com$/.test(h)) return 'linkedin';
  return 'site';
}

async function needsLogin(page, ats) {
  const url = page.url();
  if (ats.startsWith('linkedin')) return /\/(login|authwall|checkpoint|uas\/login|signup)/.test(url);
  if (ats === 'gupy') return /signin|login|\/auth|cadastro/.test(url) || (await page.locator('input[type=password]:visible').count()) > 0;
  return false;
}

const shot = async (page) => (await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false }).catch(() => null))?.toString('base64') || null;

/**
 * Devolve o resultado para a API: { status: 'aplicada' | 'precisa_voce' | 'erro', text, error, questions, filled, screenshot }
 */
export async function applyJob(context, { job, profile, resumePath, ensaio, log = () => {} }) {
  const d = job.data;
  let ats = job.ats;
  let page = await context.newPage();
  const filledAll = [];
  const done = async (status, text, extra = {}) => ({ status, text, filled: filledAll, screenshot: await shot(page), ...extra });

  try {
    let url = d.applyUrl || d.url;
    if (ats === 'lever' && !/\/apply\/?$/.test(url)) url = url.replace(/\/?$/, '/apply');
    if (ats.startsWith('linkedin')) url = d.url;
    log(`abrindo ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);

    if (await needsLogin(page, ats)) return await done('precisa_voce', 'Pediu login', { error: `Faça login ${ats.startsWith('linkedin') ? 'no LinkedIn' : 'na Gupy'} pela tela do robô (Perfil → Robô) e toque em Tentar de novo.` });

    /* Entrada no formulário */
    let scope = null;
    const hasForm = async () => (await page.locator('form input:visible, form textarea:visible, form select:visible').count()) > 1;
    if (ats.startsWith('linkedin') || ats === 'gupy' || !(await hasForm())) {
      const entry = await findButton(page, ENTRY[ats] || ENTRY.generic);
      if (!entry) {
        if (ats.startsWith('linkedin') && /candidatura (já )?enviada|applied|você se candidatou/i.test(await page.locator('main').innerText().catch(() => ''))) {
          return await done('aplicada', 'O LinkedIn já mostra essa vaga como candidatada');
        }
        if (!(await hasForm())) return await done('precisa_voce', 'Não achei o botão de candidatura', { error: 'O robô não encontrou como se candidatar nesta página. Abra a vaga e veja.' });
      } else {
        const label = (await entry.innerText().catch(() => '')).trim();
        log(`clicando "${label}"`);
        const popup = context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
        await entry.click();
        const newPage = await popup;
        if (newPage) {
          await newPage.waitForLoadState('domcontentloaded').catch(() => {});
          page = newPage;
        }
        await page.waitForTimeout(3500);
        if (ats.startsWith('linkedin') && (await page.locator(MODAL).count())) scope = MODAL;
        else if (hostAts(page.url()) !== hostAts(url)) {
          // LinkedIn levou para outro site: segue com o sistema de lá
          ats = hostAts(page.url());
          log(`vaga levou para ${page.url()} (${ats})`);
          if (ats === 'gupy' || ats === 'site') {
            const again = await findButton(page, ENTRY[ats] || ENTRY.generic);
            if (again && !(await hasForm())) { await again.click(); await page.waitForTimeout(3500); }
          }
        }
        if (await needsLogin(page, ats)) return await done('precisa_voce', 'Pediu login', { error: `O site pediu login (${new URL(page.url()).hostname}). Faça login pela tela do robô e toque em Tentar de novo.` });
      }
    }

    /* Etapas */
    let lastErrors = '';
    for (let step = 1; step <= 12; step++) {
      if (await hasCaptcha(page)) return await done('precisa_voce', 'CAPTCHA', { error: 'O site mostrou um CAPTCHA. Termine pela tela do robô ou aplique você mesmo.' });
      const { filled, unknown } = await fillForm(page, { profile, job: d, resumePath, scope });
      filledAll.push(...filled);
      log(`etapa ${step}: ${filled.length} campos preenchidos, ${unknown.length} sem resposta`);
      if (unknown.length) {
        return await done('precisa_voce', `Parou em ${unknown.length} pergunta(s) nova(s)`, { error: 'Responda as perguntas abaixo e o robô continua (as respostas ficam guardadas).', questions: unknown });
      }
      const next = await findButton(page, NEXT_RE, scope);
      const submit = next ? null : await findButton(page, SUBMIT, scope);
      if (submit) {
        if (ensaio) return await done('precisa_voce', 'Ensaio: formulário preenchido, não enviado', { error: 'Modo ensaio ligado: o robô preencheu tudo e parou antes de enviar. Confira o print e, se estiver certo, desligue o ensaio no Perfil.' });
        log('enviando');
        await submit.click();
        for (let i = 0; i < 15; i++) {
          await page.waitForTimeout(1000);
          if (await successText(page)) return await done('aplicada', 'Candidatura enviada');
          if (scope && !(await page.locator(scope).count())) return await done('aplicada', 'Candidatura enviada (o modal fechou)');
        }
        if (await hasCaptcha(page)) return await done('precisa_voce', 'CAPTCHA no envio', { error: 'O site pediu CAPTCHA na hora de enviar. Termine pela tela do robô ou aplique você mesmo.' });
        const errs = await formErrors(page);
        if (errs.length) return await done('precisa_voce', 'O site recusou o envio', { error: `O site apontou: ${errs.join(' · ')}` });
        return await done('aplicada', 'Enviada, mas o site não mostrou uma confirmação clara (veja o print)');
      }
      if (!next) return await done('precisa_voce', 'Não achei o botão de enviar', { error: 'O robô preencheu o que conseguiu, mas não achou como avançar. Veja o print.' });
      await next.click();
      await page.waitForTimeout(2500);
      const errs = (await formErrors(page)).join(' · ');
      if (errs && errs === lastErrors) return await done('precisa_voce', 'Travou numa etapa', { error: `O site não deixou avançar: ${errs}` });
      lastErrors = errs;
    }
    return await done('precisa_voce', 'Formulário longo demais', { error: 'Passou de 12 etapas; termine você mesmo.' });
  } catch (e) {
    return await done('erro', 'Erro durante a candidatura', { error: e.message.split('\n')[0].slice(0, 300) });
  } finally {
    // mantém só a primeira aba aberta (sessões de login ficam no perfil do navegador)
    for (const p of context.pages().slice(1)) await p.close().catch(() => {});
  }
}
