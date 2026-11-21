// LinkedIn: só leitura pelas páginas públicas de busca (sem login, sem tocar na sua conta).
// O detalhe da vaga diz se é Candidatura simplificada ou se leva para outro site.
import * as cheerio from 'cheerio';
import { fetchText, jitter } from './http.js';

const SEARCH = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const DETAIL = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/';

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

export function parseSearch(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('div.base-search-card, div.job-search-card').each((_, el) => {
    const card = $(el);
    const urn = card.attr('data-entity-urn') || '';
    const id = urn.split(':').pop();
    if (!id) return;
    const link = card.find('a.base-card__full-link').attr('href') || '';
    out.push({
      id,
      title: clean(card.find('.base-search-card__title').text()),
      company: clean(card.find('.base-search-card__subtitle').text()),
      location: clean(card.find('.job-search-card__location').text()),
      postedAt: card.find('time').attr('datetime') || null,
      salaryText: clean(card.find('.job-search-card__salary-info').text()) || null,
      url: link.split('?')[0],
      logo: card.find('img').attr('data-delayed-url') || null,
    });
  });
  return out;
}

export function parseDetail(html) {
  const $ = cheerio.load(html);
  const criteria = {};
  $('.description__job-criteria-item').each((_, el) => {
    criteria[clean($(el).find('.description__job-criteria-subheader').text()).toLowerCase()] = clean($(el).find('.description__job-criteria-text').text());
  });
  const descHtml = $('.show-more-less-html__markup').first().html() || '';
  const applyCode = $('code#applyUrl').html() || '';
  let applyUrl = null;
  const m = applyCode.match(/"(https?:[^"]+)"/);
  if (m) {
    try {
      const u = new URL(m[1]);
      applyUrl = u.searchParams.get('url') || m[1];
    } catch { /* ignora */ }
  }
  const offsite = !!applyUrl || /apply-button__offsite|apply-link-offsite/.test(html);
  const easy = !offsite && /apply-link-simple|onsite-apply|easy-apply|Candidatura simplificada|Easy Apply/i.test(html);
  return {
    descriptionHtml: descHtml,
    seniority: criteria['seniority level'] || criteria['nível de experiência'] || null,
    employmentType: criteria['employment type'] || criteria['tipo de emprego'] || null,
    applyUrl,
    applyMode: offsite ? 'externo' : easy ? 'easy' : 'desconhecido',
  };
}

function workplaceFrom(location, remoteSearch) {
  const l = (location || '').toLowerCase();
  if (remoteSearch || /remot|home office/.test(l)) return 'remoto';
  if (/h[íi]brid|hybrid/.test(l)) return 'hibrido';
  return null;
}

/**
 * Roda as buscas do perfil. Para cada vaga nova cuja prévia passa no filtro (prefilter),
 * abre o detalhe para pegar descrição e modo de candidatura.
 */
export async function collectLinkedin({ termos, cidades }, { prefilter, known, log, emit }) {
  const searches = [];
  for (const termo of termos) {
    // Remoto no Brasil (f_WT=2), nível estágio/júnior (f_E=1,2), última semana
    searches.push({ termo, params: { keywords: termo, location: 'Brasil', f_WT: '2', f_E: '1,2', f_TPR: 'r604800' }, remote: true });
    // Região de Goiânia (qualquer formato, filtrado depois pela nota)
    searches.push({ termo, params: { keywords: termo, location: cidades[0] ? `${cidades[0]}, Goiás, Brasil` : 'Goiânia, Goiás, Brasil', distance: '25', f_E: '1,2', f_TPR: 'r604800' }, remote: false });
  }
  let jobs = 0;
  const seen = new Set();
  for (const s of searches) {
    for (let start = 0; start < 75; start += 25) {
      const qs = new URLSearchParams({ ...s.params, start: String(start) });
      let cards;
      try {
        cards = parseSearch(await fetchText(`${SEARCH}?${qs}`));
      } catch (e) {
        log(`LinkedIn: busca "${s.termo}" falhou (${e.message})`);
        break;
      }
      for (const c of cards) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        const job = {
          source: 'linkedin',
          externalId: c.id,
          title: c.title,
          company: c.company,
          location: c.location,
          workplace: workplaceFrom(c.location, s.remote),
          salaryText: c.salaryText,
          postedAt: c.postedAt,
          url: c.url || `https://www.linkedin.com/jobs/view/${c.id}`,
          logo: c.logo,
          description: '',
        };
        if (!(await known('linkedin', c.id)) && prefilter(job)) {
          await jitter(1500, 3500);
          try {
            const d = parseDetail(await fetchText(DETAIL + c.id));
            job.descriptionHtml = d.descriptionHtml;
            job.seniority = d.seniority;
            job.employmentType = d.employmentType;
            job.applyMode = d.applyMode;
            job.applyUrl = d.applyUrl;
          } catch (e) {
            log(`LinkedIn: detalhe ${c.id} falhou (${e.message})`);
          }
        }
        await emit(job);
        jobs++;
      }
      if (cards.length < 10) break;
      await jitter(2000, 4500);
    }
  }
  return jobs;
}
