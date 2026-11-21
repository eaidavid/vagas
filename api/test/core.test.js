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
