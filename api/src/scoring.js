// Nota de 0 a 100 de quanto a vaga combina com o perfil, com os motivos em português.
// É uma conta local e transparente: não gasta nada e você vê exatamente por que cada vaga subiu ou caiu.

export const norm = (s = '') =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const has = (text, re) => re.test(text);

const AREA = /\b(desenvolvedor|desenvolvedora|developer|dev|programador|programadora|front[\s-]?end|frontend|full[\s-]?stack|fullstack|react|javascript|typescript|node|software engineer|software developer|engenheir[oa] de software|desenvolvimento de software|analista de desenvolvimento|analista desenvolvedor|web developer|desenvolvimento web|ui engineer|ui developer)\b/;
const LEVEL_UP = /\b(senior|sr\.?|pleno|pl\.?|mid[\s-]?level|mid|intermediate|especialista|specialist|lead|lider|tech lead|staff|principal|gerente|manager|coordenador|coordenadora|head|arquitet[oa]|architect|iii|ii)\b/;
const LEVEL_OK = /\b(junior|jr\.?|estagio|estagiari[oa]|trainee|aprendiz|iniciante|entry|intern|internship|primeiro emprego)\b/;
const INTERN = /\b(estagio|estagiari[oa]|intern|internship)\b/;
const OTHER_AREA = /\b(vendas|vendedor|comercial|suporte|help ?desk|motorista|atendente|financeiro|contabil|marketing|analytics|seo|growth|trafego|social media|recepcionista|auxiliar administrativo|enfermeir|professor|analista de dados|cientista de dados|qa manual)\b/;
// Linguagens fora do currículo: se aparecem no TÍTULO, a vaga é de outra stack
const OTHER_STACK = /(?:^|[^a-z0-9])(java|\.net|dotnet|c#|php|python|golang|ruby|advpl|protheus|delphi|cobol|abap|sap|kotlin|swift|flutter|android|ios|salesforce|genexus|oracle|power ?bi|dados|data)(?![a-z0-9#])/;

const BRAZIL = /\b(brasil|brazil|latam|latin america|america latina|sao paulo|rio de janeiro|goias|goiania|aparecida|minas gerais|parana|santa catarina|rio grande|bahia|pernambuco|ceara|distrito federal|brasilia|curitiba|belo horizonte|porto alegre|recife|fortaleza|salvador|florianopolis|campinas|manaus|belem|vitoria|natal|joao pessoa|maceio|teresina|cuiaba|campo grande|uberlandia|ribeirao preto|sp|rj|mg|go|pr|sc|rs|ba|pe|ce|df|es|mt|ms|am|pa)\b/;
const GLOBAL = /\b(anywhere|worldwide|global|americas|remoto|remote|home office)$|^(remoto|remote|home office|hibrido|presencial)$/;
const ENGLISH = /\b(fluent english|english fluency|advanced english|ingles fluente|ingles avancado|fluencia em ingles|ingles (nivel )?(avancado|fluente))\b/;

const SKILLS = [
  ['HTML', /\bhtml5?\b/],
  ['CSS', /\bcss3?\b/],
  ['JavaScript', /\b(javascript|js|es6)\b/],
  ['TypeScript', /\b(typescript|ts)\b/],
  ['React', /\breact(\.js|js)?\b/],
  ['Next.js', /\bnext(\.js|js)\b/],
  ['Tailwind', /\btailwind/],
  ['Node.js', /\bnode(\.js|js)?\b/],
  ['PostgreSQL', /\b(postgres|postgresql|sql)\b/],
  ['Git', /\bgit(hub|lab)?\b/],
  ['Figma', /\bfigma\b/],
  ['APIs REST', /\b(rest|restful|api|apis)\b/],
  ['Docker', /\bdocker\b/],
  ['UI/UX', /\b(ui|ux|ui\/ux|usabilidade|design system)\b/],
];

/** Lê valores em reais de um texto ("R$ 2.500,00", "R$3k", "2000 - 3000") */
export function parseSalary(text) {
  if (!text) return null;
  const t = norm(text).replace(/\s+/g, ' ');
  const nums = [];
  for (const m of t.matchAll(/(?:r\$\s?)?(\d{1,3}(?:[.\s]\d{3})+|\d{3,6})(?:,\d{2})?\s?(k|mil)?/g)) {
    let v = Number(m[1].replace(/[.\s]/g, ''));
    if (m[2]) v *= 1000;
    if (v >= 500 && v <= 100000) nums.push(v);
  }
  for (const m of t.matchAll(/(\d{1,2}(?:[.,]\d)?)\s?(k|mil)\b/g)) {
    const v = Number(m[1].replace(',', '.')) * 1000;
    if (v >= 500 && v <= 100000) nums.push(v);
  }
  if (!nums.length) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

export function inCityList(location, cities) {
  const loc = norm(location);
  return cities.some((c) => loc.includes(norm(c)));
}

/**
 * job: { title, company, location, workplace: 'remoto'|'hibrido'|'presencial'|null, salaryText, description, postedAt, seniority, employmentType }
 * prefs: profile.preferencias
 */
export function scoreJob(job, prefs) {
  const title = norm(job.title);
  const desc = norm(`${job.description || ''} ${job.seniority || ''} ${job.employmentType || ''}`);
  const reasons = [];
  let score = 50;
  const plus = (n, text) => { score += n; reasons.push({ t: '+', text }); };
  const minus = (n, text) => { score -= n; reasons.push({ t: '-', text }); };
  let block = null; // motivo que derruba a vaga (fica no fim do feed, marcada)

  // Área
  if (has(title, AREA)) plus(10, 'Vaga de desenvolvimento');
  else if (has(title, OTHER_AREA)) { minus(40, 'Fora da área de desenvolvimento'); block = 'area'; }
  else minus(20, 'Título não parece de desenvolvimento');

  const otherStack = title.match(OTHER_STACK);
  if (otherStack) minus(18, `Stack principal fora do seu currículo (${otherStack[1]})`);

  // Nível
  if (has(title, LEVEL_UP) && !has(title, LEVEL_OK)) { minus(35, 'Pede nível acima de júnior'); block = block || 'nivel'; }
  else if (has(title, LEVEL_OK) || has(desc, /\b(junior|entry level|estagio|internship)\b/)) plus(15, 'Nível júnior / entrada');
  const intern = has(title, INTERN) || has(norm(job.employmentType || ''), /estagio|intern/);
  if (intern && !prefs.aceitaEstagio) { minus(30, 'Estágio (desligado nas preferências)'); block = block || 'nivel'; }

  // Local
  const wp = job.workplace;
  const nearby = inCityList(job.location, prefs.cidadesPresencial || []);
  if (wp === 'remoto') {
    if (prefs.aceitaRemoto) plus(12, 'Remoto');
    else { minus(30, 'Remoto (desligado nas preferências)'); block = block || 'local'; }
  } else if (wp === 'hibrido' || wp === 'presencial') {
    const ok = wp === 'hibrido' ? prefs.aceitaHibrido : prefs.aceitaPresencial;
    if (nearby && ok) plus(12, `${wp === 'hibrido' ? 'Híbrido' : 'Presencial'} na sua região`);
    else { minus(40, `${wp === 'hibrido' ? 'Híbrido' : 'Presencial'} fora da sua região`); block = block || 'local'; }
  } else if (nearby) plus(8, 'Na sua região');
  else if (has(norm(job.location), /remot|home ?office|anywhere|brasil$/)) plus(6, 'Parece remoto');

  // Fora do Brasil (comum nos quadros Greenhouse/Lever: "Remote, United States")
  const locN = norm(job.location);
  if (locN && !BRAZIL.test(locN) && !GLOBAL.test(locN)) { minus(30, 'Vaga de fora do Brasil'); block = block || 'local'; }
  if (ENGLISH.test(desc)) minus(15, 'Pede inglês avançado/fluente');

  // Salário
  const sal = job.salary || parseSalary(job.salaryText);
  if (sal) {
    if (sal.max < prefs.salarioMinimo) { minus(25, `Salário abaixo de R$ ${prefs.salarioMinimo.toLocaleString('pt-BR')}`); block = block || 'salario'; }
    else plus(6, `Salário informado: R$ ${sal.min.toLocaleString('pt-BR')}${sal.max !== sal.min ? ` a R$ ${sal.max.toLocaleString('pt-BR')}` : ''}`);
  }

  // Habilidades do currículo citadas na vaga
  const text = `${title} ${desc}`;
  const matched = SKILLS.filter(([, re]) => re.test(text)).map(([n]) => n);
  if (matched.length) plus(Math.min(18, matched.length * 3), `Pede o que você sabe: ${matched.slice(0, 6).join(', ')}`);

  // Recência
  if (job.postedAt) {
    const days = (Date.now() - new Date(job.postedAt).getTime()) / 86400000;
    if (days <= 2) plus(5, 'Publicada há menos de 2 dias');
    else if (days > 30) minus(10, 'Publicada há mais de um mês');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  if (block) score = Math.min(score, 25);
  return { score, reasons, block, skills: matched, intern };
}
