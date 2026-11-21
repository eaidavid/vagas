// Uma candidatura do começo ao fim: abre a vaga, faz login se precisar, entra no formulário
// (direto, modal do LinkedIn, etapas da Gupy ou site externo), preenche etapa por etapa e envia.
// Em modo ensaio, para antes de enviar.
import { fillForm, findButton, hasCaptcha, successText, formErrors, safeClick, SUBMIT, NEXT } from './fill.js';
import { linkedinGuest, loginLinkedin, gupyNeedsLogin, loginGupy, LI_SIGNIN_MODAL } from './login.js';

const NEXT_RE = new RegExp(`${NEXT.source}|salvar e (continuar|avan[cç]ar)|ir para (a )?pr[oó]xima`, 'i');
const ENTRY = {
  linkedin_easy: /candidatura simplificada|easy apply/i,
  linkedin: /candidatura simplificada|easy apply|candidatar-se|^apply$|^candidatar/i,
  linkedin_externo: /candidatar-se|^apply|^candidatar/i,
  gupy: /candidatar-se|candidatar|aplicar para a vaga|quero me candidatar/i,
  generic: /candidatar|candidate-se|apply|aplicar|inscrever|inscreva-se|quero participar/i,
};
// Modal da Candidatura simplificada (não confundir com a janela de "Cadastre-se ou entre")
const MODAL = '.jobs-easy-apply-modal, .jobs-easy-apply-content, [data-test-modal][role="dialog"]:has(form), .artdeco-modal[role="dialog"]:has(form)';

export function hostAts(url) {
  const h = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
  if (/gupy\.io$/.test(h)) return 'gupy';
  if (/lever\.co$/.test(h)) return 'lever';
  if (/greenhouse\.io$/.test(h)) return 'greenhouse';
  if (/linkedin\.com$/.test(h)) return 'linkedin';
  return 'site';
}

/* Erros técnicos do navegador em português */
function friendlyError(e) {
  const m = String(e?.message || e).split('\n')[0];
  if (/Timeout .*exceeded/i.test(m) && /click/i.test(m)) return 'Uma tela na frente travou o clique (pedido de login, aviso de cookies ou pop-up). Veja o print; se for login, salve a conta em Perfil → Robô ou entre pela tela do robô.';
  if (/Timeout .*exceeded/i.test(m)) return 'O site demorou demais para responder. O robô tenta de novo mais tarde.';
  if (/ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_TUNNEL|net::/i.test(m)) return 'Não foi possível abrir o site da vaga (conexão recusada ou site fora do ar). O robô tenta de novo mais tarde.';
  if (/Target (page|closed)|has been closed/i.test(m)) return 'A página fechou no meio da candidatura. O robô tenta de novo mais tarde.';
  return m.slice(0, 300);
}

const shot = async (page) => (await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false }).catch(() => null))?.toString('base64') || null;

const LOGIN_MSG = {
  sem_conta: (site) => `O ${site} pediu login. Salve o e-mail e a senha do ${site} em Perfil → Robô → Contas (ou entre pela tela do robô) e toque em Tentar de novo.`,
  verificacao: (site) => `O ${site} pediu um código de verificação. Abra a tela do robô (Perfil → Robô), confirme o código e toque em Tentar de novo.`,
  falhou: (site) => `O login no ${site} não deu certo. Confira o e-mail e a senha em Perfil → Robô → Contas ou entre pela tela do robô.`,
};

/**
 * Devolve o resultado para a API: { status: 'aplicada' | 'precisa_voce' | 'erro', text, error, questions, filled, screenshot }
 */
export async function applyJob(context, { job, profile, resumePath, ensaio, contas = {}, log = () => {}, progress = async () => {} }) {
  const d = job.data;
  let ats = job.ats;
  let page = await context.newPage();
  const filledAll = [];
  const done = async (status, text, extra = {}) => ({ status, text, filled: filledAll, screenshot: await shot(page), ...extra });

  // Faz login e volta para a vaga. Devolve null se deu certo, ou o resultado de "precisa de você".
  const ensureLinkedin = async (backTo) => {
    if (!(await linkedinGuest(page))) return null;
    await progress(15, 'Entrando no LinkedIn com a sua conta');
    const r = await loginLinkedin(page, contas.linkedin, log);
    if (r !== 'ok') return done('precisa_voce', 'O LinkedIn pediu login', { error: LOGIN_MSG[r]('LinkedIn') });
    log('login no LinkedIn ok');
    await page.goto(backTo, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    if (await linkedinGuest(page)) return done('precisa_voce', 'O LinkedIn pediu login', { error: LOGIN_MSG.falhou('LinkedIn') });
    await progress(22, 'Logado no LinkedIn', page);
    return null;
  };
  const ensureGupy = async () => {
    if (!(await gupyNeedsLogin(page))) return null;
    await progress(32, 'Entrando na Gupy com a sua conta');
    const r = await loginGupy(page, contas.gupy, log);
    if (r !== 'ok') return done('precisa_voce', 'A Gupy pediu login', { error: LOGIN_MSG[r]('Gupy') });
    log('login na Gupy ok');
    await page.waitForTimeout(2000);
    return null;
  };

  try {
    let url = d.applyUrl || d.url;
    if (ats === 'lever' && !/\/apply\/?$/.test(url)) url = url.replace(/\/?$/, '/apply');
    if (ats.startsWith('linkedin')) url = d.url;
    log(`abrindo ${url}`);
    await progress(10, `Abrindo a vaga em ${new URL(url).hostname.replace(/^www\./, '')}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    await progress(20, 'Vaga aberta', page);

    if (ats.startsWith('linkedin')) { const stop = await ensureLinkedin(url); if (stop) return await stop; }
    if (ats === 'gupy') { const stop = await ensureGupy(); if (stop) return await stop; }

    /* Entrada no formulário */
    let scope = null;
    let entryLabel = null;
    const hasForm = async () => (await page.locator('form input:visible, form textarea:visible, form select:visible').count()) > 1;
    if (ats.startsWith('linkedin') || ats === 'gupy' || !(await hasForm())) {
      let entry = await findButton(page, ENTRY[ats] || ENTRY.generic);
      if (!entry) {
        if (ats.startsWith('linkedin') && /candidatura (já )?enviada|applied|você se candidatou|candidatou-se/i.test(await page.locator('main').innerText().catch(() => ''))) {
          return await done('aplicada', 'O LinkedIn já mostra essa vaga como candidatada');
        }
        if (!(await hasForm())) return await done('precisa_voce', 'Não achei o botão de candidatura', { error: 'O robô não encontrou como se candidatar nesta página. Abra a vaga e veja.' });
      } else {
        entryLabel = (await entry.innerText().catch(() => '')).trim();
        for (let attempt = 1; attempt <= 2; attempt++) {
          log(`clicando "${entryLabel}"`);
          await progress(30, `Clicando em "${entryLabel.slice(0, 40)}"`);
          const popup = context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
          await safeClick(page, entry);
          const newPage = await popup;
          if (newPage) {
            await newPage.waitForLoadState('domcontentloaded').catch(() => {});
            page = newPage;
          }
          await page.waitForTimeout(3500);
          // Abriu "Cadastre-se ou entre": faz login e tenta de novo uma vez
          if (attempt === 1 && hostAts(page.url()) === 'linkedin' && ((await page.locator(LI_SIGNIN_MODAL).filter({ visible: true }).count()) || (await linkedinGuest(page)))) {
            const stop = await ensureLinkedin(url);
            if (stop) return await stop;
            entry = await findButton(page, ENTRY[ats] || ENTRY.generic);
            if (!entry) return await done('precisa_voce', 'Não achei o botão de candidatura', { error: 'Depois do login o robô não encontrou o botão de candidatura. Abra a vaga e veja.' });
            continue;
          }
          break;
        }
        if (hostAts(page.url()) === 'linkedin') {
          if (await page.locator(MODAL).filter({ visible: true }).count()) scope = MODAL;
          else return await done('precisa_voce', 'O formulário não abriu', { error: `O robô clicou em "${entryLabel}", mas o formulário do LinkedIn não apareceu. Veja o print.` });
        } else if (hostAts(page.url()) !== hostAts(url)) {
          // LinkedIn levou para outro site: segue com o sistema de lá
          ats = hostAts(page.url());
          log(`vaga levou para ${page.url()} (${ats})`);
          await progress(35, `A vaga levou para ${new URL(page.url()).hostname}`, page);
          if (ats === 'gupy') { const stop = await ensureGupy(); if (stop) return await stop; }
          if (ats === 'gupy' || ats === 'site') {
            const again = await findButton(page, ENTRY[ats] || ENTRY.generic);
            if (again && !(await hasForm())) {
              await safeClick(page, again);
              await page.waitForTimeout(3500);
              if (ats === 'gupy') { const stop = await ensureGupy(); if (stop) return await stop; }
            }
          }
        } else if (ats === 'gupy') {
          const stop = await ensureGupy();
          if (stop) return await stop;
        }
      }
    }

    /* Etapas */
    let lastErrors = '';
    for (let step = 1; step <= 12; step++) {
      if (await hasCaptcha(page)) return await done('precisa_voce', 'CAPTCHA', { error: 'O site mostrou um CAPTCHA. Termine pela tela do robô ou aplique você mesmo.' });
      await progress(Math.min(40 + step * 10, 80), step === 1 ? 'Preenchendo o formulário' : `Preenchendo a etapa ${step}`);
      const { filled, unknown } = await fillForm(page, { profile, job: d, resumePath, scope });
      filledAll.push(...filled);
      log(`etapa ${step}: ${filled.length} campos preenchidos, ${unknown.length} sem resposta`);
      await progress(Math.min(45 + step * 10, 85), `${filledAll.length} campos preenchidos${unknown.length ? `, ${unknown.length} sem resposta` : ''}`, page);
      if (unknown.length) {
        return await done('precisa_voce', `Parou em ${unknown.length} pergunta(s) nova(s)`, { error: 'Responda as perguntas abaixo e o robô continua (as respostas ficam guardadas).', questions: unknown });
      }
      const next = await findButton(page, NEXT_RE, scope, entryLabel);
      const submit = next ? null : await findButton(page, SUBMIT, scope, entryLabel);
      if (submit) {
        // Trava: sem nenhum campo preenchido não é formulário de candidatura (ex.: tela de login)
        if (!filledAll.length) return await done('precisa_voce', 'Não achei o formulário', { error: 'O robô não encontrou campos para preencher nesta página. Veja o print.' });
        if (ensaio) return await done('precisa_voce', 'Ensaio: formulário preenchido, não enviado', { error: 'Modo ensaio: o robô preencheu tudo e parou antes de enviar. Confira o print e toque em "Está certo, enviar". Para enviar todas direto, desligue o ensaio em Perfil → Robô.' });
        log('enviando');
        await progress(92, 'Enviando a candidatura');
        await safeClick(page, submit);
        for (let i = 0; i < 15; i++) {
          await page.waitForTimeout(1000);
          if (await successText(page)) return await done('aplicada', 'Candidatura enviada');
          if (scope && !(await page.locator(scope).filter({ visible: true }).count())) return await done('aplicada', 'Candidatura enviada (o formulário do LinkedIn fechou)');
        }
        if (await hasCaptcha(page)) return await done('precisa_voce', 'CAPTCHA no envio', { error: 'O site pediu CAPTCHA na hora de enviar. Termine pela tela do robô ou aplique você mesmo.' });
        const errs = await formErrors(page);
        if (errs.length) return await done('precisa_voce', 'O site recusou o envio', { error: `O site apontou: ${errs.join(' · ')}` });
        // Sem confirmação clara: não marca como aplicada para não enganar você
        return await done('precisa_voce', 'Enviado sem confirmação', { error: 'O robô clicou em enviar, mas o site não mostrou confirmação. Confira no site (ou no seu e-mail) antes de tentar de novo; se deu certo, toque em Apliquei.' });
      }
      if (!next) return await done('precisa_voce', 'Não achei o botão de enviar', { error: 'O robô preencheu o que conseguiu, mas não achou como avançar. Veja o print.' });
      await progress(Math.min(50 + step * 10, 88), `Indo para a etapa ${step + 1}`);
      await safeClick(page, next);
      await page.waitForTimeout(2500);
      const errs = (await formErrors(page)).join(' · ');
      if (errs && errs === lastErrors) return await done('precisa_voce', 'Travou numa etapa', { error: `O site não deixou avançar: ${errs}` });
      lastErrors = errs;
    }
    return await done('precisa_voce', 'Formulário longo demais', { error: 'Passou de 12 etapas; termine você mesmo.' });
  } catch (e) {
    return await done('erro', 'Erro durante a candidatura', { error: friendlyError(e) });
  } finally {
    // mantém só a primeira aba aberta (sessões de login ficam no perfil do navegador)
    for (const p of context.pages().slice(1)) await p.close().catch(() => {});
  }
}
