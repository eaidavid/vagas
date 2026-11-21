// Teste manual em modo ENSAIO: abre formulários reais e preenche, mas nunca envia.
// Uso: node test-ensaio.mjs <url> <ats> [curriculo.pdf] [print.jpg]
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { applyJob } from './src/apply.js';

const [url, ats = 'site', resumePath = null, out = 'ensaio.jpg'] = process.argv.slice(2);
const profile = {
  nome: 'David Alves Cavalcante', email: 'teste-ensaio@example.com', telefone: '(62) 90000-0000', cidade: 'Aparecida de Goiânia', estado: 'GO',
  links: { github: 'https://github.com/eaidavid', linkedin: 'https://www.linkedin.com/in/davidalves', portfolio: 'https://portfoliododavid.vercel.app/' },
  resumo: 'Em formação em ADS, front-end com React.', habilidades: ['HTML', 'CSS', 'JavaScript', 'React'],
  respostas: [{ pergunta: 'Pretensão salarial', resposta: 'R$ 2.500' }, { pergunta: 'Pessoa com deficiência (PcD)?', resposta: 'Não' }, ...JSON.parse(process.env.RESPOSTAS || '[]')],
};
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1280, height: 860 } });
const r = await applyJob(context, { job: { ats, data: { title: 'Teste', company: 'Teste', url, applyUrl: url } }, profile, resumePath, ensaio: true, log: (t) => console.log('  ' + t) });
if (r.screenshot) writeFileSync(out, Buffer.from(r.screenshot, 'base64'));
console.log(JSON.stringify({ status: r.status, text: r.text, error: r.error, preenchidos: r.filled.length, perguntas: r.questions?.map((q) => q.pergunta.slice(0, 80) + (q.opcoes?.length ? ` [${q.opcoes.length} opções]` : '')) }, null, 1));
console.log(r.filled.map((f) => `  ✓ ${f.campo.slice(0, 50)} = ${f.valor}`).join('\n'));
await browser.close();
