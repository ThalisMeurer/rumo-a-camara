# Guia para agentes de IA — Rumo à Câmara

Leia isto antes de mexer no projeto. Leitura humana: [README.md](README.md). Fatos do concurso: [docs/edital-resumo.md](docs/edital-resumo.md).

## Objetivo
PWA **gratuito** para a namorada do usuário estudar para **Analista Legislativo – Especialidade: Comunicação Social – Área: Jornalismo (Cargo 2), Câmara dos Deputados, Cebraspe, prova em 17/01/2027**. Ela usa **iPhone (Safari)** e **notebook (Chrome)**. Requisitos do usuário: custo zero, **prazeroso e motivador** (gamificação), baseado no edital. **Não copiar conteúdo das apostilas pagas** (direitos autorais). Todo o conteúdo é autoral, inspirado no padrão de cobrança do Cebraspe ou extraído da legislação/manuais oficiais.

## Arquitetura (decisões tomadas, não reabrir sem motivo)
- **JS puro, sem build, sem dependências.** Site estático em `app/`. Hospedagem gratuita prevista: GitHub Pages, Vercel ou Netlify (ainda **não publicado**).
- `app/app.js`: IIFE única. Seções: utilidades → estado (`st`, localStorage chave `rumoCamara.v1`) → banco (`ALL`, `CARDS`) → gamificação (XP, níveis, conquistas, recados) → feedback (toast, som WebAudio, confete) → roteador por hash (`VIEWS[rota]()` retorna HTML; `AFTER[rota]()` liga eventos/timers) → `ACOES` (delegação de cliques via `data-act`) → atalhos de teclado → init.
- Rotas: `inicio, questoes, cards, edital, foco, discursiva, progresso, conquistas, recados, mais, materiais, config, importar, backup`.
- Sessões em andamento: `S` (questões, persistida em `sessionStorage` chave `rumoCamara.S`), `F` (flashcards), `D` (discursiva, rascunho persistido em `st.rascunhoDisc`), `pomo` (pomodoro, baseado em `Date.now()` para resistir a segundo plano).
- `app/sw.js`: rede primeiro, cache como reserva (apenas se `r.ok`). **Incrementar `VERSAO` a cada mudança publicada** e manter a lista `ARQUIVOS` em dia (`VERSAO` atual: `"rumo-v4"`).
- CSS: tokens em `:root`, modo escuro por `prefers-color-scheme` ou `data-theme`, mobile-first (barra inferior; barra lateral ≥ 900px; `safe-area-inset` para iPhone).

## Dados (`app/data/*.js`, globais `window.*`)
- `edital.js` → `EDITAL.materias[]` (`id, nome, prova P1/P2, cor, icone, topicos[]`) + `regras[]`. IDs de matéria: `port, ing, adm, const, ti` (P1) e `com, jorn, proc, cpol` (P2).
- `questoes.js` → `QUESTOES[materia] = [[enunciado, gabarito(bool: true=Certo), comentario, textoApoio?]]` e `TEXTOS` (textos de apoio: `asrEn`, `journEn`, `plenario`). **ID = `materia-índice`: só acrescente no FIM de cada lista**, senão o progresso salvo se desalinha. Em 19/10/2026: **304 itens** (`port` 31, `ing` 15, `adm` 37, `const` 29, `ti` 23, `com` 48, `jorn` 54, `proc` 44, `cpol` 23).
- `flashcards.js` → `FLASHCARDS[materia] = [[frente, verso]]` (mesma regra de só acrescentar no fim). **121 cards** cobrindo todas as 9 matérias (`port` 12, `ing` 8, `adm` 17, `const` 12, `ti` 8, `com` 20, `jorn` 22, `proc` 16, `cpol` 6).
- `discursivas.js` → `DISCURSIVAS[] {id, tipo: "questao"|"peca", titulo, comando, aspectos[]}` (5 questões de 20 linhas + 3 peças técnicas de 50 linhas focadas em Comunicação Social / Jornalismo Legislativo).
- `materiais.js` → links oficiais gratuitos (Ato da Mesa 218/2025, Manual de Linguagem Simples da Câmara, Código de Ética do Jornalista FENAJ, Código ABERT, Decreto TV 3.0, CF/88, RICD, Código de Ética e Decoro Parlamentar, Lei 4.320/64, LRF etc.), todos validados via HTTP.
- `recados.js` → mensagens do namorado (`tipo: nivel|sequencia|questoes`, `valor`, `texto`) — o usuário vai personalizar.
- Questões importadas via IA ficam em `st.custom` (id `x-<hash>`), com "(gerado por IA)" no comentário.

## Regras de negócio
- XP: acerto +10, erro +3, 5 seguidas +15, card +2, tópico do edital +5 (creditado uma única vez por tópico via `st.editalXP`), pomodoro ≈ 1,2 × minutos, discursiva +50, simulado +40 (exige no mínimo `Math.min(10, S.itens.length)` respostas para pontuar no histórico), meta diária +50. Nível n exige `50·n·(n−1)` XP.
- Simulado: sem feedback até o fim; "em branco" permitido; XP das questões só é creditado ao concluir o simulado; nota líquida = acertos − erros (igual ao Cebraspe).
- Discursiva: ~70 caracteres por linha manuscrita; NC estimado pelos aspectos marcados (editável e limitado a `[0, pts]`); fórmulas do edital (k = 3 questão, 6 peça).
- Sequência: dias consecutivos com XP > 0 (hoje ou ontem como ponto de partida).

## Como testar
- `.claude/launch.json` tem a configuração `app` (`python -m http.server 5173 --directory app`).
- Validação de sintaxe e contagem: `node --check app/app.js` e verificação dos arquivos em `app/data/*.js`.
- Não há testes automatizados (projeto pequeno e sem build). Ao alterar, percorra as rotas no navegador e veja o console.

## Estado em 19/10/2026 e próximos passos
Feito: MVP completo migrado e auditado por 4 subagentes especialistas (Arquitetura/PWA, Comunicação/Jornalismo, Jurídico/Legislativo e Usabilidade/UX) para o **Cargo 2 (Comunicação Social – Área: Jornalismo)**, com **304 questões**, **121 flashcards**, **8 propostas de discursiva**, **22 links oficiais verificados** e melhorias completas de ergonomia/UX para iPhone e notebook.

Pendente / ideias, por prioridade:
1. **Publicar** (GitHub Pages ou Vercel) e testar a instalação no iPhone real (ícone, standalone, safe areas, teclado sobre o textarea).
2. Usuário personalizar `recados.js`.
3. **Ampliar continuamente o banco de questões** (meta: 60+ por matéria).
4. Sincronização automática entre aparelhos (opção gratuita: Firebase/Supabase no plano free; hoje é só backup manual).
5. Plano de estudos semanal até 17/01/2027 (distribuir tópicos por peso; P2 vale para desempate).

## Decisões que dependem do usuário (perguntar antes)
- Onde publicar: Vercel (há conector configurado) ou GitHub Pages. Nada foi publicado.
- Fazer `git init` e o primeiro commit: a pasta **ainda não é um repositório git**, então não há histórico. Só commitar com autorização.
- Texto final dos recados em `app/data/recados.js`: os que estão lá são provisórios.

## Qualidade do conteúdo e cuidados
- As 304 questões e os 121 cards foram elaborados no estilo Cebraspe e revisados por especialistas. Se a candidata apontar um gabarito errado, corrija no lugar, sem mudar a posição do item na lista.
- Conteúdo jurídico e normativo precisa ser exato: Lei 8.429 após a Lei 14.230/2021 (só dolo); Lei 14.133 (sem convite/tomada de preços); EC 131/2023 (nacionalidade); Ato da Mesa nº 218/2025 (Política de Comunicação da Câmara: imparcialidade, pluralismo, equilíbrio, transparência, precisão; Secom/Semid/Direx); Decreto nº 12.595/2025 (TV 3.0 / ATSC 3.0); STF RE 511.961 (diploma de jornalismo).
- Interface em português do Brasil, tom carinhoso e encorajador, tratamento no feminino ("Bem-vinda").
- Não usar a conta Vercel nem publicar nada sem o usuário pedir.
