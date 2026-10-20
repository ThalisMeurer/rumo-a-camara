# Rumo à Câmara 🏛️

App gratuito de estudos (PWA) para o concurso de **Analista Legislativo – Especialidade Comunicação Social: Área Jornalismo (Cargo 2)** da **Câmara dos Deputados**, Edital nº 1/2026, banca **Cebraspe**.

Funciona no **iPhone** (Safari → "Adicionar à Tela de Início") e no **notebook** (Chrome → ícone de instalar). Funciona offline, sem conta, sem anúncio e sem custo.

## O que o app faz

| Recurso | Descrição |
|---|---|
| ✅ Questões C/E | Itens no estilo Cebraspe com comentário. Modos: treino, inéditas, caderno de erros e simulado (cronômetro, item em branco, nota líquida com desconto por erro) |
| 🃏 Flashcards | Revisão espaçada (sistema Leitner: o que você erra volta logo, o que acerta volta mais tarde) |
| 🗺️ Edital verticalizado | Todos os tópicos do Cargo 2 (Jornalismo) com status ○ → ✓ → ★ e % de cobertura |
| ⏳ Pomodoro | 15/25/50 min por matéria, vale XP |
| ✍️ Discursiva | 8 propostas (questões de 20 linhas e peças técnicas de 50 linhas), contador de linhas, autoavaliação com a fórmula do edital e prompt pronto para uma IA gratuita corrigir |
| 🎮 Gamificação | XP, níveis com títulos, sequência de dias 🔥, missões diárias, 19 conquistas, confete e **recados do namorado** que desbloqueiam com o progresso |
| 🤖 Mais questões grátis | Prompt pronto para ChatGPT/Gemini/Claude gerarem itens no formato do app, e importação colando a resposta |
| 📚 Materiais oficiais | Links para a Política de Comunicação da Câmara (Ato 218/2025), Manual de Linguagem Simples, Código de Ética do Jornalista, lei seca (Planalto), RICD e provas do Cebraspe |
| 🔄 Backup | Exportar/importar o progresso (arquivo ou texto) para passar do notebook ao iPhone |

## Por que não usar a apostila paga?

O conteúdo das apostilas (Opção, Nova etc.) é protegido por direitos autorais e **não foi copiado**. O app segue o **conteúdo programático do edital** (documento público) e manda estudar pela **fonte primária gratuita**, a lei seca, que é exatamente o que o Cebraspe cobra. As questões e os flashcards foram escritos do zero.

## Como rodar localmente

```bash
python -m http.server 5173 --directory app
```

Depois abra http://localhost:5173. (Abrir o `index.html` direto também funciona, mas o modo offline/instalável só funciona por http(s).)

## Como publicar de graça (para usar no iPhone)

O PWA precisa de HTTPS. Qualquer uma destas opções é gratuita:

1. **GitHub Pages**: crie um repositório, envie a pasta `app/` e ative Pages (Settings → Pages → branch `main`, pasta `/app` ou raiz).
2. **Vercel** ou **Netlify**: importe o repositório, ou arraste a pasta `app/` no painel. Não precisa de build: é um site estático.

Depois, no iPhone: abra a URL no **Safari** → Compartilhar → **Adicionar à Tela de Início**.

> ⚠️ O progresso fica salvo **em cada aparelho** (localStorage). Use **Mais → Backup** para levar o progresso de um aparelho ao outro. No iPhone, instale na Tela de Início: o Safari pode apagar dados de sites que não foram instalados e ficaram 7 dias sem uso.

## Personalizar

- **Recados**: edite `app/data/recados.js` (são as mensagens que aparecem ao atingir nível, sequência de dias ou número de questões).
- **Novas questões**: acrescente no FIM da lista da matéria em `app/data/questoes.js`, ou importe pelo app.
- Depois de alterar arquivos publicados, incremente `VERSAO` em `app/sw.js`.

## Estrutura

```
app/
  index.html, styles.css, app.js     # app (JS puro, sem build)
  sw.js, manifest.webmanifest        # PWA/offline
  icons/                             # gerados por tools/gerar_icones.py
  data/                              # conteúdo: edital, questões, cards, discursivas, materiais, recados
docs/                                # resumo do edital e notas de handoff
tools/gerar_icones.py                # gera os PNGs dos ícones (Pillow)
edital.pdf                           # edital original
```

Documentação técnica e próximos passos: [CLAUDE.md](CLAUDE.md) e [docs/](docs/).
