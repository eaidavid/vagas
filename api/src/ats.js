// Descobre em qual sistema a candidatura acontece, a partir do link de aplicação,
// e o quanto o robô consegue fazer sozinho nele.

const RULES = [
  [/(^|\.)gupy\.io$/, 'gupy'],
  [/(^|\.)greenhouse\.io$/, 'greenhouse'],
  [/(^|\.)lever\.co$/, 'lever'],
  [/(^|\.)myworkdayjobs\.com$|(^|\.)workday\.com$/, 'workday'],
  [/(^|\.)solides\.(com|jobs)(\.br)?$|vagas\.solides\.com\.br$/, 'solides'],
  [/(^|\.)kenoby\.com$/, 'kenoby'],
  [/(^|\.)inhire\.(app|com\.br)$/, 'inhire'],
  [/(^|\.)recrutei\.com\.br$/, 'recrutei'],
  [/(^|\.)pandape\.(com\.br|infojobs\.com\.br)$/, 'pandape'],
  [/(^|\.)ashbyhq\.com$/, 'ashby'],
  [/(^|\.)workable\.com$/, 'workable'],
  [/(^|\.)smartrecruiters\.com$/, 'smartrecruiters'],
  [/(^|\.)99jobs\.com$/, '99jobs'],
  [/(^|\.)abler\.com\.br$/, 'abler'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)programathor\.com\.br$/, 'programathor'],
  [/(^|\.)remotar\.com\.br$/, 'remotar'],
  [/(^|\.)github\.com$/, 'github'],
];

export const ATS_INFO = {
  linkedin_easy: { nome: 'LinkedIn (Candidatura simplificada)', robo: 'auto' },
  gupy: { nome: 'Gupy', robo: 'auto' },
  greenhouse: { nome: 'Greenhouse', robo: 'auto' },
  lever: { nome: 'Lever', robo: 'auto' },
  ashby: { nome: 'Ashby', robo: 'auto' },
  workable: { nome: 'Workable', robo: 'tentativa' },
  workday: { nome: 'Workday', robo: 'tentativa' },
  solides: { nome: 'Sólides', robo: 'tentativa' },
  kenoby: { nome: 'Kenoby', robo: 'tentativa' },
  inhire: { nome: 'InHire', robo: 'tentativa' },
  recrutei: { nome: 'Recrutei', robo: 'tentativa' },
  pandape: { nome: 'Pandapé', robo: 'tentativa' },
  smartrecruiters: { nome: 'SmartRecruiters', robo: 'tentativa' },
  '99jobs': { nome: '99jobs', robo: 'tentativa' },
  abler: { nome: 'Abler', robo: 'tentativa' },
  linkedin: { nome: 'LinkedIn', robo: 'tentativa' },
  linkedin_externo: { nome: 'Site externo (via LinkedIn)', robo: 'tentativa' },
  programathor: { nome: 'Programathor', robo: 'tentativa' },
  remotar: { nome: 'Remotar', robo: 'tentativa' },
  github: { nome: 'GitHub (comunidade)', robo: 'manual' },
  email: { nome: 'Candidatura por e-mail', robo: 'manual' },
  site: { nome: 'Site da empresa', robo: 'tentativa' },
  desconhecido: { nome: 'A descobrir', robo: 'tentativa' },
};

export function detectAts(url) {
  if (!url) return 'desconhecido';
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'desconhecido';
  }
  for (const [re, name] of RULES) if (re.test(host)) return name;
  return 'site';
}

/* Chave para reconhecer a mesma candidatura vinda de sites diferentes (ex.: LinkedIn que leva para a Gupy) */
export function applyKey(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    let path = u.pathname.replace(/\/+$/, '').replace(/\/apply$/, '');
    const g = /gupy\.io$/.test(u.hostname) && path.match(/^\/job\/([A-Za-z0-9_=-]+)$/);
    if (g) {
      try { const id = JSON.parse(Buffer.from(g[1], 'base64').toString('utf8')).jobId; if (id) path = `/jobs/${id}`; } catch { /* mantém */ }
    }
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${path}`.toLowerCase();
  } catch {
    return null;
  }
}
