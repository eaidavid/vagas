// Contas que o robô usa para fazer login (LinkedIn, Gupy). A senha fica criptografada (AES-256-GCM)
// no banco da sua VPS, com chave derivada de um segredo do .env; o painel nunca devolve a senha.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { kvGet, kvSet } from './db.js';

export const SERVICOS = ['linkedin', 'gupy'];
const key = () => createHash('sha256').update(`vagas-contas:${process.env.CONTAS_KEY || process.env.ROBO_TOKEN || ''}`).digest();

function encrypt(text) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decrypt(blob) {
  try {
    const [iv, tag, enc] = String(blob).split('.').map((x) => Buffer.from(x, 'base64'));
    const d = createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    return null; // chave mudou ou dado corrompido: trata como sem senha
  }
}

/* O que o painel mostra: só o e-mail e se tem senha salva */
export async function contasPublicas() {
  const all = await kvGet('contas', {});
  return Object.fromEntries(SERVICOS.map((s) => [s, { email: all[s]?.email || '', temSenha: !!all[s]?.senha }]));
}

export async function salvarConta(servico, { email, senha, apagar }) {
  const all = await kvGet('contas', {});
  if (apagar) delete all[servico];
  else all[servico] = { email: String(email || '').trim(), senha: senha ? encrypt(senha) : all[servico]?.senha || null };
  await kvSet('contas', all);
}

/* Para o robô, na hora de aplicar */
export async function contasParaRobo() {
  const all = await kvGet('contas', {});
  const out = {};
  for (const s of SERVICOS) {
    const senha = all[s]?.senha ? decrypt(all[s].senha) : null;
    if (all[s]?.email && senha) out[s] = { email: all[s].email, senha };
  }
  return out;
}
