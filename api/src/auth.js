// Login por e-mail e senha, com sessão em cookie httpOnly.
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { q } from './db.js';

const scrypt = promisify(_scrypt);
const COOKIE = 'vagas_session';
const DAYS = 30;

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}
async function verify(pw, stored) {
  const [salt, hash] = stored.split(':');
  const key = await scrypt(pw, Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(key, Buffer.from(hash, 'hex'));
}

/* Cria o primeiro administrador a partir das variáveis de ambiente */
export async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const pw = process.env.ADMIN_PASSWORD;
  if (!email || !pw) return;
  const { rows } = await q('select id from users where email = $1', [email.toLowerCase()]);
  if (!rows.length) {
    await q('insert into users(email, name, password_hash) values ($1, $2, $3)', [email.toLowerCase(), email.split('@')[0], await hashPassword(pw)]);
    console.log(`Administrador criado: ${email}`);
  }
}

export async function currentUser(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  const { rows } = await q('select u.id, u.email, u.name, u.role from sessions s join users u on u.id = s.user_id where s.token = $1 and s.expires_at > now()', [token]);
  return rows[0] || null;
}

export function registerAuth(app) {
  app.post('/api/login', async (req, reply) => {
    const { email = '', password = '' } = req.body || {};
    const { rows } = await q('select * from users where email = $1', [String(email).toLowerCase().trim()]);
    const user = rows[0];
    if (!user || !(await verify(String(password), user.password_hash))) {
      return reply.code(401).send({ error: 'E-mail ou senha incorretos.' });
    }
    const token = randomBytes(32).toString('hex');
    await q("insert into sessions(token, user_id, expires_at) values ($1, $2, now() + interval '30 days')", [token, user.id]);
    reply.setCookie(COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: DAYS * 86400 });
    return { id: user.id, email: user.email, name: user.name };
  });

  app.post('/api/logout', async (req, reply) => {
    const token = req.cookies?.[COOKIE];
    if (token) await q('delete from sessions where token = $1', [token]);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', async (req, reply) => {
    const u = await currentUser(req);
    if (!u) return reply.code(401).send({ error: 'Faça login.' });
    return u;
  });

  app.post('/api/password', async (req, reply) => {
    const u = await currentUser(req);
    if (!u) return reply.code(401).send({ error: 'Faça login.' });
    const { password } = req.body || {};
    if (!password || String(password).length < 10) return reply.code(400).send({ error: 'Use uma senha com pelo menos 10 caracteres.' });
    await q('update users set password_hash = $1 where id = $2', [await hashPassword(String(password)), u.id]);
    return { ok: true };
  });
}

/* Protege as rotas /api (menos login e público) */
export function guard(app) {
  app.addHook('preHandler', async (req, reply) => {
    const url = req.url.split('?')[0];
    if (!url.startsWith('/api/') || ['/api/login', '/api/logout', '/api/health'].includes(url) || url.startsWith('/api/public/')) return;
    const u = await currentUser(req);
    if (!u) return reply.code(401).send({ error: 'Faça login.' });
    req.user = u;
  });
}
