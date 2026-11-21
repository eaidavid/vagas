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
  if (/country|pais/.test(label) && !/sponsor|visa|work|authoriz/.test(label)) return { value: 'Brasil', alt: ['Brazil'] };
  if (/\b(state|estado|uf)\b/.test(label) && !/united states/.test(label)) return { value: profile.estado === 'GO' ? 'Goiás' : profile.estado };
  if (/city|cidade|location|localizacao|localidade|where are you (based|located)|onde voce mora/.test(key)) return { value: `${profile.cidade}, ${profile.estado}, Brasil` };
  if (/cover letter|carta de apresentacao|why do you want|por que voce quer|why are you interested|motivation|motivacao/.test(key) && field.kind === 'textarea') return { value: coverLetter(profile, job) };
  if (/how (did )?you (hear|find|learn)|heard about|como (voce )?(soube|conheceu|ficou sabendo|chegou)|onde (voce )?viu|source|fonte/.test(label)) return { value: 'LinkedIn', alt: ['Job board', 'Site de vagas', 'Other', 'Outro'] };

  if (bank) return { value: bank };
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
