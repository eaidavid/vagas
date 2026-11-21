# Robô de candidatura: Chromium com tela virtual (Xvfb) e acesso remoto protegido por senha (noVNC)
FROM mcr.microsoft.com/playwright:v1.49.1-noble
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends xvfb x11vnc novnc websockify fluxbox && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src src
COPY start.sh ./
RUN chmod +x start.sh && mkdir -p /data
VOLUME /data
EXPOSE 6080
CMD ["./start.sh"]
