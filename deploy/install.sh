#!/usr/bin/env bash
# Instala ou atualiza o Vagas na VPS (ao lado do Coolify, com HTTPS automático pelo proxy dele).
# Uso:  curl -fsSL https://raw.githubusercontent.com/eaidavid/vagas/main/deploy/install.sh | bash
# Repositório privado: rode com GH_TOKEN=<token de leitura> na frente.
# Rodar de novo é seguro: atualiza o código e mantém senhas, banco e currículo.
set -euo pipefail

BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-vagas.agenciateleios.com.br}"
ADMIN_EMAIL="${ADMIN_EMAIL:-eaidaviddev@gmail.com}"
DIR=/opt/vagas
REPO_PATH="${REPO_PATH:-eaidavid/vagas}"
if [ -n "${GH_TOKEN:-}" ]; then REPO="https://x-access-token:${GH_TOKEN}@github.com/${REPO_PATH}.git"; else REPO="https://github.com/${REPO_PATH}.git"; fi

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

command -v git >/dev/null || { say "Instalando git"; apt-get update -qq && apt-get install -y -qq git; }
command -v docker >/dev/null || { echo "Docker não encontrado. Este servidor deveria ter o Coolify."; exit 1; }

say "Baixando o código ($BRANCH)"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" checkout -q -B "$BRANCH" FETCH_HEAD
else
  git clone -q --depth 1 -b "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"

NEW_ENV=0
if [ ! -f .env ]; then
  say "Gerando senhas (ficam só neste servidor, em $DIR/.env)"
  cat > .env <<ENV
POSTGRES_PASSWORD=$(openssl rand -hex 24)
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)
ROBO_TOKEN=$(openssl rand -hex 24)
COLLECT_EVERY_HOURS=6
ENV
  chmod 600 .env
  NEW_ENV=1
fi

say "Ligando ao proxy do Coolify (HTTPS automático)"
CMD="$(docker inspect coolify-proxy --format '{{join .Config.Cmd " "}}' 2>/dev/null || true)"
EP_HTTPS="$(grep -oE 'entrypoints\.[a-z0-9_-]+\.address=:443' <<<"$CMD" | head -1 | cut -d. -f2)"; EP_HTTPS="${EP_HTTPS:-https}"
EP_HTTP="$(grep -oE 'entrypoints\.[a-z0-9_-]+\.address=:80\b' <<<"$CMD" | head -1 | cut -d. -f2)"; EP_HTTP="${EP_HTTP:-http}"
RESOLVER="$(grep -oE 'certificatesresolvers\.[a-z0-9_-]+\.' <<<"$CMD" | head -1 | cut -d. -f2)"; RESOLVER="${RESOLVER:-letsencrypt}"
docker network inspect coolify >/dev/null 2>&1 || docker network create coolify >/dev/null

cat > docker-compose.vps.yml <<YML
services:
  vagas:
    networks: [default, coolify]
    labels:
      - traefik.enable=true
      - traefik.docker.network=coolify
      - traefik.http.routers.vagas.rule=Host(\`$DOMAIN\`)
      - traefik.http.routers.vagas.entrypoints=$EP_HTTPS
      - traefik.http.routers.vagas.tls=true
      - traefik.http.routers.vagas.tls.certresolver=$RESOLVER
      - traefik.http.routers.vagas-http.rule=Host(\`$DOMAIN\`)
      - traefik.http.routers.vagas-http.entrypoints=$EP_HTTP
      - traefik.http.routers.vagas-http.middlewares=vagas-https
      - traefik.http.middlewares.vagas-https.redirectscheme.scheme=https
      - traefik.http.services.vagas.loadbalancer.server.port=3000
networks:
  coolify:
    external: true
YML

say "Construindo e subindo (a primeira vez leva alguns minutos)"
docker compose -p vagas -f docker-compose.yml -f docker-compose.vps.yml up -d --build </dev/null

say "Esperando responder"
for i in $(seq 1 60); do
  if docker compose -p vagas exec -T vagas wget -qO- http://127.0.0.1:3000/api/health </dev/null >/dev/null 2>&1; then OK=1; break; fi
  sleep 3
done
[ "${OK:-0}" = 1 ] || { echo "Não respondeu. Veja: docker compose -p vagas logs vagas --tail 80"; exit 1; }

set -a; . ./.env; set +a
echo "$BRANCH" > "$DIR/.vagas-branch"
if [ "${AUTO_UPDATE:-1}" = 1 ] && [ ! -f /etc/cron.d/vagas ]; then
  echo "*/5 * * * * root bash $DIR/deploy/auto-update.sh >> /var/log/vagas-update.log 2>&1" > /etc/cron.d/vagas
  chmod 644 /etc/cron.d/vagas
  echo "Atualização automática ligada (branch $BRANCH, a cada 5 minutos). Para desligar: rm /etc/cron.d/vagas"
fi

say "Pronto"
echo "Painel:  https://$DOMAIN"
echo "Login:   $ADMIN_EMAIL"
if [ "$NEW_ENV" = 1 ]; then
  echo "Senha:   $ADMIN_PASSWORD   (anote; está também em $DIR/.env)"
else
  echo "Senha:   a mesma de antes (está em $DIR/.env)"
fi
echo "Se o HTTPS não abrir logo, espere o DNS de '$DOMAIN' propagar; o certificado sai sozinho."
