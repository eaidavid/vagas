// Quadros de vagas das empresas (Greenhouse e Lever): JSON aberto, formulário padronizado.
// As empresas ficam na tela Perfil, pelo nome que aparece na URL (ex.: boards.greenhouse.io/<nome>).
import { fetchJson, jitter } from './http.js';

function wpFrom(text) {
  const t = (text || '').toLowerCase();
  if (/remot|anywhere|home office/.test(t)) return 'remoto';
  if (/hybrid|h[íi]brid/.test(t)) return 'hibrido';
  return null;
}

export async function collectGreenhouse(tokens, { log, emit }) {
  let jobs = 0;
  for (const token of tokens) {
    try {
      const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`);
      for (const j of data.jobs || []) {
        await emit({
          source: 'greenhouse',
          externalId: `${token}:${j.id}`,
          title: j.title,
          company: j.company_name || token,
          location: j.location?.name || '',
          workplace: wpFrom(j.location?.name),
          postedAt: j.first_published || j.updated_at || null,
          url: j.absolute_url,
          applyUrl: j.absolute_url,
          applyMode: 'externo',
          descriptionHtml: j.content || '',
        });
        jobs++;
      }
    } catch (e) {
      log(`Greenhouse: "${token}" falhou (${e.message})`);
    }
    await jitter(800, 1600);
  }
  return jobs;
}

export async function collectLever(companies, { log, emit }) {
  let jobs = 0;
  for (const co of companies) {
    try {
      const list = await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(co)}?mode=json`);
      for (const j of list || []) {
        const loc = j.categories?.location || j.categories?.allLocations?.join(', ') || '';
        await emit({
          source: 'lever',
          externalId: `${co}:${j.id}`,
          title: j.text,
          company: co,
          location: loc,
          workplace: { remote: 'remoto', hybrid: 'hibrido', onsite: 'presencial' }[j.workplaceType] || wpFrom(loc),
          postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
          url: j.hostedUrl,
          applyUrl: j.applyUrl || j.hostedUrl,
          applyMode: 'externo',
          descriptionHtml: `${j.description || ''}${(j.lists || []).map((l) => `<h3>${l.text}</h3><ul>${l.content}</ul>`).join('')}${j.additional || ''}`,
          employmentType: j.categories?.commitment || null,
          salaryText: j.salaryRange && (!j.salaryRange.currency || j.salaryRange.currency === 'BRL') ? `${j.salaryRange.min} - ${j.salaryRange.max} ${j.salaryRange.currency || ''}` : null,
        });
        jobs++;
      }
    } catch (e) {
      log(`Lever: "${co}" falhou (${e.message})`);
    }
    await jitter(800, 1600);
  }
  return jobs;
}
