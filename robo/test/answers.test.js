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
