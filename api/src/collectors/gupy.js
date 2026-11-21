// Gupy: API pública que o portal de vagas usa. Não foi possível testar daqui;
// se o endereço mudar de novo, o erro aparece em "Buscas" no painel.
import { fetchJson, jitter } from './http.js';

const HOSTS = ['https://employability-portal.gupy.io/api/v1/jobs', 'https://portal.api.gupy.io/api/v1/jobs'];

const WP = { remote: 'remoto', hybrid: 'hibrido', 'on-site': 'presencial', onsite: 'presencial' };

export function mapGupy(j) {
  const loc = [j.city, j.state].filter(Boolean).join(', ') || (j.isRemoteWork ? 'Remoto' : '');
  const typeMap = {
    vacancy_type_internship: 'Estágio',
    vacancy_type_apprentice: 'Aprendiz',
    vacancy_type_trainee: 'Trainee',
    vacancy_type_effective: 'Efetivo (CLT)',
    vacancy_legal_entity: 'PJ',
    vacancy_type_temporary: 'Temporário',
    vacancy_type_associate: 'Associado',
  };
  return {
    source: 'gupy',
    externalId: String(j.id),
    title: j.name,
    company: j.careerPageName || '',
    location: loc,
    workplace: WP[j.workplaceType] || (j.isRemoteWork ? 'remoto' : null),
    postedAt: j.publishedDate || null,
    url: j.jobUrl,
    applyUrl: j.jobUrl,
    applyMode: 'externo',
    logo: j.careerPageLogo || null,
    descriptionHtml: j.description || '',
    employmentType: typeMap[j.type] || j.type || null,
    deadline: j.applicationDeadline || null,
  };
}

export async function collectGupy({ termos }, { log, emit }) {
  let jobs = 0;
  const seen = new Set();
  let base = null;
  for (const termo of termos) {
    for (let offset = 0; offset < 300; offset += 100) {
      const qs = new URLSearchParams({ jobName: termo, limit: '100', offset: String(offset) });
      let data = null;
      for (const host of base ? [base] : HOSTS) {
        try {
          data = await fetchJson(`${host}?${qs}`);
          base = host;
          break;
        } catch (e) {
          if (host === HOSTS.at(-1) || base) log(`Gupy: busca "${termo}" falhou (${e.message})`);
        }
      }
      if (!data) {
        if (!base) throw new Error('a API da Gupy não respondeu (o endereço pode ter mudado)');
        return jobs;
      }
      const list = data.data || [];
      for (const j of list) {
        if (seen.has(j.id)) continue;
        seen.add(j.id);
        await emit(mapGupy(j));
        jobs++;
      }
      if (list.length < 100) break;
      await jitter(1000, 2500);
    }
    await jitter(1000, 2500);
  }
  return jobs;
}
