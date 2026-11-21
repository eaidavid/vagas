#!/usr/bin/env bash
# Atualização automática do Vagas: a cada 5 minutos confere a branch no GitHub e, se houver versão nova,
# roda o instalador. Instalado pelo install.sh em /etc/cron.d/vagas. Log: /var/log/vagas-update.log
# Para desligar: rm /etc/cron.d/vagas
set -uo pipefail
DIR=/opt/vagas
BRANCH="$(cat "$DIR/.vagas-branch" 2>/dev/null || echo main)"
exec 9>/var/lock/vagas-update.lock
flock -n 9 || exit 0
cd "$DIR" || exit 0
git fetch -q origin "$BRANCH" || exit 0
[ "$(git rev-parse HEAD)" = "$(git rev-parse FETCH_HEAD)" ] && exit 0
echo "$(date '+%F %T') nova versão $(git rev-parse --short FETCH_HEAD) em $BRANCH: atualizando"
if BRANCH="$BRANCH" bash "$DIR/deploy/install.sh" </dev/null >/dev/null 2>&1; then
  echo "$(date '+%F %T') atualizado"
else
  echo "$(date '+%F %T') falhou; rode o instalador à mão para ver o erro"
fi
