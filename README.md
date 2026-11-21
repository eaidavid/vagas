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
- **Conectar conta (LinkedIn, Gupy)**: o botão "Conectar" no Perfil abre, dentro do app, o navegador do robô já na
  página de login. Você entra como quiser (inclusive "Continuar com Google"); o robô detecta a sessão, o app mostra
  "Conectado" e a janela fecha. "Desconectar" apaga a sessão daquele site.
- **Login automático**: opcionalmente, com o e-mail e a senha salvos em Perfil → Robô → Contas (senha criptografada com AES-256-GCM no
  banco da VPS), o robô entra sozinho no LinkedIn e na Gupy quando o site pedir. Se pedirem código de verificação, ele
  para e avisa.
- **Progresso ao vivo**: a Fila mostra o estado do robô (aplicando, esperando, pausado, fora do horário, limite) e, na
  vaga em andamento, a etapa, a barra e um print da tela atualizado a cada etapa.
- **Tela do robô** (`/tela`, com senha): para entrar manualmente quando o site pedir verificação e para resolver CAPTCHA.

Testado em formulários reais do Lever e do Greenhouse em modo ensaio. LinkedIn e Gupy exigem login e só podem ser
validados na VPS com as suas contas.

API do robô (token `ROBO_TOKEN`): `POST /api/public/robo/proxima` e `POST /api/public/robo/:id/resultado`.

### Claude (conector, como no Radar)
O Vagas tem um servidor MCP em `/mcp/<MCP_TOKEN>`. No claude.ai: Configurações → Conectores → Adicionar conector
personalizado, com o link que o instalador mostra. Não precisa de chave de API.

- **Pedir ao Claude** (detalhe da vaga e Fila) deixa um pedido na fila; no chat, diga **"Faz os pedidos do Vagas"**.
- O que o Claude faz: analisa vagas contra o currículo (a análise aparece no app), tria por você, escreve carta e
  respostas específicas da vaga (o robô usa antes do banco geral) e responde as perguntas que travaram a Fila.
- Ferramentas: `ver_perfil`, `buscar_vagas`, `ver_vaga`, `avaliar_vaga`, `mover_vagas`, `marcar_minha`,
  `preparar_candidatura`, `ver_travadas`, `responder_perguntas`, `salvar_respostas_padrao`, `ver_pedidos`, `concluir_pedido`.
- Regra fixa nas instruções: nunca inventar experiência, empresa, certificação ou nível de inglês.

## Instalar na VPS (Coolify)
1. DNS: registro A `vagas` apontando para o IP da VPS.
2. No servidor, como root:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/eaidavid/vagas/main/deploy/install.sh | bash
   ```
   Repositório privado: `GH_TOKEN=<token só de leitura> bash install.sh`.
3. O instalador mostra o link, o e-mail, a senha do painel, a senha da tela do robô e o link do conector do Claude. Rodar de novo atualiza sem perder nada.
   A atualização automática confere a branch `main` a cada 5 minutos.

## Rodar localmente
```bash
cd web && npm i && npx vite build
cd ../api && npm i
DATABASE_URL=postgres://... ADMIN_EMAIL=voce@exemplo.com ADMIN_PASSWORD=... DATA_DIR=./data node src/server.js
npm test
```
