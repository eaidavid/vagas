// Servidor do Vagas: API, painel e agenda de buscas.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fstatic from '@fastify/static';
import { migrate } from './db.js';
import { ensureAdmin, guard, registerAuth } from './auth.js';
import { registerRoutes } from './routes.js';
import { startScheduler } from './collectors/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.WEB_DIST || path.resolve(here, '../../web/dist');

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' }, bodyLimit: 10 * 1024 * 1024, trustProxy: true });
await app.register(cookie);
guard(app);
registerAuth(app);
registerRoutes(app);

if (existsSync(DIST)) {
  await app.register(fstatic, { root: DIST, index: ['index.html'] });
  // Rotas do painel (SPA) caem no index.html
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Não encontrado.' });
    return reply.sendFile('index.html');
  });
} else {
  app.log.warn(`Painel não encontrado em ${DIST}. Rode "npm run build" em web/.`);
}

await migrate();
await ensureAdmin();
startScheduler();
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT) || 3000 });
