// Login automático com as contas salvas em Perfil → Robô (senha criptografada na VPS).
// O perfil do navegador guarda a sessão depois, então isso só acontece de vez em quando.
// Resultado: 'ok' | 'sem_conta' | 'verificacao' (site pediu código) | 'falhou' (senha recusada ou tela estranha)

const visible = async (page, sel) => (await page.locator(sel).filter({ visible: true }).count()) > 0;

export const LI_SIGNIN_MODAL = '.contextual-sign-in-modal, .sign-in-modal, [class*="sign-in-modal"], #base-contextual-sign-in-modal, [data-test-modal-id*="sign-in"]';

/* LinkedIn sem login: página de login, authwall ou a janela "Cadastre-se ou entre" */
export async function linkedinGuest(page) {
  const url = page.url();
  if (!/linkedin\.com/.test(url)) return false;
  if (/\/(login|authwall|checkpoint|uas\/login|signup)/.test(url)) return true;
  if (await visible(page, LI_SIGNIN_MODAL)) return true;
  if (await page.locator('#global-nav, .global-nav').count()) return false;
  return visible(page, 'a[href*="/login"], a[href*="signin"], a[data-tracking-control-name*="nav-header-signin"], a[data-tracking-control-name*="nav-header-join"]');
}

export async function loginLinkedin(page, conta, log = () => {}) {
  if (!conta?.email || !conta?.senha) return 'sem_conta';
  log('fazendo login no LinkedIn');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  if (!/\/login|\/uas\//.test(page.url()) && (await page.locator('#global-nav, .global-nav').count())) return 'ok'; // já estava logado
  // "Bem-vindo de volta": às vezes só pede a senha da conta lembrada
  if (await visible(page, '#username')) await page.fill('#username', conta.email);
  if (!(await visible(page, '#password'))) return 'falhou';
  await page.fill('#password', conta.senha);
  await page.locator('button[type=submit]').filter({ visible: true }).first().click();
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(6000);
  const url = page.url();
  if (/checkpoint|challenge|two-step|verification|verify|add-phone/.test(url)) return 'verificacao';
  if (/\/login|\/uas\/login/.test(url) || (await visible(page, '#error-for-password, #error-for-username, .alert-content'))) return 'falhou';
  return 'ok';
}

const GUPY_EMAIL = 'input[type=email], input[name*="mail" i], input[id*="mail" i], input[name="username"]';
const GUPY_PASS = 'input[type=password]';
const clickByText = async (page, re) => {
  const b = page.locator('button, a[role=button], input[type=submit]').filter({ visible: true, hasText: re }).first();
  if (await b.count()) { await b.click().catch(() => {}); return true; }
  return false;
};

/* Gupy: tela de login (às vezes em duas etapas: e-mail, depois senha) */
export async function gupyNeedsLogin(page) {
  if (!/gupy\.io/.test(page.url())) return false;
  return /signin|login|\/auth/.test(page.url()) || (await visible(page, GUPY_PASS));
}

export async function loginGupy(page, conta, log = () => {}) {
  if (!conta?.email || !conta?.senha) return 'sem_conta';
  log('fazendo login na Gupy');
  // Se caiu em "criar conta", vai para "já tenho conta"
  if (!(await visible(page, GUPY_EMAIL)) && !(await visible(page, GUPY_PASS))) {
    await clickByText(page, /j[aá] tenho (conta|cadastro)|fazer login|^entrar$|acessar/i);
    await page.waitForTimeout(2500);
  }
  if (await visible(page, GUPY_EMAIL)) await page.locator(GUPY_EMAIL).filter({ visible: true }).first().fill(conta.email);
  if (!(await visible(page, GUPY_PASS))) {
    await clickByText(page, /continuar|pr[oó]ximo|avan[cç]ar|entrar/i);
    await page.waitForTimeout(3000);
  }
  if (!(await visible(page, GUPY_PASS))) return /c[oó]digo|verifica/i.test(await page.locator('body').innerText().catch(() => '')) ? 'verificacao' : 'falhou';
  await page.locator(GUPY_PASS).filter({ visible: true }).first().fill(conta.senha);
  if (!(await clickByText(page, /^(entrar|acessar|login|continuar|fazer login)/i))) await page.keyboard.press('Enter');
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(6000);
  const body = await page.locator('body').innerText().catch(() => '');
  if (/c[oó]digo de (verifica|seguran)|enviamos um c[oó]digo|verify/i.test(body)) return 'verificacao';
  if (await visible(page, GUPY_PASS)) return 'falhou';
  return 'ok';
}
