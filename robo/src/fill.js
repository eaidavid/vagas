// Motor genérico de formulários: lê os campos visíveis (dentro de um escopo, ex.: o modal do LinkedIn),
// descobre a pergunta de cada um, preenche o que sabe e devolve o que não sabe.
import { answerFor, pickOption, DECLINE, norm } from './answers.js';

/* Roda no navegador: marca cada campo com data-vagas-id e devolve a descrição */
function collect(scopeSel) {
  const root = scopeSel ? document.querySelector(scopeSel) : document;
  if (!root) return [];
  const txt = (e) => (e?.innerText || e?.textContent || '').replace(/\s+/g, ' ').trim();
  const visible = (e) => {
    if (!e) return false;
    const r = e.getBoundingClientRect();
    const st = getComputedStyle(e);
    return r.width > 1 && r.height > 1 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05;
  };
  let seq = Number(document.body.dataset.vagasSeq || 0);
  const mark = (e) => { if (!e.dataset.vagasId) e.dataset.vagasId = String(++seq); return e.dataset.vagasId; };
  const labelOf = (e) => {
    let l = '';
    if (e.id) l = txt(document.querySelector(`label[for="${CSS.escape(e.id)}"]`));
    if (!l && e.getAttribute('aria-labelledby')) l = e.getAttribute('aria-labelledby').split(' ').map((id) => txt(document.getElementById(id))).join(' ');
    if (!l) l = e.getAttribute('aria-label') || '';
    if (!l) { const w = e.closest('label'); if (w) l = txt(w); }
    if (!l) {
      let c = e.parentElement;
      for (let i = 0; i < 5 && c && !l; i++, c = c.parentElement) {
        const cand = c.querySelector('label, legend, .application-label, [class*="label"], [class*="question"]');
        if (cand && !cand.contains(e)) l = txt(cand);
      }
    }
    return (l || e.placeholder || e.name || '').slice(0, 300);
  };
  // Pergunta de um grupo de opções: o texto do bloco em volta, tirando os rótulos das opções
  const groupQuestion = (inputs) => {
    let c = inputs[0].parentElement;
    while (c && c !== root && !inputs.every((i) => c.contains(i))) c = c.parentElement;
    for (let i = 0; i < 4 && c; i++, c = c.parentElement) {
      const legend = c.querySelector('legend, .application-label, [class*="question-label"], [class*="label"]:not(label)');
      if (legend && txt(legend)) return txt(legend);
      let t = txt(c);
      for (const inp of inputs) t = t.replace(labelOf(inp), '');
      t = t.trim();
      if (t.length > 3) return t.slice(0, 300);
    }
    return labelOf(inputs[0]);
  };
  const required = (e, label) => e.required || e.getAttribute('aria-required') === 'true' || /[*✱]\s*$|\*|✱/.test(label);

  const out = [];
  const groups = new Map();
  const els = [...root.querySelectorAll('input, textarea, select')];
  for (const e of els) {
    const type = (e.type || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'image', 'reset', 'search'].includes(type)) continue;
    if (type === 'radio' || type === 'checkbox') {
      const lab = e.id ? document.querySelector(`label[for="${CSS.escape(e.id)}"]`) : e.closest('label');
      if (!visible(e) && !visible(lab) && !visible(e.parentElement)) continue;
      const key = `${type}:${e.name || mark(e)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
      continue;
    }
    if (type !== 'file' && !visible(e)) continue;
    if (e.disabled || e.readOnly) continue;
    const label = labelOf(e);
    const combobox = e.getAttribute('role') === 'combobox' || e.getAttribute('aria-autocomplete') === 'list' || e.getAttribute('aria-haspopup') === 'listbox';
    out.push({
      vid: mark(e),
      kind: e.tagName === 'SELECT' ? 'select' : e.tagName === 'TEXTAREA' ? 'textarea' : type === 'file' ? 'file' : combobox ? 'combobox' : 'text',
      inputType: type,
      label, name: e.name || '', id: e.id || '', autocomplete: e.autocomplete || '', placeholder: e.placeholder || '',
      required: required(e, label),
      value: e.tagName === 'SELECT' ? (e.selectedIndex > 0 ? e.options[e.selectedIndex].text : '') : (e.value || ''),
      options: e.tagName === 'SELECT' ? [...e.options].map((o) => o.text.trim()) : undefined,
    });
  }
  for (const [key, inputs] of groups) {
    const type = key.split(':')[0];
    const label = inputs.length === 1 && type === 'checkbox' ? labelOf(inputs[0]) : groupQuestion(inputs);
    out.push({
      vid: inputs.map(mark).join(','),
      kind: type === 'radio' ? 'radio' : inputs.length === 1 ? 'checkbox' : 'checkboxes',
      label,
      required: inputs.some((i) => required(i, label)) || /[*✱]/.test(label),
      options: inputs.map((i) => labelOf(i)),
      value: inputs.filter((i) => i.checked).map((i) => labelOf(i)).join(', '),
    });
  }
  document.body.dataset.vagasSeq = String(seq);
  return out;
}

const loc = (page, vid) => page.locator(`[data-vagas-id="${vid}"]`);

const LIST_OPTS = '[role="option"]:visible, .select__option:visible, .pac-item:visible, .dropdown-results li:visible';
const translations = (a) => (/^(nao|não|no)\b/i.test(a) ? ['No', 'Não'] : /^(sim|yes)\b/i.test(a) ? ['Yes', 'Sim'] : /^brasil$/i.test(a) ? ['Brazil'] : []);

/* Lista que filtra enquanto digita (react-select do Greenhouse, cidades do Lever...) */
async function chooseFromList(page, input, answer, alts = []) {
  const tries = [...new Set([answer, ...translations(answer), ...alts])];
  for (const t of tries) {
    await input.click({ timeout: 5000 }).catch(() => {});
    await input.fill('').catch(() => {});
    await input.pressSequentially(String(t).slice(0, 40), { delay: 30 });
    await page.waitForTimeout(1000);
    const opts = page.locator(LIST_OPTS);
    const texts = (await opts.allInnerTexts()).map((x) => x.trim());
    if (!texts.length || (texts.length === 1 && /no (options|results)|nenhum/i.test(texts[0]))) continue;
    let i = pickOption(t, texts);
    if (i < 0) i = pickOption(answer, texts);
    if (i < 0 && texts.length === 1) i = 0;
    if (i < 0) continue;
    await opts.nth(i).click();
    return true;
  }
  await input.fill('').catch(() => {});
  await input.press('Escape').catch(() => {});
  return false;
}

/* Abre a lista sem digitar só para mostrar as opções na pergunta */
async function listOptions(page, input) {
  await input.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(700);
  const texts = (await page.locator(LIST_OPTS).allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean);
  await input.press('Escape').catch(() => {});
  return texts.slice(0, 30);
}

/**
 * Preenche o formulário visível. Devolve { filled, unknown }.
 * unknown: perguntas obrigatórias que o robô não soube (viram "precisa de você").
 */
export async function fillForm(page, { profile, job, resumePath, scope = null }) {
  const fields = await page.evaluate(collect, scope);
  const filled = [], unknown = [];
  const ask = (f) => f.required && unknown.push({ pergunta: f.label.replace(/[*✱]\s*$/, '').trim(), opcoes: f.options?.filter((o) => o && !/^(select|selecione|choose|escolha|click here)/i.test(o)).slice(0, 30) });

  for (const f of fields) {
    try {
      if (f.value && f.kind !== 'file') continue; // já preenchido (ex.: perfil salvo no site)
      const ans = answerFor(f, profile, job);

      if (f.kind === 'file') {
        if (ans?.file === 'curriculo' && resumePath) {
          await loc(page, f.vid).setInputFiles(resumePath);
          filled.push({ campo: f.label || 'Currículo', valor: 'currículo (PDF)' });
          await page.waitForTimeout(1500);
        } else if (f.required) ask(f);
        continue;
      }

      if (f.kind === 'radio' || f.kind === 'select' || f.kind === 'checkboxes' || f.kind === 'checkbox') {
        const vids = f.vid.split(',');
        let idx = -1;
        if (ans?.decline) idx = f.options.findIndex((o) => DECLINE.test(norm(o)));
        else if (ans?.value) idx = pickOption(ans.value, f.options);
        for (const a of ans?.alt || []) if (idx < 0) idx = pickOption(a, f.options);

        if (f.kind === 'checkbox') {
          // caixinha única: aceite de termos/privacidade marca; o resto só se o banco disser "sim"
          const consent = /agree|concordo|aceito|accept|privacy|privacidade|terms|termos|consent|lgpd|declaro|confirm/.test(norm(f.label));
          if (consent || (ans?.value && /^(sim|yes)/i.test(ans.value))) { await loc(page, vids[0]).check({ force: true }); filled.push({ campo: f.label, valor: 'marcado' }); }
          else if (f.required) ask(f);
          continue;
        }
        if (f.kind === 'checkboxes') {
          const wanted = ans?.value ? ans.value.split(/,|;| e | and /).map((s) => s.trim()).filter(Boolean) : [];
          const hits = [...new Set(wanted.map((w) => pickOption(w, f.options)).filter((i) => i >= 0))];
          if (!hits.length && idx >= 0) hits.push(idx);
          if (hits.length) {
            for (const i of hits) await loc(page, vids[i]).check({ force: true });
            filled.push({ campo: f.label, valor: hits.map((i) => f.options[i]).join(', ') });
          } else if (f.required) ask(f);
          continue;
        }
        if (idx < 0) { if (f.required) ask(f); continue; }
        if (f.kind === 'select') await loc(page, f.vid).selectOption({ index: idx });
        else await loc(page, vids[idx]).check({ force: true });
        filled.push({ campo: f.label, valor: f.options[idx] });
        continue;
      }

      if (f.kind === 'combobox') {
        const answer = ans?.decline ? 'Decline' : ans?.value;
        const ok = answer && (await chooseFromList(page, loc(page, f.vid), answer, ans.alt || (ans.decline ? ['Prefer not', "I don't wish", 'Não desejo'] : [])));
        if (ok) filled.push({ campo: f.label, valor: answer });
        else if (f.required) ask({ ...f, options: await listOptions(page, loc(page, f.vid)) });
        continue;
      }

      // texto / textarea
      if (!ans?.value) { if (f.required) ask(f); continue; }
      const el = loc(page, f.vid);
      await el.fill(String(ans.value));
      // campos de cidade com autocompletar: escolhe a sugestão se aparecer
      if (/location|cidade|city|localiza/.test(norm(f.label))) {
        await page.waitForTimeout(1200);
        const sug = page.locator('[role="option"]:visible, .pac-item:visible, .dropdown-results li:visible, [class*="location"] li:visible').first();
        if (await sug.count()) await sug.click().catch(() => {});
      }
      filled.push({ campo: f.label, valor: String(ans.value).length > 80 ? `${String(ans.value).slice(0, 80)}…` : String(ans.value) });
    } catch (e) {
      if (f.required) ask(f);
    }
  }
  return { filled, unknown };
}

export const SUBMIT = /^(submit|send|enviar|apply|candidatar|finalizar|concluir)|submit application|enviar candidatura|send application|apply now|candidatar-se|finalizar candidatura/i;
export const NEXT = /^(next|avançar|avancar|continuar|continue|próximo|proximo|prosseguir|review|revisar)\b/i;

/* Fecha o que estiver na frente: janelas de login/cadastro, avisos de cookies, pop-ups */
export async function dismissOverlays(page) {
  await page.keyboard.press('Escape').catch(() => {});
  const closers = page.locator([
    'button[aria-label="Dismiss"]', 'button[aria-label="Fechar"]', 'button[aria-label="Close"]', '.modal__dismiss', '.contextual-sign-in-modal__modal-dismiss',
    '#onetrust-accept-btn-handler', 'button[id*="cookie" i]', '[class*="cookie" i] button',
  ].join(', ')).filter({ visible: true });
  const n = Math.min(await closers.count(), 3);
  for (let i = 0; i < n; i++) await closers.nth(0).click({ timeout: 2000 }).catch(() => {});
  const accept = page.locator('button').filter({ visible: true, hasText: /^(aceitar|aceito|accept( all)?|concordo|entendi|ok|permitir todos)$/i }).first();
  if (await accept.count()) await accept.click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(500);
}

/* Clique que não trava: se algo estiver na frente, fecha e tenta de novo; por último clica direto no elemento */
export async function safeClick(page, locator) {
  try { await locator.click({ timeout: 8000 }); return; } catch { /* algo na frente */ }
  await dismissOverlays(page);
  try { await locator.click({ timeout: 8000 }); return; } catch { /* ainda bloqueado */ }
  await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await locator.evaluate((el) => el.click(), null, { timeout: 5000 });
}

export async function findButton(page, re, scope = null, exclude = null) {
  const root = scope ? page.locator(scope) : page;
  const btns = root.locator('button:visible, input[type=submit]:visible, a[role=button]:visible');
  const n = await btns.count();
  for (let i = n - 1; i >= 0; i--) {
    const b = btns.nth(i);
    const t = ((await b.innerText().catch(() => '')) || (await b.getAttribute('value')) || (await b.getAttribute('aria-label')) || '').trim();
    if (exclude && t && t === exclude) continue; // ex.: o próprio botão "Candidatar-se" da página não é o envio
    if (re.test(t) && (await b.isEnabled().catch(() => false))) return b;
  }
  return null;
}

export async function hasCaptcha(page) {
  return (await page.locator('iframe[src*="hcaptcha"]:visible, iframe[src*="recaptcha"][src*="bframe"]:visible, iframe[title*="challenge" i]:visible, iframe[src*="challenges.cloudflare"]:visible').count()) > 0;
}

export async function successText(page) {
  const body = norm(await page.locator('body').innerText().catch(() => ''));
  return /thank you for (applying|your application|your interest)|application (has been )?(received|submitted)|we.?ve received your application|obrigad[oa] por (se candidatar|sua candidatura|seu interesse)|candidatura (foi )?(enviada|recebida|realizada|concluida)|recebemos (a )?sua candidatura|your application was sent|sua candidatura foi enviada/.test(body)
    || /thanks|confirmation|success|obrigado|candidatura-enviada/.test(page.url());
}

/* Mensagens de erro visíveis depois de tentar enviar */
export async function formErrors(page) {
  return page.evaluate(() => {
    const txt = (e) => (e?.innerText || '').replace(/\s+/g, ' ').trim();
    const errs = [...document.querySelectorAll('[aria-invalid="true"], .error:not(:empty), [class*="error-message"], [class*="field-error"], [role="alert"]')]
      .filter((e) => e.getBoundingClientRect().height > 0).map(txt).filter((t) => t && t.length < 200);
    return [...new Set(errs)].slice(0, 8);
  });
}
