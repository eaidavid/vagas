// Banco (Postgres). As vagas guardam o objeto completo em JSONB, com colunas
// de índice só para o que precisa de filtro e ordenação.
import pg from 'pg';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
export const q = (text, params) => pool.query(text, params);

const SCHEMA = `
create table if not exists users (
  id serial primary key,
  email text unique not null,
  name text not null default '',
  password_hash text not null,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);
create table if not exists sessions (
  token text primary key,
  user_id int not null references users(id) on delete cascade,
  expires_at timestamptz not null
);
create table if not exists kv (
  key text primary key,
  value jsonb not null
);

-- Vaga. status: nova (feed) · triagem (fila do modo Reels) · descartada · minha (foi para a fila de aplicação)
create table if not exists jobs (
  id serial primary key,
  dedupe_key text unique not null,
  apply_key text,
  source text not null,
  external_id text,
  status text not null default 'nova',
  score int not null default 0,
  ats text not null default 'desconhecido',
  triage_pos double precision,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_status_score_idx on jobs(status, score desc);
create index if not exists jobs_apply_key_idx on jobs(apply_key);

-- Fila de aplicação. status: aguardando · aplicando · aplicada · precisa_voce · falhou · cancelada
create table if not exists applications (
  id serial primary key,
  job_id int unique not null references jobs(id) on delete cascade,
  status text not null default 'aguardando',
  attempts int not null default 0,
  next_run_at timestamptz not null default now(),
  locked_at timestamptz,
  error text,
  log jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists applications_status_idx on applications(status, next_run_at);
-- "Está certo, enviar": libera o envio desta candidatura mesmo com o modo ensaio ligado
alter table applications add column if not exists enviar boolean not null default false;

-- Pedidos para o Claude (botão "Pedir ao Claude"). tipo: analisar · preparar · responder
create table if not exists requests (
  id serial primary key,
  tipo text not null,
  job_id int references jobs(id) on delete cascade,
  application_id int references applications(id) on delete cascade,
  texto text,
  status text not null default 'pendente',
  resultado text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists requests_status_idx on requests(status);

create table if not exists collector_runs (
  id serial primary key,
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  found int not null default 0,
  inserted int not null default 0,
  error text
);
`;

export async function migrate() {
  await q(SCHEMA);
}

export async function kvGet(key, fallback = null) {
  const { rows } = await q('select value from kv where key = $1', [key]);
  return rows[0] ? rows[0].value : fallback;
}

export async function kvSet(key, value) {
  await q('insert into kv(key, value) values ($1, $2) on conflict (key) do update set value = excluded.value', [key, JSON.stringify(value)]);
}
