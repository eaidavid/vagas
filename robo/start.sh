#!/usr/bin/env bash
# Sobe a tela virtual, o acesso remoto (só com senha) e o robô.
set -euo pipefail
: "${VNC_PASSWORD:?defina VNC_PASSWORD}"
rm -f /tmp/.X99-lock
Xvfb :99 -screen 0 1280x900x24 -nolisten tcp &
export DISPLAY=:99
sleep 1
fluxbox >/dev/null 2>&1 &
x11vnc -storepasswd "$VNC_PASSWORD" /tmp/vncpass >/dev/null
x11vnc -display :99 -rfbauth /tmp/vncpass -forever -shared -localhost -rfbport 5900 -quiet -bg -o /tmp/x11vnc.log
websockify --web /usr/share/novnc 6080 localhost:5900 >/tmp/websockify.log 2>&1 &
exec node src/main.js
