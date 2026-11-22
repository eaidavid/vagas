// Fontes extras de vagas: Remotar (API aberta, só remotas), Programathor (só tecnologia) e
// os repositórios de vagas da comunidade no GitHub (frontendbr, react-brasil...).
import * as cheerio from 'cheerio';
import { fetchJson, fetchText, jitter } from './http.js';

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

/* ---------- Remotar: as vagas mais recentes (a busca deles é ampla; quem filtra é a nossa nota) ---------- */
export function mapRemotar(j) {
  const sal = j.jobSalary && j.jobSalary.type !== 'uninformed' && (j.jobSalary.from || j.jobSalary.to)
    ? `R$ ${j.jobSalary.from || j.jobSalary.to}${j.jobSalary.to && j.jobSalary.to !== j.jobSalary.from ? ` - R$ ${j.jobSalary.to}` : ''}` : null;
  const page = `https://remotar.com.br/job/${j.id}`;
  return {
    source: 'remotar',
    externalId: String(j.id),
    title: clean(j.title),
    company: j.company?.name || j.companyDisplayName || '',
    location: [j.city, j.state].filter(Boolean).join(', ') || 'Remoto (Brasil)',
    workplace: j.type === 'remote' || (j.jobTags || []).some((t) => /remot/i.test(t.name || '')) ? 'remoto' : null,
    salaryText: sal,
    postedAt: j.createdAt || null,
    url: page,
    applyUrl: j.isExternalLink && j.externalLink ? j.externalLink.replace(/[?&]utm_[^&]*/g, '').replace(/\?$/, '') : page,
    applyMode: 'externo',
    logo: j.company?.logo || null,
    descriptionHtml: `${j.description || ''}${j.moreInfos || ''}`,
  };
}

export async function collectRemotar({ termos }, { log, emit }) {
  let n = 0;
  const seen = new Set();
  const buscas = [...new Set(['desenvolvedor', ...termos.map((t) => t.split(' ')[0])])].slice(0, 3);
  for (const termo of buscas) {
    for (let page = 1; page <= 4; page++) {
      let data;
      try {
        data = await fetchJson(`https://api.remotar.com.br/jobs?search=${encodeURIComponent(termo)}&page=${page}`);
      } catch (e) {
        if (!n) throw new Error(`a API do Remotar não respondeu (${e.message})`);
        log(`Remotar: página ${page} falhou (${e.message})`);
        break;
      }
      for (const j of data.data || []) {
        if (!j.active || j.expired || seen.has(j.id)) continue;
        seen.add(j.id);
        await emit(mapRemotar(j));
        n++;
      }
      if (!data.meta?.next_page_url) break;
      await jitter(800, 1800);
    }
  }
  return n;
}

/* ---------- Programathor: busca por termo, card já traz local, nível e contrato ---------- */
export function parseProgramathor(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('.cell-list a[href^="/jobs/"]').each((_, a) => {
    const href = $(a).attr('href');
    const m = href.match(/^\/jobs\/(\d+)/);
    if (!m) return;
    const info = $(a).find('.cell-list-content-icon span').map((__, s) => clean($(s).text())).get();
    const title = clean($(a).find('h3').clone().children('.new-label').remove().end().text());
    out.push({
      id: m[1],
      title,
      company: info[0] || '',
      location: info[1] || '',
      level: info.find((t) => /j[uú]nior|pleno|s[eê]nior|est[aá]gio|trainee/i.test(t)) || null,
      contract: info.find((t) => /clt|pj|est[aá]gio|freela/i.test(t)) || null,
      tags: $(a).find('.tag-list').map((__, s) => clean($(s).text())).get(),
      url: `https://programathor.com.br${href}`,
      logo: $(a).find('img').attr('src') || null,
    });
  });
  return out;
}

export async function collectProgramathor(_, { log, emit, prefilter }) {
  let n = 0;
  const seen = new Set();
  // A busca por termo do site é ignorada; as páginas trazem as vagas mais recentes (15 por página)
  for (let page = 1; page <= 4; page++) {
    let cards;
    try {
      cards = parseProgramathor(await fetchText(page === 1 ? 'https://programathor.com.br/jobs' : `https://programathor.com.br/jobs/page/${page}`));
    } catch (e) {
      if (page === 1) throw new Error(`o Programathor não respondeu (${e.message})`);
      log(`Programathor: página ${page} falhou (${e.message})`);
      break;
    }
    if (!cards.length) break;
    for (const c of cards) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const remote = /remot/i.test(c.location);
      const job = {
        source: 'programathor',
        externalId: c.id,
        title: c.title,
        company: c.company,
        location: remote ? 'Remoto' : c.location,
        workplace: remote ? 'remoto' : /h[ií]brid/i.test(c.location) ? 'hibrido' : null,
        employmentType: [c.level, c.contract].filter(Boolean).join(' · ') || null,
        url: c.url,
        applyUrl: c.url,
        applyMode: 'externo',
        logo: c.logo,
        descriptionHtml: c.tags.length ? `Tecnologias: ${c.tags.join(', ')}` : '',
      };
      // Descrição completa só das que passam no primeiro filtro (economiza visitas ao site)
      if (prefilter(job)) {
        await jitter(1000, 2200);
        try {
          const $ = cheerio.load(await fetchText(c.url));
          const desc = $('.line-height-2-4').map((_, el) => $(el).html()).get().join('\n') || $('.wrapper-content-job-show, .job-description, article').first().html() || '';
          if (desc) job.descriptionHtml = `${desc}\n${job.descriptionHtml}`;
          const sal = clean($('body').text()).match(/sal[aá]rio[^R$]{0,20}(R\$\s?[\d.,]+(?:\s?(?:a|-|até)\s?R\$\s?[\d.,]+)?)/i);
          if (sal) job.salaryText = sal[1];
        } catch (e) {
          log(`Programathor: detalhe ${c.id} falhou (${e.message})`);
        }
      }
      await emit(job);
      n++;
    }
    await jitter(1000, 2000);
  }
  return n;
}

/* ---------- GitHub: vagas publicadas como issues nos repositórios da comunidade ---------- */
export const GITHUB_REPOS = ['frontendbr/vagas', 'react-brasil/vagas', 'backend-br/vagas'];

export function mapGithubIssue(issue, repo) {
  const labels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
  const has = (re) => labels.some((l) => re.test(l));
  const body = issue.body || '';
  // Link de candidatura: primeiro link http na seção "Como se candidatar" (se não houver, a própria issue)
  const how = body.split(/#+\s*como se candidatar/i)[1] || '';
  const link = (how.match(/https?:\/\/[^\s)>\]]+/) || [])[0] || null;
  const email = (how.match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [])[0] || null;
  const cityLabel = labels.find((l) => /^[A-ZÀ-Ú][\wÀ-ú\s]+(-\s?[A-Z]{2})?$/.test(l) && !/^(CLT|PJ|Remoto|J[uú]nior|Pleno|S[eê]nior|Est[aá]gio|Alocado|H[ií]brido|Especialista|Freela|Trainee)$/i.test(l));
  // Empresa costuma vir no título: "[São Paulo] Front-end Júnior na Empresa X"
  const company = (issue.title.match(/\b(?:na|no|@|at)\s+([^[\]()|-]+?)\s*(?:[[(|-]|$)/i) || [])[1] || '';
  return {
    source: 'github',
    externalId: `${repo}#${issue.number}`,
    title: clean(issue.title.replace(/^\s*\[[^\]]*\]\s*/g, '')),
    company: clean(company) || repo.split('/')[0],
    location: has(/remoto/i) ? 'Remoto' : cityLabel || clean((issue.title.match(/^\s*\[([^\]]+)\]/) || [])[1] || ''),
    workplace: has(/remoto/i) ? 'remoto' : has(/h[ií]brido/i) ? 'hibrido' : has(/alocado|presencial/i) ? 'presencial' : null,
    employmentType: labels.filter((l) => /^(CLT|PJ|Est[aá]gio|Freela|J[uú]nior|Pleno|S[eê]nior|Trainee)$/i.test(l)).join(' · ') || null,
    postedAt: issue.created_at,
    url: issue.html_url,
    applyUrl: link && !/github\.com/.test(link) ? link : issue.html_url,
    applyMode: link ? 'externo' : 'email',
    applyEmail: email,
    descriptionHtml: body.replace(/\r/g, ''),
  };
}

export async function collectGithub(_, { log, emit }) {
  let n = 0;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  for (const repo of GITHUB_REPOS) {
    try {
      const issues = await fetchJson(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100&since=${since}`, { headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' } });
      for (const i of issues) {
        if (i.pull_request) continue;
        await emit(mapGithubIssue(i, repo));
        n++;
      }
    } catch (e) {
      log(`GitHub ${repo}: falhou (${e.message})`);
    }
    await jitter(500, 1200);
  }
  return n;
}
