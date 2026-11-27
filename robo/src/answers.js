// Decide o que responder em cada campo: primeiro os dados do perfil (nome, e-mail, links...),
// depois o banco de respostas. O que não souber volta como pergunta para você.

export const norm = (s = '') =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[*✱:?]/g, ' ').replace(/\s+/g, ' ').trim();

const STOP = new Set('a o as os de da do das dos e em no na nos nas um uma para por com que voce sua seu you your the of to in for and or is are do does what qual quais are please this esta este have has tem possui'.split(' '));
const words = (s) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)));

export function similarity(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size) * (inter / Math.max(A.size, B.size)) ** 0.5;
}

/** Procura no banco de respostas a pergunta mais parecida */
export function fromBank(label, bank = []) {
  let best = null, score = 0;
  for (const qa of bank) {
    if (!qa.pergunta || !qa.resposta) continue;
    if (norm(qa.pergunta) === norm(label)) return qa.resposta;
    const s = similarity(label, qa.pergunta);
    if (s > score) { score = s; best = qa; }
  }
  return score >= 0.55 ? best.resposta : null;
}

function splitName(full = '') {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') };
}

export function coverLetter(profile, job) {
  if (job.claude?.carta) return job.claude.carta;
  return [
    `Olá! Tenho interesse na vaga de ${job.title}${job.company ? ` na ${job.company}` : ''}.`,
    profile.resumo,
    `Trabalho com ${profile.habilidades.slice(0, 8).join(', ')}. Meu portfólio: ${profile.links.portfolio}`,
    `Obrigado pela oportunidade,\n${profile.nome}`,
  ].join('\n\n');
}

const EEO = /\b(gender|genero|sexo|race|raca|ethnic|etnia|hispanic|latino|veteran|disability|deficiencia|pronoun|pronome|sexual orientation|orientacao sexual)\b/;
export const DECLINE = /prefer not|decline|don.?t wish|do not wish|choose not|nao desejo|prefiro nao|nao informar|i don.?t want/;

/**
 * field: { label, name, id, kind, autocomplete, placeholder, required }
 * Devolve { value } (texto), { file: 'curriculo' }, { decline: true } ou null (não sabe).
 */
export function answerFor(field, profile, job) {
  const key = norm(`${field.label} ${field.name || ''} ${field.id || ''} ${field.autocomplete || ''} ${field.placeholder || ''}`);
  const label = norm(field.label);
  const { first, last } = splitName(profile.nome);
  const L = profile.links || {};

  if (field.kind === 'file') {
    if (/resume|curriculo|cv\b|curriculum/.test(key) || (!/cover|carta/.test(key) && field.required)) return { file: 'curriculo' };
    return null; // carta em arquivo: pula (é opcional quase sempre)
  }
  if (EEO.test(label)) return { decline: true };

  // Respostas que o Claude preparou para ESTA vaga vêm antes de tudo
  const perJob = fromBank(field.label, job.claude?.respostas);
  if (perJob) return { value: perJob };
  // O banco de respostas vem primeiro para perguntas (você pode sobrescrever qualquer coisa por ele)
  const bank = fromBank(field.label, profile.respostas);
  if (bank && field.label.length > 25) return { value: bank };

  if (/first name|primeiro nome|given name|^nome$|firstname/.test(key) && !/last|sobrenome/.test(label)) return { value: first };
  if (/last name|sobrenome|family name|surname|lastname/.test(key)) return { value: last };
  if (/preferred name|nome preferido|como prefere ser chamad|name you.?d prefer/.test(key)) return { value: first };
  if (/pronunciation|pronounce|pronuncia/.test(key)) return null;
  if (/full name|nome completo|^name\b|\bname$|^nome\b/.test(key) && !/company|empresa|school|universi|reference/.test(key)) return { value: profile.nome };
  if (/e-?mail/.test(key)) return { value: profile.email };
  if (/phone|telefone|celular|whatsapp|mobile|\btel\b/.test(key)) return profile.telefone ? { value: profile.telefone } : null;
  if (/linkedin/.test(key)) return { value: L.linkedin };
  if (/github/.test(key)) return { value: L.github };
  if (/portfolio|website|site pessoal|personal site|\burl\b|blog/.test(key)) return { value: L.portfolio || L.github };
  if (/current company|empresa atual|current employer|^org$/.test(key)) return { value: field.required ? 'Projetos próprios (freelancer)' : '' };
  if (/\b(country|pais)\b/.test(label) && !/sponsor|visa|work|authoriz/.test(label)) return { value: 'Brasil', alt: ['Brazil'] };
  if (/\b(state|estado|uf)\b/.test(label) && !/united states/.test(label)) return { value: profile.estado === 'GO' ? 'Goiás' : profile.estado };
  if (/\b(city|cidade|location|localizacao|localidade)\b|where are you (based|located)|onde voce mora/.test(key) && !/privacidade|politica/.test(label)) return { value: `${profile.cidade}, ${profile.estado}, Brasil` };
  if (/cover letter|carta de apresentacao|why do you want|por que voce quer|why are you interested|motivation|motivacao/.test(key) && field.kind === 'textarea') return { value: coverLetter(profile, job) };
  if (/how (did )?you (hear|find|learn)|heard about|como (voce )?(soube|conheceu|ficou sabendo|chegou)|onde (voce )?viu|source|fonte/.test(label)) return { value: 'LinkedIn', alt: ['Job board', 'Site de vagas', 'Other', 'Outro'] };

  if (bank) return { value: bank };
  return smartAnswer(field, profile, job, label);
}

/* Habilidades do currículo com apelidos, para responder "tem experiência com X?" com honestidade */
const SKILL_ALIASES = {
  html: /\bhtml5?\b/, css: /\bcss3?\b/, javascript: /\b(javascript|js)\b/, typescript: /\b(typescript|ts)\b/, react: /\breact/,
  tailwind: /\btailwind/, 'node.js': /\bnode/, postgresql: /\b(postgres|postgresql|sql)\b/, git: /\bgit\b/, github: /\bgithub\b/,
  figma: /\bfigma\b/, postman: /\bpostman\b/, 'apis rest': /\b(api|apis|rest)\b/, docker: /\bdocker\b/, 'ui/ux': /\b(ui|ux|usabilidade)\b/,
};
const TECH_WORDS = /\b(java|python|php|c#|\.net|ruby|golang|kotlin|swift|flutter|angular|vue|aws|azure|gcp|kubernetes|linux|windows server|redes|excel|power ?bi|sap|salesforce|jira|selenium|cypress|ruby|sql server|oracle|mongodb|delphi|cobol|photoshop|illustrator)\b/;
const yes = { value: 'Sim', alt: ['Yes', 'Concordo', 'Aceito', 'Estou ciente', 'I agree'] };

/**
 * Respostas automáticas para as perguntas mais comuns de formulário, só com o que é verdade no perfil.
 * O que não dá para responder com segurança (CPF, idade, CNH, viagens, plantão...) continua indo para "precisa de você".
 */
function smartAnswer(field, profile, job, label) {
  const auto = (r) => (r ? { ...r, auto: true } : null);
  const isChoice = ['radio', 'select', 'combobox', 'checkbox'].includes(field.kind);
  const skills = (profile.habilidades || []).map((h) => norm(h));

  // Nunca inventar documentos ou dados pessoais que não estão no perfil
  if (/\b(cpf|rg|cnh|carteira de motorista|data de nascimento|idade|birth|age|endereco|cep|numero da casa|pis)\b/.test(label)) return null;

  // Coisas de vida pessoal que só você decide (viagens, plantão, fim de semana, mudança de cidade)
  const pessoal = /viag|travel|plantao|fim de semana|fins de semana|weekend|mudar de cidade|mudanca|relocat|noturno|madrugada/.test(label);

  // Aceites e declarações
  if (!pessoal && /\b(concorda|aceita|aceito|esta ciente|estou ciente|declaro|autoriza|confirmo|li e aceito|i agree|i acknowledge|i confirm|consent|i have read)\b/.test(label)) return auto(yes);

  // Disponibilidade de início e regime (local já foi filtrado pela nota)
  if (/(quando|data).{0,20}(comecar|iniciar|inicio)|disponibilidade (para|de) (inicio|comecar|iniciar)|start date|when can you start|earliest start/.test(label)) return auto({ value: 'Imediata', alt: ['Imediatamente', 'Immediately', 'Imediato'] });
  if (/disponibilidade (para|de) trabalh(ar|o) (presencial|hibrido|remoto|home office|em goiania|na regiao)|horario comercial|trabalhar (de forma )?(remota|hibrida)|regime (hibrido|remoto)/.test(label)) return auto(yes);
  if (!pessoal && /(gostaria|tem interesse|interessad|esta disposto|estaria disposto|would you be willing|are you interested|deseja participar)/.test(label)) return auto(yes);

  // Anos de experiência: honesto (início de carreira)
  if (/(quantos anos|anos de experiencia|tempo de experiencia|years of (professional )?experience|how many years)/.test(label)) {
    if (field.inputType === 'number') return auto({ value: '0' });
    return auto({ value: 'Menos de 1 ano', alt: ['Até 1 ano', 'Sem experiência', 'Nenhuma', '0', 'Less than 1 year', 'No experience', '0-1'] });
  }

  // "Tem experiência/conhecimento com X?"
  if (/(possui|tem|voce tem|do you have|have you|conhece|domina).{0,30}(experiencia|conhecimento|familiaridade|vivencia|experience|knowledge)|(experiencia|conhecimento|experience|knowledge) (com|em|with|in) /.test(label)) {
    const known = Object.entries(SKILL_ALIASES).find(([name, re]) => re.test(label) && skills.some((s) => s.includes(name.split(' ')[0])));
    if (known) {
      const nome = (profile.habilidades || []).find((h) => norm(h).includes(known[0].split(' ')[0])) || known[0];
      return auto(isChoice ? yes : { value: `Sim, uso ${nome} em projetos pessoais e no curso de ADS.` });
    }
    if (TECH_WORDS.test(label) || isChoice) return auto(isChoice ? { value: 'Não', alt: ['No'] } : { value: 'Ainda não tenho experiência prática com isso, mas estou estudando e aprendo rápido.' });
  }

  // Formação
  if (/(escolaridade|grau de (instrucao|escolaridade)|nivel de (ensino|instrucao|escolaridade)|formacao academica|education level|highest (level of )?education|degree)/.test(label)) {
    return auto({ value: 'Superior em andamento', alt: ['Ensino superior incompleto', 'Superior incompleto', 'Cursando ensino superior', 'Graduação em andamento', 'Tecnólogo em andamento', "Bachelor's degree (in progress)", 'Some college'] });
  }
  if (/(esta cursando|cursando (ensino )?superior|estudante|currently (enrolled|studying)|matriculad)/.test(label)) return auto(isChoice ? yes : { value: profile.formacao });
  if (/(instituicao|faculdade|universidade|university|college|school name)/.test(label)) return auto({ value: 'Unyleya' });
  if (/^(curso|course|major|area de formacao)|nome do curso|qual (o )?(seu )?curso/.test(label)) return auto({ value: 'Análise e Desenvolvimento de Sistemas' });
  if (/(ano de (conclusao|formatura)|previsao de (conclusao|formatura)|graduation (year|date)|expected graduation)/.test(label)) return auto({ value: '2027' });

  // Textos abertos sobre você: usa a carta (a do Claude, se ele preparou para esta vaga)
  if (field.kind === 'textarea' && /(fale (um pouco )?sobre|conte (um pouco )?sobre|apresente-se|tell us (a bit )?about|about yourself|por que (voce|vc)|why (do )?you|motivacao|mensagem|recrutador|informacoes adicionais|additional information|comentarios|observacoes|resumo profissional)/.test(label)) {
    return auto({ value: coverLetter(profile, job) });
  }
  return null;
}

/** Escolhe a opção que corresponde à resposta (sim/não, igualdade, contém) */
export function pickOption(answer, options) {
  const a = norm(answer);
  const opts = options.map((o, i) => ({ i, n: norm(o) })).filter((o) => o.n && !/^(select|selecione|choose|escolha|click here|--)/.test(o.n));
  const yes = /^(sim|yes|s|y)\b/.test(a), no = /^(nao|no|n)\b/.test(a);
  for (const o of opts) if (o.n === a) return o.i;
  if (yes) { const o = opts.find((x) => /^(sim|yes)\b/.test(x.n)); if (o) return o.i; }
  if (no) { const o = opts.find((x) => /^(nao|no)\b/.test(x.n)); if (o) return o.i; }
  const within = (big, small) => small.length >= 3 && new RegExp(`(^|[^a-z0-9])${small.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(big);
  for (const o of opts) if (within(o.n, a) || within(a, o.n)) return o.i;
  let best = -1, score = 0;
  for (const o of opts) { const s = similarity(a, o.n); if (s > score) { score = s; best = o.i; } }
  return score >= 0.5 ? best : -1;
}
