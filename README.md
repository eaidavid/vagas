# Vagas

Sistema pessoal de candidatura a vagas: busca vagas alinhadas ao perfil, dá uma nota com os motivos,
você faz a triagem no estilo Reels e, no **É minha!**, a vaga entra na fila de aplicação.

## Como funciona

```
Buscas (a cada 6 h)  →  Nota 0–100  →  Vagas (feed)  →  Triagem (Reels)  →  É minha!  →  Fila de aplicação  →  Robô
LinkedIn, Gupy,         com motivos     você manda as     arrasta: direita     uma por vez, com até 3 tentativas
Greenhouse, Lever                       boas para a fila  é sua, esquerda não  e "precisa de você" quando trava
```

| Tela | O que faz |
|---|---|
| **Vagas** | Feed ordenado pela nota. `+` manda para a triagem, `✕` descarta (com desfazer). Atalho para mandar todas as melhores de uma vez. |
| **Triagem** | Uma vaga por tela. Arrastar para a direita ou **É minha!** coloca na fila de aplicação; esquerda descarta; relógio deixa para depois. Teclado: → ← ↓. |
| **Fila** | Estado de cada candidatura: na fila, aplicando, precisa de você (com as perguntas que o robô não soube), aplicada, não deu certo. |
| **Perfil** | Termos de busca, cidades aceitas para híbrido/presencial, salário mínimo, estágio, currículo em PDF, dados pessoais, banco de respostas do robô, empresas do Greenhouse/Lever, estado das buscas. |

### Nota de compatibilidade
Conta local e transparente (`api/src/scoring.js`), sem custo: área de desenvolvimento, nível (júnior/estágio sobe,
pleno/sênior derruba), local (remoto de qualquer lugar; híbrido/presencial só nas cidades do perfil), salário mínimo,
habilidades do currículo citadas na vaga e data de publicação. Vaga que fere uma regra fica escondida
(dá para ver em "Mostrar também as que não batem com o perfil").

### Fontes
- **LinkedIn:** páginas públicas de busca, sem login. Lê se a vaga é Candidatura simplificada ou se leva para outro site.
- **Gupy:** API pública do portal.
- **Greenhouse / Lever:** quadros de vagas das empresas listadas no Perfil.

Vagas repetidas entre fontes (mesma empresa e cargo, ou mesmo link de candidatura) viram uma só.

### Robô de candidatura (`robo/`)
Um contêiner com Chromium que pega uma vaga por vez da fila e aplica.

- **Motor genérico de formulários** (`robo/src/fill.js`): lê cada campo visível e a pergunta dele (inclusive grupos de
  opções e listas que filtram enquanto digita), responde com os dados do Perfil ou com o banco de respostas e anexa o
  currículo. Perguntas de diversidade (gênero, raça etc.) recebem "prefiro não informar".
- **Pergunta que não sabe = "precisa de você"**: a Fila mostra a pergunta (com as opções do site, quando há) e, quando
  você responde, a resposta vai para o banco e o robô tenta de novo.
- **Por site** (`robo/src/apply.js`): Lever e Greenhouse direto no formulário; LinkedIn pela Candidatura simplificada
  (modal com etapas) ou seguindo o botão para o site externo; Gupy pelas etapas da candidatura; outros sites pelo
  formulário que aparecer.
- **Modo ensaio (começa ligado)**: preenche tudo e para antes de enviar, com print da tela na Fila.
- **Limites**: liga/desliga, candidaturas por dia, horário e pausa de 2 a 6 min entre envios (Perfil → Robô).
- **Tela do robô** (`/tela`, com senha): para fazer login no LinkedIn e na Gupy uma vez (o perfil do navegador fica
  salvo) e para resolver CAPTCHA.

Testado em formulários reais do Lever e do Greenhouse em modo ensaio. LinkedIn e Gupy exigem login e só podem ser
validados na VPS com as suas contas.

API do robô (token `ROBO_TOKEN`): `POST /api/public/robo/proxima` e `POST /api/public/robo/:id/resultado`.

## Instalar na VPS (Coolify)
1. DNS: registro A `vagas` apontando para o IP da VPS.
2. No servidor, como root:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/eaidavid/vagas/main/deploy/install.sh | bash
   ```
   Repositório privado: `GH_TOKEN=<token só de leitura> bash install.sh`.
3. O instalador mostra o link, o e-mail, a senha do painel e a senha da tela do robô. Rodar de novo atualiza sem perder nada.
   A atualização automática confere a branch `main` a cada 5 minutos.

## Rodar localmente
```bash
cd web && npm i && npx vite build
cd ../api && npm i
DATABASE_URL=postgres://... ADMIN_EMAIL=voce@exemplo.com ADMIN_PASSWORD=... DATA_DIR=./data node src/server.js
npm test
```
