import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSearch, parseDetail } from '../src/collectors/linkedin.js';
import { scoreJob, parseSalary } from '../src/scoring.js';
import { detectAts, applyKey } from '../src/ats.js';
import { mapGupy } from '../src/collectors/gupy.js';
import { DEFAULT_PROFILE } from '../src/profile.js';

const prefs = DEFAULT_PROFILE.preferencias;
const fx = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

test('LinkedIn: lê os cards da busca pública', () => {
  const cards = parseSearch(fx('linkedin-search.html'));
  assert.ok(cards.length >= 5);
  const c = cards[0];
  assert.match(c.id, /^\d+$/);
  assert.ok(c.title && c.company && c.location);
  assert.match(c.url, /^https:\/\/[a-z.]*linkedin\.com\/jobs\/view\//);
});

test('LinkedIn: detalhe traz critérios, descrição e modo de candidatura', () => {
  const d = parseDetail(fx('linkedin-job.html'));
  assert.equal(d.employmentType, 'Full-time');
  assert.ok(d.descriptionHtml.length > 50);
  assert.equal(d.applyMode, 'externo');
});

test('Nota: júnior remoto de React sobe; sênior e presencial fora caem', () => {
  const good = scoreJob({ title: 'Desenvolvedor Front-end Júnior', location: 'Brasil', workplace: 'remoto', description: 'React, TypeScript, HTML, CSS, Git' }, prefs);
  const senior = scoreJob({ title: 'Desenvolvedor Front-end Sênior', location: 'Brasil', workplace: 'remoto', description: 'React' }, prefs);
  const far = scoreJob({ title: 'Desenvolvedor Júnior', location: 'São Paulo, SP', workplace: 'presencial', description: '' }, prefs);
  const near = scoreJob({ title: 'Desenvolvedor Júnior', location: 'Goiânia, Goiás, Brasil', workplace: 'hibrido', description: '' }, prefs);
  const cheap = scoreJob({ title: 'Desenvolvedor Júnior', location: 'Brasil', workplace: 'remoto', salaryText: 'R$ 1.500,00', description: '' }, prefs);
  assert.ok(good.score >= 80, `good ${good.score}`);
  assert.equal(senior.block, 'nivel');
  assert.equal(far.block, 'local');
  assert.equal(near.block, null);
  assert.equal(cheap.block, 'salario');
  assert.ok(good.score > near.score && near.score > far.score);
});

test('Nota: remoto de fora do Brasil e inglês fluente caem', () => {
  const us = scoreJob({ title: 'Junior Frontend Developer', location: 'Remote, United States', workplace: 'remoto', description: 'React' }, prefs);
  const br = scoreJob({ title: 'Junior Frontend Developer', location: 'São Paulo, SP', workplace: 'remoto', description: 'React' }, prefs);
  const en = scoreJob({ title: 'Desenvolvedor Júnior', location: 'Brasil', workplace: 'remoto', description: 'Requisitos: inglês fluente, React' }, prefs);
  const bare = scoreJob({ title: 'Desenvolvedor Júnior', location: 'Remoto', workplace: 'remoto', description: '' }, prefs);
  assert.equal(us.block, 'local');
  assert.equal(br.block, null);
  assert.equal(bare.block, null);
  assert.ok(en.reasons.some((r) => /inglês/.test(r.text)));
});

test('Salário: entende formatos comuns', () => {
  assert.deepEqual(parseSalary('R$ 2.500,00 - R$ 3.200,00'), { min: 2500, max: 3200 });
  assert.deepEqual(parseSalary('R$3k a 4k'), { min: 3000, max: 4000 });
  assert.equal(parseSalary('Benefícios: VR, VT'), null);
});

test('ATS: reconhece o sistema pelo link e junta a mesma candidatura', () => {
  assert.equal(detectAts('https://empresa.gupy.io/jobs/123?jobBoardSource=linkedin'), 'gupy');
  assert.equal(detectAts('https://boards.greenhouse.io/nubank/jobs/1'), 'greenhouse');
  assert.equal(detectAts('https://jobs.lever.co/acme/abc/apply'), 'lever');
  assert.equal(detectAts('https://acme.wd1.myworkdayjobs.com/x'), 'workday');
  assert.equal(detectAts('https://carreiras.acme.com.br/vaga'), 'site');
  assert.equal(applyKey('https://empresa.gupy.io/jobs/123?jobBoardSource=linkedin'), applyKey('https://empresa.gupy.io/jobs/123/'));
  // link novo da Gupy (/job/<base64>) = mesmo da vaga antiga (/jobs/<id>)
  const b64 = Buffer.from(JSON.stringify({ jobId: 123, source: 'gupy_portal' })).toString('base64');
  assert.equal(applyKey(`https://empresa.gupy.io/job/${b64}?jobBoardSource=gupy_portal`), applyKey('https://empresa.gupy.io/jobs/123'));
});

test('Gupy: converte o formato da API', () => {
  const j = mapGupy({ id: 9, name: 'Dev Jr', careerPageName: 'Acme', city: 'Goiânia', state: 'Goiás', workplaceType: 'hybrid', jobUrl: 'https://acme.gupy.io/jobs/9', type: 'vacancy_type_internship', description: '<p>React</p>' });
  assert.equal(j.workplace, 'hibrido');
  assert.equal(j.employmentType, 'Estágio');
  assert.equal(j.location, 'Goiânia, Goiás');
});

test('Nota: "web" sozinho não faz a vaga ser de desenvolvimento', () => {
  const wa = scoreJob({ title: 'Web Analytics Júnior', location: 'Brasil', workplace: 'remoto', description: 'JavaScript, HTML' }, prefs);
  const wd = scoreJob({ title: 'Desenvolvedor Web Júnior', location: 'Brasil', workplace: 'remoto', description: 'JavaScript, HTML' }, prefs);
  assert.equal(wa.block, 'area');
  assert.equal(wd.block, null);
});

test('Nota: mid-level conta como pleno e .NET/Java no título como outra stack', () => {
  const mid = scoreJob({ title: 'Full Stack Engineer (Mid-level)', location: 'Brasil', workplace: 'remoto', description: '' }, prefs);
  const net = scoreJob({ title: 'Full Stack .NET Engineer', location: 'Brasil', workplace: 'remoto', description: '' }, prefs);
  const js = scoreJob({ title: 'Desenvolvedor JavaScript Júnior', location: 'Brasil', workplace: 'remoto', description: '' }, prefs);
  assert.equal(mid.block, 'nivel');
  assert.ok(net.reasons.some((r) => /\.net/.test(r.text)));
  assert.ok(!js.reasons.some((r) => /Stack principal/.test(r.text)));
});

test('Nota: anos de experiência pedidos e cargos de liderança', () => {
  const tres = scoreJob({ title: 'Desenvolvedor Full Stack', location: 'Brasil', workplace: 'remoto', description: 'Requisitos: 3 anos de experiência com React' }, prefs);
  const cinco = scoreJob({ title: 'Python Developer', location: 'Brasil', workplace: 'remoto', description: '5+ years of experience' }, prefs);
  const um = scoreJob({ title: 'Desenvolvedor Front-end', location: 'Brasil', workplace: 'remoto', description: 'Experiência de 1 ano de experiência com HTML e CSS' }, prefs);
  const leader = scoreJob({ title: 'Squad Leader', location: 'Brasil', workplace: 'remoto', description: '' }, prefs);
  assert.ok(tres.reasons.some((r) => /3\+ anos/.test(r.text)));
  assert.equal(cinco.block, 'nivel');
  assert.ok(um.reasons.some((r) => /até 1 ano/.test(r.text)));
  assert.ok(leader.score <= 25);
});

test('GitHub (frontendbr/vagas): issue vira vaga, com local, formato, nível e como se candidatar', async () => {
  const { mapGithubIssue } = await import('../src/collectors/extras.js');
  const issue = {
    number: 9123, title: '[Remoto] Desenvolvedor Front-end Júnior na Acme', html_url: 'https://github.com/frontendbr/vagas/issues/9123',
    created_at: '2026-11-20T12:00:00Z', labels: [{ name: 'Remoto' }, { name: 'Júnior' }, { name: 'CLT' }],
    body: '## Descrição da vaga\nReact e TypeScript.\n\n## Como se candidatar\nEnvie seu currículo para vagas@acme.com.br',
  };
  const j = mapGithubIssue(issue, 'frontendbr/vagas');
  assert.equal(j.title, 'Desenvolvedor Front-end Júnior na Acme');
  assert.equal(j.company, 'Acme');
  assert.equal(j.workplace, 'remoto');
  assert.equal(j.employmentType, 'Júnior · CLT');
  assert.equal(j.applyMode, 'email');
  assert.equal(j.applyEmail, 'vagas@acme.com.br');
  const comLink = mapGithubIssue({ ...issue, body: '## Como se candidatar\nhttps://acme.gupy.io/jobs/1' }, 'frontendbr/vagas');
  assert.equal(comLink.applyUrl, 'https://acme.gupy.io/jobs/1');
});

test('Áreas de entrada: suporte, QA e UI/UX sobem; "sem experiência" e "paga bem" ajudam; área desligada some', () => {
  const sup = scoreJob({ title: 'Analista de Suporte Técnico N1', location: 'Goiânia, GO', workplace: 'presencial', description: 'Não é necessária experiência, oferecemos treinamento completo.' }, prefs);
  const qa = scoreJob({ title: 'Analista de Testes Júnior', location: 'Brasil', workplace: 'remoto', description: 'Conhecimento em SQL e lógica de programação' }, prefs);
  const ux = scoreJob({ title: 'UI/UX Designer Júnior', location: 'Brasil', workplace: 'remoto', description: 'Figma, design system', salaryText: 'R$ 3.500,00' }, prefs);
  const dados = scoreJob({ title: 'Analista de Dados Júnior', location: 'Brasil', workplace: 'remoto', description: '' }, prefs);
  const devJr = scoreJob({ title: 'Desenvolvedor Júnior', location: 'Brasil', workplace: 'remoto', description: '' }, prefs);
  assert.ok(sup.reasons.some((r) => /Suporte técnico/.test(r.text)) && sup.reasons.some((r) => /começando/.test(r.text)));
  assert.ok(sup.score >= 85, `suporte ${sup.score}`);
  assert.ok(qa.score >= 80, `qa ${qa.score}`);
  assert.ok(ux.reasons.some((r) => /Paga bem/.test(r.text)));
  assert.equal(dados.block, 'area'); // "Dados" vem desligado por padrão
  assert.ok(sup.score > devJr.score, 'entrada em suporte deve vir antes de dev júnior genérico');
  const comDados = scoreJob({ title: 'Analista de Dados Júnior', location: 'Brasil', workplace: 'remoto', description: '' }, { ...prefs, areas: [...prefs.areas, 'dados'] });
  assert.equal(comDados.block, null);
});

test('Vagas exclusivas PcD, idioma que você não tem e títulos fora de TI ficam escondidos', () => {
  const pcd = scoreJob({ title: 'Analista de Testes e QA Júnior - Exclusiva PCD', location: 'Brasil', workplace: 'remoto', description: '' }, prefs);
  const esp = scoreJob({ title: 'Assistente de Suporte N1 - Espanhol', location: 'Brasil', workplace: 'remoto', description: '' }, prefs);
  const fora = scoreJob({ title: 'Analista de Logística', location: 'Brasil', workplace: 'remoto', description: 'Excel' }, prefs);
  const ti = scoreJob({ title: 'Estágio em Governança de TI', location: 'Brasil', workplace: 'remoto', description: '' }, prefs);
  assert.equal(pcd.block, 'perfil');
  assert.equal(esp.block, 'perfil');
  assert.equal(fora.block, 'area');
  assert.equal(ti.block, null);
  assert.equal(scoreJob({ title: 'Analista de Testes - Exclusiva PCD', location: 'Brasil', workplace: 'remoto', description: '' }, { ...prefs, pcd: true }).block, null);
});
