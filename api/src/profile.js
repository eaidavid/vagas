// Perfil do candidato: dados do currículo, preferências de busca e banco de respostas
// que o robô usa nos formulários. Tudo editável na tela Perfil; isto é só o ponto de partida.
import { kvGet, kvSet } from './db.js';

export const DEFAULT_PROFILE = {
  nome: 'David Alves Cavalcante',
  titulo: 'Desenvolvedor Front-end | Estudante de ADS | Designer Gráfico',
  email: process.env.ADMIN_EMAIL || '',
  telefone: '',
  cidade: 'Aparecida de Goiânia',
  estado: 'GO',
  links: {
    github: 'https://github.com/eaidavid',
    linkedin: 'https://www.linkedin.com/in/davidalves',
    portfolio: 'https://portfoliododavid.vercel.app/',
  },
  resumo:
    'Em formação em Análise e Desenvolvimento de Sistemas. Experiência prática em desenvolvimento front-end com HTML, CSS e frameworks modernos. Busca constante por inovação, código limpo e performance. Aprendizado rápido, trabalho em equipe e visão de produto. Diferencial em design gráfico e UI/UX.',
  habilidades: ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Tailwind', 'Node.js', 'PostgreSQL', 'Git', 'GitHub', 'Figma', 'Postman', 'APIs REST', 'Docker', 'UI/UX'],
  formacao: 'Tecnólogo em Análise e Desenvolvimento de Sistemas, Unyleya, 2025 a 2027 (em andamento)',
  certificacoes: ['Full Stack Rocketseat', 'HTML, CSS, JavaScript e TypeScript (Júlio Souza)', 'Bootcamp OneBitCode Mestre', 'Git & GitHub (B7Web)'],
  ingles: 'Básico (leitura técnica)',

  preferencias: {
    // O que buscar nos sites (cada termo vira uma busca)
    termos: ['desenvolvedor front-end júnior', 'desenvolvedor júnior', 'programador júnior', 'desenvolvedor react', 'estágio desenvolvimento', 'desenvolvedor web'],
    // Remoto: aceita de qualquer lugar. Híbrido/presencial: só nestas cidades
    cidadesPresencial: ['Goiânia', 'Aparecida de Goiânia', 'Senador Canedo', 'Trindade', 'Goianira'],
    aceitaRemoto: true,
    aceitaHibrido: true,
    aceitaPresencial: true,
    salarioMinimo: 2000,
    aceitaEstagio: true,
    notaMinimaFeed: 40,
  },

  // Empresas que publicam vagas no Greenhouse ou no Lever (o nome que aparece na URL do quadro de vagas)
  empresas: { greenhouse: [], lever: [] },

  // Banco de respostas: o robô usa isto nos formulários. Pergunta nova que ele não souber vira "precisa de você"
  // e, depois que você responde, entra aqui.
  respostas: [
    { pergunta: 'Pretensão salarial', resposta: 'R$ 2.500' },
    { pergunta: 'Disponibilidade para início', resposta: 'Imediata' },
    { pergunta: 'Nível de inglês', resposta: 'Básico (leitura de documentação técnica)' },
    { pergunta: 'Tem disponibilidade para trabalho presencial/híbrido em Goiânia?', resposta: 'Sim' },
    { pergunta: 'Está cursando ensino superior?', resposta: 'Sim, Análise e Desenvolvimento de Sistemas na Unyleya, conclusão prevista em 2027' },
    { pergunta: 'Possui experiência com React?', resposta: 'Sim, em projetos pessoais (portfólio e painel administrativo do Sistema AfiliadosBet)' },
    { pergunta: 'Pessoa com deficiência (PcD)?', resposta: 'Não' },
  ],
};

export async function getProfile() {
  const saved = await kvGet('profile');
  if (!saved) return structuredClone(DEFAULT_PROFILE);
  return {
    ...DEFAULT_PROFILE,
    ...saved,
    links: { ...DEFAULT_PROFILE.links, ...saved.links },
    preferencias: { ...DEFAULT_PROFILE.preferencias, ...saved.preferencias },
    empresas: { ...DEFAULT_PROFILE.empresas, ...saved.empresas },
  };
}

export async function saveProfile(p) {
  await kvSet('profile', p);
}
