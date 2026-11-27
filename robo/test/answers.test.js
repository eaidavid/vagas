import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerFor, pickOption, fromBank } from '../src/answers.js';

const profile = {
  nome: 'David Alves Cavalcante', email: 'd@example.com', telefone: '(62) 90000-0000', cidade: 'Aparecida de Goiânia', estado: 'GO',
  links: { github: 'https://github.com/x', linkedin: 'https://linkedin.com/in/x', portfolio: 'https://x.dev' },
  resumo: 'Resumo', habilidades: ['React'],
  respostas: [{ pergunta: 'Pretensão salarial', resposta: 'R$ 2.500' }, { pergunta: 'Have you previously worked at or consulted for GitLab?', resposta: 'Não' }],
};
const job = { title: 'Dev', company: 'Acme' };
const a = (label, extra = {}) => answerFor({ label, kind: 'text', ...extra }, profile, job);

test('dados do perfil vão nos campos certos', () => {
  assert.equal(a('First Name*').value, 'David');
  assert.equal(a('Last Name*').value, 'Alves Cavalcante');
  assert.equal(a('Full name ✱').value, 'David Alves Cavalcante');
  assert.equal(a('Email*').value, 'd@example.com');
  assert.equal(a('Telefone celular').value, '(62) 90000-0000');
  assert.equal(a('LinkedIn URL').value, 'https://linkedin.com/in/x');
  assert.equal(a('Current location ✱').value, 'Aparecida de Goiânia, GO, Brasil');
  assert.equal(a('Name Pronunciation | How do you pronounce your name?'), null);
  assert.deepEqual(answerFor({ label: 'Resume/CV', kind: 'file' }, profile, job), { file: 'curriculo' });
  assert.ok(a('Gender').decline);
});

test('banco de respostas acha perguntas parecidas e não inventa', () => {
  assert.equal(fromBank('Qual a sua pretensão salarial?', profile.respostas), 'R$ 2.500');
  assert.equal(a('Have you previously worked at or consulted for GitLab?*').value, 'Não');
  assert.equal(a('Are you a Singapore citizen?'), null);
});

test('escolhe a opção certa', () => {
  assert.equal(pickOption('Não', ['Select...', 'Yes', 'No']), 2);
  assert.equal(pickOption('Sim', ['Sim', 'Não']), 0);
  assert.equal(pickOption('Brasil', ['Argentina', 'Brasil', 'Chile']), 1);
  assert.equal(pickOption('Prefiro não', ['A', 'B']), -1);
});

test('carta e respostas que o Claude preparou para a vaga têm prioridade', () => {
  const jobComClaude = { ...job, claude: { carta: 'Carta feita pelo Claude', respostas: [{ pergunta: 'Pretensão salarial', resposta: 'R$ 3.000 (específica desta vaga)' }] } };
  assert.equal(answerFor({ label: 'Qual a sua pretensão salarial?', kind: 'text' }, profile, jobComClaude).value, 'R$ 3.000 (específica desta vaga)');
  assert.equal(answerFor({ label: 'Why do you want to work here? Cover letter', kind: 'textarea' }, profile, jobComClaude).value, 'Carta feita pelo Claude');
  assert.equal(answerFor({ label: 'Qual a sua pretensão salarial?', kind: 'text' }, profile, job).value, 'R$ 2.500');
});

test('respostas automáticas: só o que é verdade no perfil, e pergunta pessoal continua indo para você', () => {
  const p = { ...profile, habilidades: ['HTML', 'CSS', 'JavaScript', 'React', 'Figma'], formacao: 'ADS na Unyleya' };
  const A = (label, extra = {}) => answerFor({ label, kind: 'text', ...extra }, p, job);
  assert.equal(A('Você concorda com a política de privacidade?', { kind: 'radio' }).value, 'Sim');
  assert.equal(A('Quando você pode começar?').value, 'Imediata');
  assert.equal(A('Possui experiência com React?', { kind: 'radio' }).value, 'Sim');
  assert.equal(A('Possui experiência com Java?', { kind: 'radio' }).value, 'Não');
  assert.match(A('Descreva sua experiência com Python').value, /ainda não tenho/i);
  assert.equal(A('Quantos anos de experiência você tem?', { inputType: 'number' }).value, '0');
  assert.equal(A('Qual sua escolaridade?', { kind: 'select' }).value, 'Superior em andamento');
  assert.equal(A('Ano de conclusão do curso').value, '2027');
  assert.ok(A('Fale um pouco sobre você', { kind: 'textarea' }).value.length > 40);
  assert.ok(A('Quando você pode começar?').auto);
  // não inventa nem decide por você
  assert.equal(A('Qual o seu CPF?'), null);
  assert.equal(A('Tem disponibilidade para viagens?', { kind: 'radio' }), null);
  assert.equal(A('Aceita trabalhar aos fins de semana?', { kind: 'radio' }), null);
});
