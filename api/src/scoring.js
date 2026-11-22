// Nota de 0 a 100 de quanto a vaga combina com o perfil, com os motivos em português.
// É uma conta local e transparente: não gasta nada e você vê exatamente por que cada vaga subiu ou caiu.

// Mude este número quando a regra mudar: as vagas existentes são recalculadas ao iniciar
export const SCORE_VERSION = 4;

export const norm = (s = '') =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const has = (text, re) => re.test(text);

const AREA_DEV = /\b(desenvolvedor|desenvolvedora|developer|dev|programador|programadora|front[\s-]?end|frontend|full[\s-]?stack|fullstack|react|javascript|typescript|node|software engineer|software developer|engenheir[oa] de software|desenvolvimento de software|analista de desenvolvimento|analista desenvolvedor|web developer|desenvolvimento web|ui engineer|ui developer)\b/;

/* Áreas de entrada em tecnologia (ligadas/desligadas no Perfil). bonus = quanto a área ajuda quem está começando */
export const AREAS = {
  suporte: { nome: 'Suporte técnico / Help desk', motivo: 'Suporte técnico: porta de entrada em TI', bonus: 14,
    re: /\b(suporte (tecnico|de ti|n1|nivel 1|ao usuario|a sistemas|de sistemas|em ti)|analista de suporte|tecnico de suporte|help ?desk|service ?desk|tecnico (de|em) (ti|informatica|suporte)|auxiliar de (ti|informatica)|assistente de (ti|suporte|informatica)|atendimento (tecnico|de ti|n1))\b/ },
  qa: { nome: 'QA / Testes', motivo: 'QA/testes: entrada comum em TI', bonus: 14,
    re: /\b(qa|quality assurance|analista de (testes|qualidade de software|qa)|testador|tester|testes? de software|test analyst)\b/ },
  design: { nome: 'UI/UX e web design', motivo: 'Design de interfaces: usa o seu lado de designer', bonus: 14,
    re: /\b(ui|ux|ui\/ux|ux\/ui|product designer|designer de (produto|interface|ui|ux|experiencia)|web ?designer|designer digital|designer grafico|webdesigner)\b/ },
  implantacao: { nome: 'Implantação / Analista de sistemas', motivo: 'Implantação/sistemas: valoriza lógica e comunicação', bonus: 12,
    re: /\b(analista de (implantacao|sistemas|suporte a sistemas|erp|negocios de ti)|implantacao de (sistemas|software)|implantador|consultor(a)? (de implantacao|funcional|de sistemas|erp)|analista funcional)\b/ },
  cs: { nome: 'Customer Success / Onboarding técnico', motivo: 'Customer success em empresa de tecnologia', bonus: 8,
    re: /\b(customer success|sucesso do cliente|analista de (cs|onboarding)|onboarding( tecnico)?|customer support engineer|suporte ao cliente( tecnico)?)\b/ },
  dev: { nome: 'Desenvolvimento (júnior)', motivo: 'Vaga de desenvolvimento', bonus: 6, re: AREA_DEV },
  dados: { nome: 'Dados / BI (júnior)', motivo: 'Dados/BI júnior', bonus: 8,
    re: /\b(analista de (dados|bi)|data analyst|bi analyst|analista de business intelligence)\b/ },
};
export const AREAS_PADRAO = ['suporte', 'qa', 'design', 'implantacao', 'cs', 'dev'];
const AREA_ORDER = ['suporte', 'qa', 'design', 'implantacao', 'cs', 'dados', 'dev'];

// Sinais de que a vaga aceita quem está começando
const ENTRY_SIGNS = /\b(sem experiencia|nao (e )?(necessaria|exigida|obrigatoria) experiencia|nao precisa( ter)? experiencia|sem necessidade de experiencia|primeiro emprego|oferecemos (treinamento|capacitacao)|treinamento (completo|inicial|pago|remunerado)|capacitacao (completa|inicial|paga|remunerada)|programa de (formacao|trainee|estagio|capacitacao)|vamos te (ensinar|capacitar|treinar)|ensinamos (tudo|voce)|para iniciantes|inicio de carreira|em inicio de carreira|recem[- ]formad)/;
const LEVEL_UP = /\b(senior|sr\.?|pleno|pl\.?|mid[\s-]?level|mid|intermediate|especialista|specialist|lead|leader|lider|lideranca|tech lead|staff|principal|gerente|manager|coordenador|coordenadora|head|arquitet[oa]|architect|iii|ii)\b/;
const LEVEL_OK = /\b(junior|jr\.?|estagio|estagiari[oa]|trainee|aprendiz|iniciante|entry|intern|internship|primeiro emprego|n1|nivel 1|nivel i|assistente|auxiliar)\b/;
const INTERN = /\b(estagio|estagiari[oa]|intern|internship)\b/;
const OTHER_AREA = /\b(vendas|vendedor|comercial|motorista|atendente|financeiro|contabil|marketing|analytics|seo|growth|trafego|social media|recepcionista|auxiliar administrativo|enfermeir|professor|cientista de dados|telemarketing|operador de caixa)\b/;
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
  ['Design gráfico', /\b(photoshop|illustrator|design grafico|adobe|canva|identidade visual)\b/],
  ['Lógica e estrutura de dados', /\b(logica de programacao|estrutura de dados|algoritmos)\b/],
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

  // Área: a primeira família de entrada que o título casa
  const ligadas = prefs.areas?.length ? prefs.areas : AREAS_PADRAO;
  const area = AREA_ORDER.find((id) => AREAS[id].re.test(title)) || null;
  if (area && ligadas.includes(area)) plus(AREAS[area].bonus, AREAS[area].motivo);
  else if (area) { minus(30, `Área desligada no seu perfil (${AREAS[area].nome})`); block = 'area'; }
  else if (has(title, OTHER_AREA)) { minus(40, 'Fora das áreas de tecnologia que você escolheu'); block = 'area'; }
  else if (/\b(ti|tecnologia|sistemas|informatica|software|infraestrutura|redes)\b/.test(title)) minus(15, 'Vaga de TI fora das suas áreas principais');
  else { minus(30, 'Título não parece das áreas que você escolheu'); block = 'area'; }

  // Vaga exclusiva para PcD (o banco de respostas diz se você é PcD) e idiomas que você não tem
  if (/\b(exclusiva (para )?pc?d|vaga (exclusiva )?pcd|para pessoas com deficiencia|afirmativa pcd|pcd exclusiva)\b/.test(title) && !prefs.pcd) { minus(40, 'Vaga exclusiva para PcD'); block = block || 'perfil'; }
  const idioma = title.match(/\b(espanhol|spanish|frances|french|alemao|german|italiano|japones|mandarim)\b/);
  if (idioma && !(prefs.idiomas || []).some((x) => norm(x).includes(idioma[1].slice(0, 5)))) { minus(30, `Pede ${idioma[1]}`); block = block || 'perfil'; }

  const otherStack = area === 'dev' && title.match(OTHER_STACK);
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

  if (ENTRY_SIGNS.test(desc) || ENTRY_SIGNS.test(title)) plus(12, 'Aceita quem está começando');

  // Anos de experiência pedidos na descrição ("3 anos de experiência", "5+ years of experience")
  const yrs = [...desc.matchAll(/(?:minimo de |pelo menos |at least )?(\d{1,2})\s*\+?\s*(?:a\s*\d+\s*)?(?:anos?|years?)\s*(?:de |of )?(?:experiencia|experience|atuacao|vivencia)/g)].map((m) => Number(m[1])).filter((n) => n > 0 && n < 20);
  if (yrs.length) {
    const y = Math.min(...yrs);
    if (y >= 3) { minus(25, `Pede ${y}+ anos de experiência`); if (y >= 5) block = block || 'nivel'; }
    else if (y === 2) minus(8, 'Pede 2 anos de experiência');
    else plus(5, 'Pede até 1 ano de experiência');
  }

  // Fora do Brasil (comum nos quadros Greenhouse/Lever: "Remote, United States")
  const locN = norm(job.location);
  if (locN && !BRAZIL.test(locN) && !GLOBAL.test(locN)) { minus(30, 'Vaga de fora do Brasil'); block = block || 'local'; }
  if (ENGLISH.test(desc)) minus(15, 'Pede inglês avançado/fluente');

  // Salário
  const sal = job.salary || parseSalary(job.salaryText);
  if (sal) {
    if (sal.max < prefs.salarioMinimo) { minus(25, `Salário abaixo de R$ ${prefs.salarioMinimo.toLocaleString('pt-BR')}`); block = block || 'salario'; }
    else {
      const faixa = `R$ ${sal.min.toLocaleString('pt-BR')}${sal.max !== sal.min ? ` a R$ ${sal.max.toLocaleString('pt-BR')}` : ''}`;
      const bom = prefs.salarioBom || 3000;
      if (sal.max >= bom) plus(12, `Paga bem: ${faixa}`);
      else plus(5, `Salário informado: ${faixa}`);
    }
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
  return { score, reasons, block, skills: matched, intern, area };
}
