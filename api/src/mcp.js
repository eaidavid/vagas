// Servidor MCP do Vagas. Adicione no claude.ai como conector personalizado:
//   https://vagas.agenciateleios.com.br/mcp/<MCP_TOKEN>
// O Claude lê as vagas e o perfil, analisa, prepara carta e respostas para o robô e responde
// as perguntas que travaram a fila. Nada aqui envia candidatura: quem envia é o robô.
import { timingSafeEqual } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { q } from './db.js';
import { getProfile, saveProfile } from './profile.js';
import { enqueue, setStatus } from './queue.js';
import { ATS_INFO } from './ats.js';

const text = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const fail = (m) => ({ content: [{ type: 'text', text: m }], isError: true });

const INSTRUCTIONS = `Vagas: sistema pessoal de candidatura do David (dev front-end júnior, estudante de ADS, Aparecida de Goiânia/GO).
Regras ao escrever por ele (cartas, respostas de formulário):
- Português do Brasil (ou inglês, se a vaga for em inglês), primeira pessoa, tom direto e humano, sem frases de efeito nem cara de texto de IA.
- NUNCA invente experiência, empresa, tempo de casa, certificação, nota ou nível de idioma. Use só o que está em ver_perfil. Se a pergunta exige algo que ele não tem, responda com honestidade e mostre vontade de aprender.
- Inglês é básico (leitura técnica): não diga que é fluente. Pretensão e disponibilidade: use o banco de respostas.
- Perguntas de diversidade (gênero, raça, PcD, veterano): use "prefiro não informar", a menos que o banco diga outra coisa.
- Respostas curtas e específicas para a vaga; cartas com no máximo 150 palavras.
Quando ele pedir para fazer os pedidos/a fila do Vagas, chame ver_pedidos e atenda cada um, terminando com concluir_pedido.`;

const summary = (r) => ({
  id: r.id, status: r.status, nota: r.score, onde_aplica: (ATS_INFO[r.ats] || ATS_INFO.desconhecido).nome,
  titulo: r.data.title, empresa: r.data.company, local: r.data.location, formato: r.data.workplace, salario: r.data.salaryText || null,
  publicada: r.data.postedAt, motivos: (r.data.reasons || []).map((x) => `${x.t} ${x.text}`), analise_claude: r.data.claude?.resumo || null,
});

async function jobById(id) {
  const { rows } = await q('select * from jobs where id = $1', [id]);
  return rows[0] || null;
}
async function patchClaude(id, patch) {
  const job = await jobById(id);
  if (!job) return null;
  const data = { ...job.data, claude: { ...(job.data.claude || {}), ...patch, at: new Date().toISOString() } };
  await q('update jobs set data = $2, updated_at = now() where id = $1', [id, data]);
  return data;
}
async function completeRequests(where, params, resultado) {
  await q(`update requests set status = 'feito', resultado = $${params.length + 1}, done_at = now() where status = 'pendente' and ${where}`, [...params, resultado]);
}
function mergeBank(bank, answers) {
  const out = [...bank];
  for (const a of answers) {
    if (!a.pergunta || !a.resposta) continue;
    const i = out.findIndex((r) => r.pergunta.toLowerCase() === a.pergunta.toLowerCase());
    if (i >= 0) out[i] = { ...out[i], resposta: a.resposta }; else out.push({ pergunta: a.pergunta, resposta: a.resposta });
  }
  return out;
}

const QA = z.array(z.object({ pergunta: z.string().min(1), resposta: z.string().min(1) }));

function buildServer() {
  const server = new McpServer({ name: 'vagas', version: '1.0.0' }, { instructions: INSTRUCTIONS });

  server.registerTool('ver_perfil', {
    description: 'Currículo e preferências do David (habilidades, formação, projetos, links, cidades aceitas, salário mínimo) e o banco de respostas que o robô usa nos formulários. Leia antes de analisar vagas ou escrever qualquer coisa por ele.',
    inputSchema: {},
  }, async () => {
    const { telefone, ...p } = await getProfile();
    return text({ ...p, telefone: telefone ? 'preenchido' : 'vazio' });
  });

  server.registerTool('buscar_vagas', {
    description: 'Lista vagas. status: nova (feed), triagem (fila de decisão), minha (foi para a fila de aplicação), descartada. Ordenadas pela nota de compatibilidade.',
    inputSchema: {
      status: z.enum(['nova', 'triagem', 'minha', 'descartada']).optional(),
      busca: z.string().optional().describe('Parte do cargo ou da empresa'),
      nota_minima: z.number().int().min(0).max(100).optional(),
      incluir_barradas: z.boolean().optional().describe('Inclui as que a nota barrou (nível, local, salário, área)'),
      limite: z.number().int().min(1).max(100).optional(),
    },
  }, async ({ status = 'nova', busca, nota_minima = 0, incluir_barradas = false, limite = 30 }) => {
    const p = [status, nota_minima];
    const cond = ['status = $1', 'score >= $2'];
    if (busca) { p.push(`%${busca}%`); cond.push(`(data->>'title' ilike $${p.length} or data->>'company' ilike $${p.length})`); }
    if (!incluir_barradas) cond.push("(data->>'block') is null");
    p.push(limite);
    const { rows } = await q(`select * from jobs where ${cond.join(' and ')} order by score desc, created_at desc limit $${p.length}`, p);
    return text(rows.map(summary));
  });

  server.registerTool('ver_vaga', {
    description: 'Tudo sobre uma vaga: descrição completa, motivos da nota, onde a candidatura acontece, a sua análise e o que já foi preparado, e o andamento da candidatura (se houver).',
    inputSchema: { id: z.number().int() },
  }, async ({ id }) => {
    const job = await jobById(id);
    if (!job) return fail(`Vaga ${id} não existe.`);
    const { rows } = await q('select id, status, attempts, error, log from applications where job_id = $1', [id]);
    const app = rows[0];
    return text({
      ...summary(job), link: job.data.url, link_candidatura: job.data.applyUrl || null, tipo: job.data.employmentType, descricao: job.data.description,
      preparado_pelo_claude: job.data.claude || null,
      candidatura: app ? { id: app.id, status: app.status, erro: app.error, ultimo_registro: app.log.at(-1) } : null,
    });
  });

  server.registerTool('avaliar_vaga', {
    description: 'Grava a sua análise da vaga (aparece no app, no detalhe e na triagem). Seja honesto sobre o encaixe com um júnior.',
    inputSchema: {
      id: z.number().int(),
      nota: z.number().int().min(0).max(100).describe('Quanto combina com o David, de 0 a 100'),
      resumo: z.string().describe('2 a 3 frases: vale a pena? por quê?'),
      pontos_fortes: z.array(z.string()).optional(),
      riscos: z.array(z.string()).optional().describe('O que pode pesar contra (requisitos que ele não tem etc.)'),
    },
  }, async ({ id, nota, resumo, pontos_fortes = [], riscos = [] }) => {
    if (!(await patchClaude(id, { nota, resumo, pontosFortes: pontos_fortes, riscos }))) return fail(`Vaga ${id} não existe.`);
    await completeRequests("tipo = 'analisar' and job_id = $1", [id], resumo);
    return text('Análise salva. Aparece no app na próxima vez que ele abrir a vaga.');
  });

  server.registerTool('mover_vagas', {
    description: 'Muda o status de vagas: "triagem" (manda para ele decidir), "descartada" ou "nova". Use quando ele pedir para triar por ele. Não use "minha": quem decide aplicar é ele (ou peça confirmação e use marcar_minha).',
    inputSchema: { ids: z.array(z.number().int()).min(1), status: z.enum(['triagem', 'descartada', 'nova']) },
  }, async ({ ids, status }) => {
    const { rowCount } = await q(
      `update jobs set status = $2, triage_pos = case when $2 = 'triagem' then extract(epoch from now()) + id / 1e6 else triage_pos end, updated_at = now()
       where id = any($1::int[]) and status <> 'minha'`, [ids, status]);
    return text(`${rowCount} vaga(s) movida(s) para ${status}.`);
  });

  server.registerTool('marcar_minha', {
    description: 'Coloca a vaga na fila de aplicação do robô (o mesmo que o botão "É minha!"). Só use quando o David pedir explicitamente para aplicar nessa vaga.',
    inputSchema: { id: z.number().int() },
  }, async ({ id }) => {
    if (!(await jobById(id))) return fail(`Vaga ${id} não existe.`);
    const a = await enqueue(id);
    return text(`Vaga na fila de aplicação (candidatura ${a.id}). O robô respeita o modo ensaio e os limites do painel.`);
  });

  server.registerTool('preparar_candidatura', {
    description: 'Deixa pronto, para esta vaga, a carta de apresentação e respostas específicas. O robô usa isto no formulário antes do banco de respostas geral. Leia ver_perfil e ver_vaga antes. Não invente nada.',
    inputSchema: {
      id: z.number().int(),
      carta: z.string().max(2500).optional().describe('Carta curta (até ~150 palavras) para o campo "cover letter"/"por que você quer trabalhar aqui"'),
      respostas: QA.optional().describe('Respostas para perguntas prováveis desta vaga/empresa'),
    },
  }, async ({ id, carta, respostas = [] }) => {
    const job = await jobById(id);
    if (!job) return fail(`Vaga ${id} não existe.`);
    const cur = job.data.claude || {};
    await patchClaude(id, { ...(carta ? { carta } : {}), respostas: mergeBank(cur.respostas || [], respostas) });
    await completeRequests("tipo = 'preparar' and job_id = $1", [id], 'Carta e respostas preparadas');
    return text('Pronto. O robô vai usar a carta e as respostas desta vaga.');
  });

  server.registerTool('ver_travadas', {
    description: 'Candidaturas em "precisa de você": por que o robô parou e as perguntas (com as opções do site, quando houver).',
    inputSchema: {},
  }, async () => {
    const { rows } = await q("select a.id, a.error, a.log, j.id job_id, j.data from applications a join jobs j on j.id = a.job_id where a.status = 'precisa_voce' order by a.updated_at");
    return text(rows.map((r) => ({
      candidatura: r.id, vaga: r.job_id, titulo: r.data.title, empresa: r.data.company, motivo: r.error,
      perguntas: r.log.at(-1)?.questions || [],
    })));
  });

  server.registerTool('responder_perguntas', {
    description: 'Responde as perguntas em que o robô travou e devolve a candidatura para a fila. Se a pergunta tem opções, a resposta deve ser exatamente uma delas. Por padrão as respostas também entram no banco geral (servem para outras vagas); use salvar_no_banco=false para respostas específicas da empresa.',
    inputSchema: { candidatura: z.number().int(), respostas: QA.min(1), salvar_no_banco: z.boolean().optional() },
  }, async ({ candidatura, respostas, salvar_no_banco = true }) => {
    const { rows } = await q('select job_id, status from applications where id = $1', [candidatura]);
    if (!rows[0]) return fail(`Candidatura ${candidatura} não existe.`);
    const job = await jobById(rows[0].job_id);
    await patchClaude(job.id, { respostas: mergeBank(job.data.claude?.respostas || [], respostas) });
    if (salvar_no_banco) {
      const p = await getProfile();
      p.respostas = mergeBank(p.respostas, respostas);
      await saveProfile(p);
    }
    await setStatus(candidatura, 'aguardando', `Claude respondeu ${respostas.length} pergunta(s); voltou para a fila`);
    await completeRequests('tipo = \'responder\' and application_id = $1', [candidatura], `${respostas.length} resposta(s)`);
    return text('Respostas salvas. A candidatura voltou para a fila do robô.');
  });

  server.registerTool('salvar_respostas_padrao', {
    description: 'Acrescenta ou atualiza respostas no banco geral do robô (valem para todas as vagas). Confirme com o David antes de mudar algo pessoal (salário, disponibilidade).',
    inputSchema: { respostas: QA.min(1) },
  }, async ({ respostas }) => {
    const p = await getProfile();
    p.respostas = mergeBank(p.respostas, respostas);
    await saveProfile(p);
    return text(`Banco de respostas atualizado (${p.respostas.length} respostas).`);
  });

  server.registerTool('ver_pedidos', {
    description: 'Pedidos que o David deixou no app com o botão "Pedir ao Claude". Atenda cada um: analisar → avaliar_vaga; preparar → preparar_candidatura; responder → responder_perguntas. Depois chame concluir_pedido se a ferramenta não tiver concluído sozinha.',
    inputSchema: {},
  }, async () => {
    const { rows } = await q("select r.*, j.data->>'title' titulo, j.data->>'company' empresa from requests r left join jobs j on j.id = r.job_id where r.status = 'pendente' order by r.id");
    if (!rows.length) return text('Nenhum pedido pendente.');
    return text(rows.map((r) => ({ pedido: r.id, tipo: r.tipo, vaga: r.job_id, candidatura: r.application_id, titulo: r.titulo, empresa: r.empresa, observacao: r.texto, desde: r.created_at })));
  });

  server.registerTool('concluir_pedido', {
    description: 'Marca um pedido como feito, com uma frase do que foi feito (aparece no app).',
    inputSchema: { pedido: z.number().int(), resultado: z.string().optional() },
  }, async ({ pedido, resultado = 'Feito' }) => {
    const { rowCount } = await q("update requests set status = 'feito', resultado = $2, done_at = now() where id = $1", [pedido, resultado]);
    return rowCount ? text('Pedido concluído.') : fail('Pedido não existe.');
  });

  return server;
}

function tokenOk(given) {
  const want = process.env.MCP_TOKEN || '';
  if (!want || !given) return false;
  const a = Buffer.from(String(given)), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registerMcp(app) {
  const handler = async (req, reply) => {
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!tokenOk(req.params.token || bearer)) return reply.code(404).send({ error: 'Não encontrado.' });
    if (req.method !== 'POST') return reply.code(405).header('allow', 'POST').send({ jsonrpc: '2.0', error: { code: -32000, message: 'Use POST.' }, id: null });
    reply.hijack();
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    reply.raw.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  };
  app.route({ method: ['GET', 'POST', 'DELETE'], url: '/mcp/:token', handler });
  app.route({ method: ['GET', 'POST', 'DELETE'], url: '/mcp', handler });
}
