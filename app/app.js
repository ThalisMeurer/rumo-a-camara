/* Rumo à Câmara — PWA de estudos (vanilla JS, sem build, dados no localStorage) */
(() => {
"use strict";

// ---------- Utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const pad = n => String(n).padStart(2, "0");
const dkey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nl2br = s => esc(s).replace(/\n/g, "<br>");
const fmtComentario = s => esc(s).replace(/\b(Arts?\.\s*\d+[^\s,;.)]*|Lei\s+(?:Complementar\s+)?n?[º°]?\s*[\d.\/-]+|Ato da Mesa\s+n?[º°]?\s*[\d\/]+|Decreto\s+n?[º°]?\s*[\d.\/-]+|Resolu[çc][ãa]o\s+n?[º°]?\s*[\d\/-]+(?:-CN)?|EC\s+n?[º°]?\s*[\d\/]+|CF(?:\/88)?|RICD|LRF|LAI|LGPD|STF|TCU)\b/g, "<b>$1</b>");
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
const DAY = 86400000;

// ---------- Estado persistente ----------
const KEY = "rumoCamara.v1";
const S_KEY = "rumoCamara.S";
const DEFAULT = () => ({
  v: 1, nome: "", meta: 30, dataProva: EDITAL.dataProva, tema: "auto", som: true,
  xp: 0, resp: {}, cards: {}, edital: {}, editalXP: {}, dias: {}, simulados: [], discursivas: [],
  conquistas: {}, recadosVistos: [], custom: [], melhorSeq: 0, rascunhoDisc: null
});
let st;
function load() {
  try { st = Object.assign(DEFAULT(), JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch { st = DEFAULT(); }
  st.custom = (Array.isArray(st.custom) ? st.custom : []).filter(c => c && MAT[c.m]);
  st.editalXP ||= {};
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { toast("⚠️ Não foi possível salvar"); } }
function saveS() { try { if (S) sessionStorage.setItem(S_KEY, JSON.stringify(S)); else sessionStorage.removeItem(S_KEY); } catch {} }
function loadS() {
  try {
    const raw = sessionStorage.getItem(S_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && Array.isArray(s.itens) && s.itens.length && s.itens.every(q => q && MAT[q.m])) S = s;
  } catch {}
}
const dia = (k = dkey()) => (st.dias[k] ||= { q: 0, ok: 0, min: 0, cards: 0, xp: 0, metaBonus: false });

// ---------- Banco de dados ----------
const MAT = Object.fromEntries(EDITAL.materias.map(m => [m.id, m]));
let ALL = [];
function buildBank() {
  ALL = [];
  for (const [m, list] of Object.entries(QUESTOES)) if (MAT[m]) list.forEach((it, i) => ALL.push({ id: `${m}-${i}`, m, q: it[0], a: it[1], e: it[2], ctx: it[3] }));
  for (const c of st.custom) if (MAT[c.m]) ALL.push(c);
}
const CARDS = [];
for (const [m, list] of Object.entries(FLASHCARDS)) if (MAT[m]) list.forEach((it, i) => CARDS.push({ id: `${m}-${i}`, m, f: it[0], b: it[1] }));

// ---------- Gamificação ----------
const TITULOS = ["Candidata", "Concurseira", "Estudante Focada", "Foca de Redação", "Mestra do C/E", "Repórter Legislativa", "Assessora de Imprensa", "Editora-Chefe", "Analista em Formação", "Quase Servidora", "Jornalista da Câmara", "Lenda da Câmara"];
const xpNivel = n => 50 * n * (n - 1); // nível 1: 0, 2: 100, 3: 300, 4: 600...
const nivel = () => { let n = 1; while (st.xp >= xpNivel(n + 1)) n++; return n; };
const titulo = n => TITULOS[Math.min(n - 1, TITULOS.length - 1)];

function addXP(v, motivo) {
  const antes = nivel();
  st.xp += v; dia().xp += v;
  if (motivo) toast(`+${v} XP · ${motivo}`);
  checkMeta();
  const depois = nivel();
  save();
  if (depois > antes) setTimeout(() => { confetti(); modal(`<div style="text-align:center"><div style="font-size:3.5rem">🏆</div><h2>Subiu para o nível ${depois}!</h2><p class="muted">Novo título: <b>${titulo(depois)}</b></p><button class="btn block" data-act="fechar">Bora continuar!</button></div>`); }, 400);
  checkConquistas(); checkRecados();
}
function checkMeta() {
  const d = dia();
  if (!d.metaBonus && d.q >= st.meta) { d.metaBonus = true; st.xp += 50; d.xp += 50; toast("🎯 Meta diária batida! +50 XP"); confetti(); }
}
function sequencia() {
  let n = 0; const d = new Date();
  if (!(st.dias[dkey(d)]?.xp > 0)) d.setDate(d.getDate() - 1);
  while (st.dias[dkey(d)]?.xp > 0) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
const totalResp = () => Object.entries(st.resp).reduce((s, [k, r]) => s + (MAT[k.split("-")[0]] || k.startsWith("x-") ? r.n : 0), 0);
const totalMin = () => Object.values(st.dias).reduce((s, d) => s + (d.min || 0), 0);
const totalCards = () => Object.values(st.dias).reduce((s, d) => s + (d.cards || 0), 0);
const editalPct = () => {
  let tot = 0, ok = 0;
  for (const m of EDITAL.materias) m.topicos.forEach((_, i) => { tot++; if (st.edital[`${m.id}:${i}`] > 0) ok++; });
  return tot ? Math.round(100 * ok / tot) : 0;
};

const CONQUISTAS = [
  ["primeira", "🌱", "Primeiro passo", "Responder a primeira questão", () => totalResp() >= 1],
  ["q100", "💯", "Centena", "Responder 100 questões", () => totalResp() >= 100],
  ["q500", "🚀", "Maratonista", "Responder 500 questões", () => totalResp() >= 500],
  ["q1000", "👑", "Mil e uma", "Responder 1.000 questões", () => totalResp() >= 1000],
  ["seq3", "🔥", "Aquecendo", "3 dias seguidos de estudo", () => sequencia() >= 3],
  ["seq7", "⚡", "Semana perfeita", "7 dias seguidos", () => sequencia() >= 7],
  ["seq30", "🌋", "Imparável", "30 dias seguidos", () => sequencia() >= 30],
  ["perfeita10", "🎯", "Na mosca", "Acertar 10 seguidas em uma sessão", () => st.melhorSeq >= 10],
  ["simulado1", "📝", "Prova de fogo", "Concluir um simulado", () => st.simulados.length >= 1],
  ["simulado70", "🥇", "Nota de aprovada", "Nota líquida ≥ 70% em simulado de 30+ itens", () => st.simulados.some(s => s.total >= 30 && s.liquido / s.total >= .7)],
  ["disc1", "✍️", "Caneta afiada", "Treinar uma discursiva", () => st.discursivas.length >= 1],
  ["disc5", "📜", "Redatora oficial", "Treinar 5 discursivas", () => st.discursivas.length >= 5],
  ["edital25", "🗺️", "Exploradora", "Estudar 25% do edital", () => editalPct() >= 25],
  ["edital100", "🏁", "Edital zerado", "Estudar 100% do edital", () => editalPct() >= 100],
  ["foco5h", "⏳", "Foco total", "5 horas de pomodoro", () => totalMin() >= 300],
  ["foco50h", "🧘", "Monja do foco", "50 horas de pomodoro", () => totalMin() >= 3000],
  ["cards100", "🃏", "Memória de elefante", "Revisar 100 flashcards", () => totalCards() >= 100],
  ["madrugada", "🌅", "Madrugadora", "Estudar antes das 7h", () => false],
  ["nivel5", "⭐", "Estrela", "Chegar ao nível 5", () => nivel() >= 5]
];
function checkConquistas(extra) {
  if (extra) unlock(extra);
  for (const [id, , , , fn] of CONQUISTAS) if (!st.conquistas[id] && fn()) unlock(id);
}
function unlock(id) {
  if (st.conquistas[id]) return;
  st.conquistas[id] = Date.now(); save();
  const c = CONQUISTAS.find(c => c[0] === id);
  if (c) toast(`${c[1]} Conquista: ${c[2]}`);
}
function recadoAtingido(r) {
  if (r.tipo === "nivel") return nivel() >= r.valor;
  if (r.tipo === "sequencia") return sequencia() >= r.valor;
  if (r.tipo === "questoes") return totalResp() >= r.valor;
  return false;
}
function checkRecados() {
  setTimeout(() => {
    const i = RECADOS.findIndex((r, i) => !st.recadosVistos.includes(i) && recadoAtingido(r));
    if (i < 0 || !$("#modal").hidden) return;
    st.recadosVistos.push(i); save();
    modal(`<div style="text-align:center"><div style="font-size:3rem">💌</div><h2>Você desbloqueou um recado!</h2><p style="font-size:1.1rem">${esc(RECADOS[i].texto)}</p><button class="btn block" data-act="fechar">❤️</button></div>`);
  }, 900);
}
function marcarAtividade() { if (new Date().getHours() < 7) checkConquistas("madrugada"); }

// ---------- Feedback visual/sonoro ----------
function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  $("#toasts").appendChild(t); setTimeout(() => t.remove(), 2600);
}
let actx;
function som(ok) {
  if (!st.som) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = "sine"; o.frequency.value = ok ? 880 : 220;
    g.gain.setValueAtTime(.12, actx.currentTime); g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + .25);
    o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + .25);
    if (ok) { const o2 = actx.createOscillator(), g2 = actx.createGain(); o2.frequency.value = 1320; g2.gain.setValueAtTime(.08, actx.currentTime + .08); g2.gain.exponentialRampToValueAtTime(.001, actx.currentTime + .35); o2.connect(g2).connect(actx.destination); o2.start(actx.currentTime + .08); o2.stop(actx.currentTime + .35); }
  } catch {}
}
function confetti() {
  const c = $("#confetti"), x = c.getContext("2d"); c.width = innerWidth; c.height = innerHeight;
  const cores = ["#7b2cbf", "#c03fa2", "#f4b400", "#2a9d8f", "#e4572e", "#3d5a80"];
  const ps = Array.from({ length: 140 }, () => ({ x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - .5) * 14, vy: Math.random() * -12 - 3, r: Math.random() * 6 + 3, c: cores[Math.random() * cores.length | 0], a: Math.random() * 6 }));
  let f = 0;
  (function tick() {
    x.clearRect(0, 0, c.width, c.height);
    for (const p of ps) { p.vy += .35; p.x += p.vx; p.y += p.vy; p.a += .2; x.fillStyle = p.c; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6); x.restore(); }
    if (++f < 110) requestAnimationFrame(tick); else x.clearRect(0, 0, c.width, c.height);
  })();
}
const filaModal = [];
function modal(html) {
  const m = $("#modal");
  if (!m.hidden) { filaModal.push(html); return; }
  m.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false;
}
function fecharModal() {
  const m = $("#modal"); m.hidden = true; m.innerHTML = "";
  if (filaModal.length) modal(filaModal.shift()); else checkRecados();
}

// ---------- Navegação ----------
const ROTAS = [
  ["inicio", "🏠", "Início", "both"], ["questoes", "✅", "Questões", "both"], ["cards", "🃏", "Cards", "both"],
  ["edital", "🗺️", "Edital", "both"], ["foco", "⏳", "Foco", "desk"], ["discursiva", "✍️", "Discursiva", "desk"],
  ["progresso", "📊", "Progresso", "desk"], ["mais", "☰", "Mais", "both"]
];
function renderNav(r) {
  $("#nav").innerHTML = `<div class="brand">🏛️ Rumo à Câmara</div>` + ROTAS.map(([id, ico, nome, onde]) =>
    `<a href="#${id}" class="${r === id || (id === "mais" && ["materiais", "conquistas", "config", "importar", "backup", "recados"].includes(r)) ? "active" : ""} ${onde === "desk" ? "desk" : ""}"><span class="ico">${ico}</span>${nome}</a>`).join("");
}
let timerHandle = null, rotaAtual = "";
function route(keepScroll = false) {
  const r = (location.hash.slice(1) || "inicio").split("/")[0];
  const y = window.scrollY, mudouRota = r !== rotaAtual;
  rotaAtual = r;
  clearInterval(timerHandle); timerHandle = null;
  renderNav(r);
  const v = $("#view");
  v.classList.toggle("fade-in", mudouRota && !keepScroll);
  const fn = VIEWS[r] || VIEWS.inicio;
  v.innerHTML = fn();
  if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  AFTER[r]?.();
}
const go = h => { if (location.hash === "#" + h) route(); else location.hash = h; };

// ---------- Views ----------
const VIEWS = {}, AFTER = {};

function diasParaProva() { return Math.max(0, Math.ceil((new Date(st.dataProva + "T08:00:00") - new Date()) / DAY)); }
function acuracia(m) {
  let n = 0, ok = 0;
  for (const q of ALL) if ((!m || q.m === m) && st.resp[q.id]) { n += st.resp[q.id].n; ok += st.resp[q.id].ok; }
  return { n, ok, pct: n ? Math.round(100 * ok / n) : 0, liqPct: n ? Math.max(0, Math.round(100 * (2 * ok - n) / n)) : 0 };
}
function sugestao() {
  // matéria com menor cobertura do edital ponderada pela acurácia
  let best = null;
  for (const m of EDITAL.materias) {
    const feitos = m.topicos.filter((_, i) => st.edital[`${m.id}:${i}`] > 0).length / m.topicos.length;
    const ac = acuracia(m.id); const score = feitos * .6 + (ac.n ? ac.pct / 100 : 0) * .4 + (m.prova === "P2" ? -.08 : 0);
    if (!best || score < best.score) best = { m, score, prox: m.topicos.findIndex((_, i) => !(st.edital[`${m.id}:${i}`] > 0)) };
  }
  return best;
}

VIEWS.inicio = () => {
  const n = nivel(), base = xpNivel(n), prox = xpNivel(n + 1), d = dia(), seq = sequencia(), sug = sugestao();
  const devidos = CARDS.filter(c => !st.cards[c.id] || st.cards[c.id].due <= Date.now()).length;
  const missoes = [
    ["Responder " + st.meta + " questões", Math.min(d.q, st.meta), st.meta, "#questoes"],
    ["Revisar 15 flashcards", Math.min(d.cards, 15), 15, "#cards"],
    ["25 minutos de foco", Math.min(d.min, 25), 25, "#foco"]
  ];
  const hora = new Date().getHours(), saud = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  return `
  <section class="card hero">
    <div class="row between"><div><h1>${saud}, ${esc(st.nome || "futura servidora")}! ✨</h1>
    <p class="muted">${EDITAL.concurso}</p></div></div>
    <div class="grid g3 keep" style="margin-top:8px">
      <div class="stat"><b>${diasParaProva()}</b><span>dias para a prova</span></div>
      <div class="stat"><b>🔥 ${seq}</b><span>dias seguidos</span></div>
      <div class="stat"><b>${d.xp}</b><span>XP hoje</span></div>
    </div>
    <div style="margin-top:10px"><div class="row between small"><b>Nível ${n} · ${titulo(n)}</b><span>${st.xp - base}/${prox - base} XP</span></div>
    <div class="bar" style="margin-top:6px"><i style="width:${Math.min(100, 100 * (st.xp - base) / (prox - base))}%"></i></div></div>
  </section>
  ${S && !S.fim ? `<section class="card" style="border-color:var(--primary)"><div class="row between"><div><b>▶️ Sessão em andamento</b><div class="small muted">${S.modo === "simulado" ? "Simulado" : "Treino"} · item ${S.i + 1} de ${S.itens.length}</div></div><a class="btn sm" href="#questoes">Continuar →</a></div></section>` : ""}
  <section class="card"><h2>Missões de hoje</h2>
    ${missoes.map(([t, v, max, h]) => `<a class="mission ${v >= max ? "done" : ""}" href="${h}" style="text-decoration:none;color:inherit"><span class="ck">${v >= max ? "✓" : ""}</span><div style="flex:1"><div class="row between small"><b>${t}</b><span class="muted">${v}/${max}</span></div><div class="bar" style="margin-top:4px"><i style="width:${100 * v / max}%"></i></div></div></a>`).join("")}
  </section>
  ${sug ? `<section class="card"><h2>💡 Sugestão de agora</h2><p><span class="dot" style="background:${sug.m.cor}"></span> <b>${sug.m.nome}</b> <span class="badge">${sug.m.prova}</span></p>
    ${sug.prox >= 0 ? `<p class="muted">Próximo tópico: ${esc(sug.m.topicos[sug.prox])}</p>` : `<p class="muted">Edital desta matéria concluído — hora de revisar com questões!</p>`}
    <div class="row"><button class="btn" data-act="treinoMat" data-m="${sug.m.id}">Treinar ${sug.m.icone}</button><a class="btn sec" href="#edital">Ver edital</a></div></section>` : ""}
  <section class="grid g2">
    <button class="card tile" data-act="treinoRapido"><span class="big">⚡</span><b>Treino rápido</b><span class="muted small">10 itens variados</span></button>
    <a class="card tile" href="#cards"><span class="big">🃏</span><b>Flashcards</b><span class="muted small">${devidos} para revisar</span></a>
    <a class="card tile" href="#foco"><span class="big">⏳</span><b>Pomodoro</b><span class="muted small">Foco + XP</span></a>
    <a class="card tile" href="#discursiva"><span class="big">✍️</span><b>Discursiva</b><span class="muted small">${st.rascunhoDisc?.texto ? "📝 Rascunho salvo" : "Treino com nota"}</span></a>
  </section>`;
};

// ----- Questões -----
let filtro = { mats: [], modo: "treino", n: 10 };
let S = null; // sessão em andamento

VIEWS.questoes = () => {
  if (S && !S.fim) return viewItem();
  if (S && S.fim) return viewResumo();
  const erros = ALL.filter(q => st.resp[q.id] && st.resp[q.id].ult === false).length;
  const ineditas = ALL.filter(q => !st.resp[q.id]).length;
  const p1Ids = EDITAL.materias.filter(m => m.prova === "P1").map(m => m.id);
  const p2Ids = EDITAL.materias.filter(m => m.prova === "P2").map(m => m.id);
  const isP1 = filtro.mats.length === p1Ids.length && p1Ids.every(id => filtro.mats.includes(id));
  const isP2 = filtro.mats.length === p2Ids.length && p2Ids.every(id => filtro.mats.includes(id));
  return `<h1>Questões Certo/Errado</h1>
  <p class="muted">Estilo Cebraspe: cada erro anula um acerto. ${ALL.length} itens no banco · ${ineditas} inéditos.</p>
  <section class="card"><h3>Matérias</h3>
    <div class="chips" style="margin-bottom:8px">
      <button class="chip ${filtro.mats.length === 0 ? "on" : ""}" data-act="matAll">Todas</button>
      <button class="chip ${isP1 ? "on" : ""}" data-act="matProva" data-p="P1">Só P1</button><button class="chip ${isP2 ? "on" : ""}" data-act="matProva" data-p="P2">Só P2</button>
    </div>
    <div class="chips">${EDITAL.materias.map(m => `<button class="chip ${filtro.mats.includes(m.id) ? "on" : ""}" data-act="mat" data-m="${m.id}">${m.icone} ${m.nome}</button>`).join("")}</div>
  </section>
  <section class="card"><h3>Modo</h3>
    <div class="seg" style="margin-bottom:12px">
      ${[["treino", "Treino"], ["ineditas", "Inéditas"], ["erros", `Caderno de erros (${erros})`], ["simulado", "Simulado"]].map(([k, t]) => `<button class="${filtro.modo === k ? "on" : ""}" data-act="modo" data-k="${k}">${t}</button>`).join("")}
    </div>
    <p class="small muted">${{ treino: "Correção na hora, com comentário.", ineditas: "Só itens que você nunca respondeu.", erros: "Itens cuja última resposta foi errada. Acertou, sai do caderno.", simulado: "Sem correção até o fim, com cronômetro, item em branco e nota líquida." }[filtro.modo]}</p>
    <div class="seg">${[10, 20, 30, 60].map(n => `<button class="${filtro.n === n ? "on" : ""}" data-act="qtd" data-n="${n}">${n} itens</button>`).join("")}</div>
  </section>
  <button class="btn block" data-act="iniciar">Começar ▶</button>
  ${st.simulados.length ? `<section class="card" style="margin-top:14px"><h3>Últimos simulados</h3>${st.simulados.slice(-5).reverse().map(s => `<div class="row between small" style="padding:6px 0;border-top:1px solid var(--line)"><span>${new Date(s.data).toLocaleDateString("pt-BR")} · ${s.total} itens</span><b>${s.liquido} pts (${Math.round(100 * s.liquido / s.total)}%)</b></div>`).join("")}</section>` : ""}`;
};

function agruparPorTexto(arr) {
  const out = [], vistos = new Set();
  for (const q of arr) {
    if (vistos.has(q.id)) continue;
    out.push(q); vistos.add(q.id);
    if (q.ctx) for (const q2 of arr) if (!vistos.has(q2.id) && q2.ctx === q.ctx) { out.push(q2); vistos.add(q2.id); }
  }
  return out;
}
function iniciarSessao(opts = {}) {
  const mats = opts.mats ?? filtro.mats, modo = opts.modo ?? filtro.modo, n = opts.n ?? filtro.n;
  let pool = ALL.filter(q => !mats.length || mats.includes(q.m));
  if (modo === "ineditas") pool = pool.filter(q => !st.resp[q.id]);
  if (modo === "erros") pool = pool.filter(q => st.resp[q.id]?.ult === false);
  if (modo === "treino") pool = shuffle(pool).sort((a, b) => (st.resp[a.id]?.n || 0) - (st.resp[b.id]?.n || 0)); // prioriza menos vistas
  else pool = shuffle(pool);
  let itens;
  const matsAtivas = mats.length ? mats : EDITAL.materias.map(m => m.id);
  if (modo === "simulado" && matsAtivas.length > 1 && pool.length > n) {
    const somaPesos = matsAtivas.reduce((s, id) => s + (MAT[id]?.itensEst || 15), 0);
    const escolhidos = [], usados = new Set();
    for (const id of matsAtivas) {
      const cota = Math.max(1, Math.round(n * (MAT[id]?.itensEst || 15) / somaPesos));
      for (const q of pool) {
        if (escolhidos.length >= n) break;
        if (q.m === id && !usados.has(q.id)) {
          escolhidos.push(q); usados.add(q.id);
          if (escolhidos.filter(x => x.m === id).length >= cota) break;
        }
      }
    }
    for (const q of pool) { if (escolhidos.length >= n) break; if (!usados.has(q.id)) { escolhidos.push(q); usados.add(q.id); } }
    itens = agruparPorTexto(escolhidos.slice(0, n));
  } else {
    itens = agruparPorTexto(pool.slice(0, n));
  }
  if (!itens.length) { toast(modo === "erros" ? "Caderno de erros vazio! 🎉" : "Nenhum item com esses filtros"); return; }
  S = { modo, itens, i: 0, resp: [], seq: 0, xp: 0, inicio: Date.now(), fim: false };
  saveS();
  go("questoes");
}

function viewItem() {
  const q = S.itens[S.i], m = MAT[q.m], r = S.resp[S.i], sim = S.modo === "simulado";
  const ctx = q.ctx && TEXTOS[q.ctx];
  const ctxRepetido = ctx && S.i > 0 && S.itens[S.i - 1]?.ctx === q.ctx;
  return `<div class="qhead"><span class="badge mat-badge" style="background:${m.cor}22;color:${m.cor}">${m.icone} ${m.nome}</span>
    <span class="small muted">${S.i + 1}/${S.itens.length}${sim ? ` · <span id="crono">00:00</span>` : ` · saldo <b>${saldo()}</b>`}</span></div>
  <div class="bar" style="margin-bottom:14px"><i style="width:${100 * S.i / S.itens.length}%"></i></div>
  <section class="card">
    ${ctx ? `<details class="ctx" ${ctxRepetido ? "" : "open"}><summary class="small"><b>📄 Texto de apoio${ctxRepetido ? " (mesmo texto anterior)" : ""}</b><span> expandir/recolher ▾</span></summary><div style="margin-top:8px">${nl2br(ctx)}</div></details>` : ""}
    <div class="enun">${esc(q.q)}</div>
    ${r === undefined ? `<div class="ce"><button class="btn ok" data-act="resp" data-v="1">✓ CERTO <span class="kbd">C</span></button><button class="btn bad" data-act="resp" data-v="0">✗ ERRADO <span class="kbd">E</span></button></div>
      <button class="btn ghost block sm" style="margin-top:10px" data-act="resp" data-v="-1">${sim ? "Deixar em branco" : "Pular / Em branco"} <span class="kbd">B</span></button>`
    : `${feedback(q, r)}<button class="btn block" style="margin-top:12px" data-act="prox">${S.i + 1 < S.itens.length ? "Próxima questão →" : "Ver resultado final 🏆"} <span class="kbd">Enter</span></button>`}
  </section>
  <div class="row between"><button class="btn ghost sm" data-act="sair">Encerrar sessão</button><span class="small muted">${S.seq >= 2 ? `🔥 ${S.seq} seguidas` : ""}</span></div>`;
}
function feedback(q, r) {
  if (S.modo === "simulado") return `<p class="muted">Resposta registrada: <b>${r === -1 ? "em branco" : r ? "CERTO" : "ERRADO"}</b></p>`;
  if (r === -1) return `<div class="fb"><h3 class="muted">⚪ Deixada em branco · Gabarito: ${q.a ? "CERTO" : "ERRADO"}</h3><p style="margin:0">${fmtComentario(q.e)}</p></div>`;
  const ok = (r === 1) === q.a;
  return `<div class="fb ${ok ? "ok" : "bad"}"><h3>${ok ? "✅ Acertou!" : "❌ Errou"} · Gabarito: ${q.a ? "CERTO" : "ERRADO"}</h3><p style="margin:0">${fmtComentario(q.e)}</p></div>`;
}
const saldo = () => S.resp.reduce((s, r, i) => s + (r === -1 || r === undefined ? 0 : ((r === 1) === S.itens[i].a ? 1 : -1)), 0);

function responder(v) {
  if (!S || S.fim || S.resp[S.i] !== undefined) return;
  const q = S.itens[S.i]; S.resp[S.i] = v;
  marcarAtividade();
  if (v !== -1) {
    const ok = (v === 1) === q.a;
    const r = st.resp[q.id] ||= { n: 0, ok: 0 };
    r.n++; if (ok) r.ok++; r.ult = ok; r.t = Date.now();
    const d = dia(); d.q++; if (ok) d.ok++;
    if (ok) { S.seq++; st.melhorSeq = Math.max(st.melhorSeq, S.seq); } else S.seq = 0;
    const ganho = ok ? 10 : 3; S.xp += ganho;
    if (S.modo !== "simulado") { som(ok); addXP(ganho); if (S.seq && S.seq % 5 === 0) { toast(`🔥 ${S.seq} seguidas!`); addXP(15); S.xp += 15; } }
    else save();
  }
  saveS();
  route(true);
}
function proxima() {
  if (!S || S.resp[S.i] === undefined) return;
  if (S.i + 1 < S.itens.length) { S.i++; saveS(); route(); } else finalizarSessao();
}
function finalizarSessao() {
  S.fim = true;
  const certos = S.resp.filter((r, i) => r !== -1 && r !== undefined && (r === 1) === S.itens[i].a).length;
  const errados = S.resp.filter((r, i) => r !== -1 && r !== undefined && (r === 1) !== S.itens[i].a).length;
  const respondidas = certos + errados;
  S.res = { certos, errados, branco: S.itens.length - respondidas, liquido: certos - errados, total: S.itens.length };
  if (S.modo === "simulado") {
    if (S.xp > 0) { st.xp += S.xp; dia().xp += S.xp; checkMeta(); }
    if (respondidas >= Math.min(10, S.itens.length)) {
      st.simulados.push({ data: Date.now(), ...S.res, seg: Math.round((Date.now() - S.inicio) / 1000) });
      addXP(40, "simulado concluído");
      S.xp += 40;
    } else save();
  } else save();
  saveS();
  if (S.res.liquido / S.res.total >= .7 && respondidas >= 5) setTimeout(confetti, 200);
  checkConquistas(); route();
}
function viewResumo() {
  const r = S.res, pct = Math.round(100 * r.liquido / r.total);
  const porMat = {};
  S.itens.forEach((q, i) => { const p = porMat[q.m] ||= { c: 0, e: 0, b: 0 }; const v = S.resp[i]; if (v === -1 || v === undefined) p.b++; else if ((v === 1) === q.a) p.c++; else p.e++; });
  const msg = pct >= 70 ? "Desempenho de aprovada! 🏆" : pct >= 50 ? "Muito bem! Continue assim. 💪" : pct >= 30 ? "No caminho certo. Revise os comentários. 📚" : "Todo especialista já foi iniciante. Bora revisar! 🌱";
  return `<h1>Resultado</h1>
  <section class="card hero"><div class="grid g3 keep">
    <div class="stat"><b>${r.liquido}</b><span>nota líquida</span></div>
    <div class="stat"><b>${r.certos}</b><span>acertos</span></div>
    <div class="stat"><b>${r.errados}</b><span>erros</span></div></div>
    <p style="text-align:center;margin:10px 0 0"><b>${msg}</b><br><span class="muted small">${pct}% líquido · +${S.xp} XP${r.branco ? ` · ${r.branco} em branco` : ""}</span></p>
  </section>
  ${S.modo === "simulado" ? `<section class="card"><h3>Comparação com os cortes do edital</h3><p class="small muted">Mínimos proporcionais: P1 ≥ 20% · P2 ≥ 30% · total ≥ 30% líquido. Para disputar vaga, mire acima de 60–70%.</p>
    <div class="bar"><i style="width:${Math.max(0, pct)}%"></i></div>
    ${r.errados > 0 ? `<p class="small" style="margin-top:8px">Se tivesse deixado em branco os itens errados, sua nota seria <b>${r.certos}</b>. Em C/E, só “chute” quando tiver mais de 50% de confiança.</p>` : ""}</section>` : ""}
  <section class="card"><h3>Por matéria</h3>${Object.entries(porMat).map(([m, p]) => `<div class="row between small" style="padding:6px 0;border-top:1px solid var(--line)"><span>${MAT[m].icone} ${MAT[m].nome}</span><span><span class="badge ok">${p.c} ✓</span> <span class="badge bad">${p.e} ✗</span>${p.b ? ` <span class="badge">${p.b} ○</span>` : ""}</span></div>`).join("")}</section>
  <section class="card"><h3>Revisão dos itens da sessão</h3><p class="small muted">Os itens errados já vêm abertos para revisão rápida.</p>${S.itens.map((q, i) => { const v = S.resp[i], br = v === -1 || v === undefined, ok = !br && (v === 1) === q.a; return `<details ${!ok && !br ? "open" : ""} style="padding:8px 0;border-top:1px solid var(--line)"><summary class="small" style="cursor:pointer"><b>${br ? "⚪ Em branco" : ok ? "✅ Acertou" : "❌ Errou"}</b> · ${MAT[q.m].icone} ${i + 1}. ${esc(q.q.slice(0, 82))}…</summary><p class="small" style="margin-top:6px">${esc(q.q)}</p><p class="small" style="margin:0"><b>Gabarito: ${q.a ? "CERTO" : "ERRADO"}.</b> ${fmtComentario(q.e)}</p></details>`; }).join("")}</section>
  <div class="row">${r.errados > 0 ? `<button class="btn" data-act="reverErrosSessao">🔁 Refazer ${r.errados} errada(s)</button>` : ""}<button class="btn ${r.errados > 0 ? "sec" : ""}" data-act="denovo">Nova sessão</button><a class="btn ghost" href="#inicio" data-act="limparS">Início</a></div>`;
}
AFTER.questoes = () => {
  if (S && !S.fim && S.modo === "simulado") {
    const tick = () => { const el = $("#crono"); if (!el) return; const s = Math.round((Date.now() - S.inicio) / 1000); el.textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
    tick(); timerHandle = setInterval(tick, 1000);
  }
};

// ----- Flashcards (Leitner) -----
const INTERVALOS = [0, 1, 3, 7, 15, 30, 60]; // dias por caixa
let F = null;
const botoesCard = () => F?.virado
  ? `<div class="grid g3 keep" style="margin-top:14px"><button class="btn bad" data-act="nota" data-v="0">Errei <span class="kbd">1</span></button><button class="btn sec" data-act="nota" data-v="1">Difícil <span class="kbd">2</span></button><button class="btn ok" data-act="nota" data-v="2">Lembrei! <span class="kbd">3</span></button></div>`
  : `<button class="btn block" style="margin-top:14px" data-act="virar">Mostrar resposta <span class="kbd">Espaço</span></button>`;
function virarCard() {
  if (!F) return;
  F.virado = !F.virado;
  const el = $("#flashCard"), b = $("#flashBtns");
  if (el && b) { el.classList.toggle("flip", F.virado); b.innerHTML = botoesCard(); } else route(true);
}
VIEWS.cards = () => {
  if (F && F.i < F.fila.length) {
    const c = F.fila[F.i], m = MAT[c.m];
    return `<div class="qhead"><span class="badge mat-badge" style="background:${m.cor}22;color:${m.cor}">${m.icone} ${m.nome}</span><span class="small muted">${F.i + 1}/${F.fila.length}</span></div>
    <div id="flashCard" class="flash ${F.virado ? "flip" : ""}" data-act="virar"><div class="flash-in">
      <div class="flash-face"><b>${esc(c.f)}</b><p class="small muted" style="margin-top:14px">Toque para ver a resposta</p></div>
      <div class="flash-face back">${esc(c.b)}</div></div></div>
    <div id="flashBtns">${botoesCard()}</div>
    <button class="btn ghost sm" style="margin-top:12px" data-act="sairCards">Encerrar</button>`;
  }
  if (F) { const feitos = F.fila.length; F = null; setTimeout(() => toast(`🃏 ${feitos} cards revisados!`), 50); }
  const agora = Date.now();
  return `<h1>Flashcards</h1><p class="muted">Revisão espaçada: o que você erra volta logo; o que acerta, volta cada vez mais tarde.</p>
  ${EDITAL.materias.filter(m => FLASHCARDS[m.id]).map(m => {
    const cs = CARDS.filter(c => c.m === m.id), dev = cs.filter(c => !st.cards[c.id] || st.cards[c.id].due <= agora).length, dom = cs.filter(c => (st.cards[c.id]?.box || 0) >= 3).length;
    return `<section class="card flat row between"><div><b>${m.icone} ${m.nome}</b><div class="small muted">${cs.length} cards · ${dom} dominados</div></div><button class="btn sm ${dev ? "" : "sec"}" data-act="estudarCards" data-m="${m.id}">${dev ? `Revisar ${dev}` : "Treinar"}</button></section>`;
  }).join("")}
  <button class="btn block" data-act="estudarCards" data-m="">Revisar todos os pendentes</button>`;
};
function estudarCards(m) {
  const agora = Date.now();
  let fila = CARDS.filter(c => !m || c.m === m);
  const dev = fila.filter(c => !st.cards[c.id] || st.cards[c.id].due <= agora);
  fila = shuffle(dev.length ? dev : fila).slice(0, 20);
  F = { fila, i: 0, virado: false }; go("cards");
}
function notaCard(v) {
  const c = F.fila[F.i], s = st.cards[c.id] ||= { box: 0, due: 0 };
  s.box = v === 0 ? 0 : v === 1 ? Math.max(1, s.box) : Math.min(INTERVALOS.length - 1, s.box + 1);
  s.due = Date.now() + (v === 0 ? 10 * 60000 : INTERVALOS[s.box] * DAY);
  dia().cards++; marcarAtividade(); addXP(2);
  if (v === 0) F.fila.push(c); // volta ao fim da fila
  F.i++; F.virado = false; route(true);
}

// ----- Edital verticalizado -----
let editalAbertos = new Set(), editalSoPend = false;
VIEWS.edital = () => `<h1>Edital verticalizado</h1>
  <p class="muted">Toque no tópico: ○ não estudado → ✓ estudado (+5 XP na 1ª vez) → ★ revisado. Cobertura total: <b>${editalPct()}%</b></p>
  <div class="bar" style="margin-bottom:12px"><i style="width:${editalPct()}%"></i></div>
  <div class="chips" style="margin-bottom:14px">
    <button class="chip ${editalSoPend ? "on" : ""}" data-act="togglePend">○ Mostrar só pendentes</button>
    <button class="chip" data-act="toggleExpandEdital">${editalAbertos.size >= EDITAL.materias.length ? "Recolher matérias" : "Expandir matérias"}</button>
  </div>
  <div class="${editalSoPend ? "hide-done" : ""}">
  ${["P1", "P2"].map(p => `<h2 style="margin-top:18px">${p === "P1" ? "P1 · Conhecimentos básicos (90 itens)" : "P2 · Conhecimentos específicos (90 itens)"}</h2>` +
    EDITAL.materias.filter(m => m.prova === p).map(m => {
      const feitos = m.topicos.filter((_, i) => st.edital[`${m.id}:${i}`] > 0).length, ac = acuracia(m.id);
      return `<details class="mat" data-m="${m.id}" ${location.hash.includes(m.id) || editalAbertos.has(m.id) ? "open" : ""}><summary><div class="row between"><b><span class="dot" style="background:${m.cor}"></span> ${m.icone} ${m.nome} ${m.itensEst ? `<span class="badge">~${m.itensEst} na prova</span>` : ""}</b><span class="small muted">${feitos}/${m.topicos.length}${ac.n ? ` · ${ac.pct}% brutos (${ac.liqPct}% líq.)` : ""}</span></div><div class="bar" style="margin-top:8px"><i style="width:${100 * feitos / m.topicos.length}%;background:${m.cor}"></i></div></summary>
      ${m.topicos.map((t, i) => { const s = st.edital[`${m.id}:${i}`] || 0; return `<div class="topic s${s}" data-act="topico" data-k="${m.id}:${i}"><span class="st">${s === 2 ? "★" : s === 1 ? "✓" : ""}</span><span>${esc(t)}</span></div>`; }).join("")}
      <div style="padding:12px 16px;border-top:1px solid var(--line)"><button class="btn sm" data-act="treinoMat" data-m="${m.id}">Treinar questões desta matéria</button></div></details>`;
    }).join("")).join("")}
  </div>
  ${EDITAL.estrategia ? `<section class="card" style="margin-top:16px"><h3>🧭 Estratégia pós-edital (Dicas do Curso)</h3><ul class="small" style="padding-left:18px;margin:0">${EDITAL.estrategia.map(r => `<li style="margin-bottom:5px">${esc(r)}</li>`).join("")}</ul></section>` : ""}
  <section class="card" style="margin-top:12px"><h3>Regras do jogo (edital)</h3><ul class="small" style="padding-left:18px;margin:0">${EDITAL.regras.map(r => `<li>${esc(r)}</li>`).join("")}</ul></section>`;
function ciclarTopico(k) {
  editalAbertos = new Set([...document.querySelectorAll("details.mat[open]")].map(d => d.dataset.m));
  const v = ((st.edital[k] || 0) + 1) % 3;
  st.edital[k] = v; marcarAtividade();
  if (v === 1 && !st.editalXP[k]) { st.editalXP[k] = 1; addXP(5, "tópico estudado"); } else save();
  checkConquistas();
  route(true);
}

// ----- Pomodoro -----
let pomo = { mat: EDITAL.materias[0].id, dur: 25, fim: 0, pausa: false, rest: 0 };
let pomoTimer = null;
function syncPomoTimer() {
  clearInterval(pomoTimer); pomoTimer = null;
  if (pomo.fim > 0 && !pomo.pausa) pomoTimer = setInterval(focoTick, 500);
}
function focoTick() {
  let rest = pomo.pausa ? pomo.rest : pomo.fim ? Math.max(0, pomo.fim - Date.now()) : pomo.dur * 60000;
  const s = Math.ceil(rest / 1000), txt = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  const el = $("#tempo"), arc = $("#arc");
  if (el) el.textContent = txt;
  if (arc) arc.setAttribute("stroke-dashoffset", String(339.3 * (1 - rest / (pomo.dur * 60000))));
  document.title = pomo.fim ? `${txt} · Foco` : "Rumo à Câmara";
  if (pomo.fim && !pomo.pausa && rest <= 0) concluirPomo();
}
VIEWS.foco = () => {
  const ativo = pomo.fim > 0 || pomo.rest > 0, m = MAT[pomo.mat] || EDITAL.materias[0];
  return `<h1>Foco (Pomodoro)</h1><p class="muted">Escolha a matéria, guarde o celular e estude sem interrupções. Cada bloco concluído vale XP.</p>
  <section class="card" style="text-align:center">
    ${ativo ? `<div style="margin-bottom:6px"><span class="badge mat-badge" style="background:${m.cor}22;color:${m.cor}">${m.icone} ${m.nome}</span></div>` : ""}
    <div class="ring"><svg viewBox="0 0 120 120" width="230" height="230"><circle cx="60" cy="60" r="54" fill="none" stroke="var(--surface-2)" stroke-width="10"/><circle id="arc" cx="60" cy="60" r="54" fill="none" stroke="url(#gr)" stroke-width="10" stroke-linecap="round" stroke-dasharray="339.3" stroke-dashoffset="0"/><defs><linearGradient id="gr"><stop offset="0" stop-color="var(--primary)"/><stop offset="1" stop-color="var(--primary-2)"/></linearGradient></defs></svg><div class="t" id="tempo">${pad(pomo.dur)}:00</div></div>
    ${ativo ? "" : `<div class="seg" style="margin-bottom:12px">${[[25, "25 min"], [50, "50 min"], [15, "15 min"]].map(([v, t]) => `<button class="${pomo.dur === v ? "on" : ""}" data-act="dur" data-v="${v}">${t}</button>`).join("")}</div>
    <label class="field" style="text-align:left">Matéria<select id="pomoMat">${EDITAL.materias.map(m => `<option value="${m.id}" ${pomo.mat === m.id ? "selected" : ""}>${m.icone} ${m.nome}</option>`).join("")}</select></label>`}
    <div class="row" style="justify-content:center">${ativo ? `<button class="btn" data-act="pausar">${pomo.pausa ? "Retomar" : "Pausar"}</button><button class="btn ghost" data-act="pararPomo">Desistir</button>` : `<button class="btn" data-act="iniciarPomo">Começar foco ▶</button>`}</div>
  </section>
  <section class="card"><h3>Hoje</h3><p>${dia().min} minutos focados · total ${Math.round(totalMin() / 60 * 10) / 10} h</p></section>`;
};
AFTER.foco = () => { focoTick(); syncPomoTimer(); };
function concluirPomo() {
  const min = pomo.dur, m = MAT[pomo.mat]; pomo.fim = 0; pomo.rest = 0; pomo.pausa = false; syncPomoTimer();
  dia().min += min; marcarAtividade(); som(true); confetti();
  modal(`<div style="text-align:center"><div style="font-size:3rem">☕</div><h2>Bloco concluído!</h2><p class="muted">${m ? `${m.icone} ${m.nome} · ` : ""}${min} min focados</p><p>Faça uma pausa de ${min >= 50 ? 10 : 5} minutos: água, alongamento, olhar pela janela.</p><button class="btn block" data-act="fechar">Combinado</button></div>`);
  addXP(Math.round(min * 1.2), `${min} min de foco`);
  document.title = "Rumo à Câmara";
  if ((location.hash.slice(1) || "inicio").split("/")[0] === "foco") route(true);
}

// ----- Discursiva -----
let D = null;
const CHARS_LINHA = 70;
const contaLinhas = t => t.trim() ? t.split("\n").reduce((s, p) => s + Math.max(1, Math.ceil(p.length / CHARS_LINHA)), 0) : 0;
VIEWS.discursiva = () => {
  if (D) {
    const p = DISCURSIVAS.find(x => x.id === D.id), max = p.tipo === "peca" ? 50 : 20, pts = p.tipo === "peca" ? 30 : 15;
    if (D.etapa === "escrever") return `<h1>${esc(p.titulo)}</h1>
      <section class="card"><span class="badge">${p.tipo === "peca" ? "Peça técnica · até 50 linhas · 30 pts" : "Questão · até 20 linhas · 15 pts"}</span><p style="margin-top:10px">${nl2br(p.comando)}</p></section>
      <section class="card"><div class="row between small"><b>Seu texto (salvo automaticamente)</b><span id="linhas" class="muted">0/${max} linhas</span></div>
      <textarea id="texto" rows="14" placeholder="Escreva como se fosse à mão. Dica: planeje antes (introdução, desenvolvimento por tópicos do comando, conclusão)." style="margin-top:8px">${esc(D.texto)}</textarea>
      <p class="small muted">Estimativa de ~${CHARS_LINHA} caracteres por linha manuscrita.</p></section>
      <div class="row"><button class="btn" data-act="avaliarDisc">Concluir e avaliar</button><button class="btn ghost" data-act="sairDisc">Voltar (mantém rascunho)</button></div>`;
    const nc = D.nc ?? Math.round(pts * D.marc.filter(Boolean).length / p.aspectos.length * 10) / 10;
    const tl = Math.max(1, contaLinhas(D.texto)), k = p.tipo === "peca" ? 6 : 3, nota = Math.max(0, nc - k * (D.ne || 0) / tl);
    return `<h1>Autoavaliação</h1>
      <section class="card"><h3>Padrão de resposta (aspectos esperados)</h3>${p.aspectos.map((a, i) => `<label class="row" style="padding:6px 0;cursor:pointer"><input type="checkbox" data-act="aspecto" data-i="${i}" ${D.marc[i] ? "checked" : ""} style="width:20px;height:20px"> <span>${esc(a)}</span></label>`).join("")}</section>
      <section class="card"><div class="grid g2">
        <label class="field">Nota de conteúdo NC (0–${pts})<input type="number" id="nc" min="0" max="${pts}" step="0.5" value="${nc}"></label>
        <label class="field">Nº de erros NE<input type="number" id="ne" min="0" step="1" value="${D.ne || 0}"></label></div>
        <p>Linhas (TL): <b>${tl}</b> · Fórmula: NC − ${k} × NE ÷ TL</p>
        <h2>Nota estimada: <span id="notaDisc">${nota.toFixed(2)}</span> / ${pts}</h2>
        <p class="small muted">Para uma correção mais rigorosa e gratuita, copie o prompt e cole no ChatGPT, Gemini ou Claude.</p>
        <div class="row"><button class="btn sec" data-act="promptDisc">📋 Copiar prompt de correção por IA</button></div></section>
      <div class="row"><button class="btn" data-act="salvarDisc">Salvar treino (+50 XP)</button><button class="btn ghost" data-act="voltarEscrever">Editar texto</button></div>`;
  }
  return `<h1>Discursiva</h1><p class="muted">Vale 60 pontos e elimina quem fizer menos de 30. Treine 1 por semana, à mão de preferência, e depois digite aqui para autoavaliar.</p>
  <section class="card flat small"><b>Como a nota é calculada:</b> Questões (2 × 15 pts, até 20 linhas): NQ = NC − 3 × NE ÷ TL · Peça técnica (30 pts, até 50 linhas): NPT = NC − 6 × NE ÷ TL. NE = erros de grafia, morfossintaxe e propriedade vocabular.</section>
  ${DISCURSIVAS.map(p => {
    const feitos = st.discursivas.filter(d => d.id === p.id);
    const melhor = feitos.length ? Math.max(...feitos.map(d => d.nota)) : null;
    const temRascunho = st.rascunhoDisc?.id === p.id && st.rascunhoDisc?.texto?.trim();
    return `<section class="card flat row between"><div style="flex:1;min-width:200px"><b>${esc(p.titulo)}</b><div class="small muted">${p.tipo === "peca" ? "Peça técnica · 30 pts" : "Questão · 15 pts"}${melhor !== null ? ` · melhor nota ${melhor.toFixed(1)}` : ""}${temRascunho ? ` · <span class="badge">📝 Rascunho salvo</span>` : ""}</div></div><button class="btn sm" data-act="abrirDisc" data-id="${p.id}">${temRascunho ? "Continuar" : feitos.length ? "Refazer" : "Treinar"}</button></section>`;
  }).join("")}`;
};
AFTER.discursiva = () => {
  const t = $("#texto");
  if (t) { const p = DISCURSIVAS.find(x => x.id === D.id), max = p.tipo === "peca" ? 50 : 20;
    const up = () => { D.texto = t.value; st.rascunhoDisc = { id: D.id, texto: D.texto }; save(); const n = contaLinhas(t.value); const el = $("#linhas"); el.textContent = `${n}/${max} linhas`; el.style.color = n > max ? "var(--bad)" : ""; };
    t.addEventListener("input", up); up(); }
  const nc = $("#nc"), ne = $("#ne");
  if (nc) { const p = DISCURSIVAS.find(x => x.id === D.id), pts = p.tipo === "peca" ? 30 : 15, k = p.tipo === "peca" ? 6 : 3;
    const up = () => { D.nc = Math.min(pts, Math.max(0, parseFloat(nc.value) || 0)); D.ne = Math.max(0, parseInt(ne.value) || 0); $("#notaDisc").textContent = Math.max(0, D.nc - k * D.ne / Math.max(1, contaLinhas(D.texto))).toFixed(2); };
    nc.addEventListener("input", up); ne.addEventListener("input", up); }
};
function promptCorrecao() {
  const p = DISCURSIVAS.find(x => x.id === D.id), pts = p.tipo === "peca" ? 30 : 15, k = p.tipo === "peca" ? 6 : 3;
  return `Você é examinador(a) da banca Cebraspe corrigindo a prova discursiva do concurso de Analista Legislativo – Comunicação Social (Área: Jornalismo) da Câmara dos Deputados.

COMANDO DA QUESTÃO:
${p.comando}

ASPECTOS ESPERADOS (padrão de resposta):
${p.aspectos.map(a => "- " + a).join("\n")}

TEXTO DA CANDIDATA (${contaLinhas(D.texto)} linhas estimadas, limite ${p.tipo === "peca" ? 50 : 20}):
"""
${D.texto}
"""

Corrija com o rigor do Cebraspe:
1. Atribua a nota de conteúdo NC (0 a ${pts}), considerando apresentação, estrutura textual e desenvolvimento de cada aspecto. Justifique item por item.
2. Liste TODOS os erros de grafia, morfossintaxe e propriedade vocabular (NE), citando o trecho e a correção.
3. Calcule a nota: NC − ${k} × NE ÷ TL (TL = linhas escritas).
4. Dê 3 sugestões objetivas para melhorar e reescreva o parágrafo mais fraco.`;
}
async function copiar(txt, okMsg = "Copiado! Cole na IA de sua preferência.") {
  try { await navigator.clipboard.writeText(txt); toast("📋 " + okMsg); }
  catch { modal(`<h3>Copie o texto abaixo</h3><textarea rows="12" readonly>${esc(txt)}</textarea><button class="btn block" style="margin-top:10px" data-act="fechar">Fechar</button>`); }
}

// ----- Progresso -----
VIEWS.progresso = () => {
  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
  const max = Math.max(10, ...dias.map(d => st.dias[dkey(d)]?.xp || 0));
  const ac = acuracia();
  return `<h1>Progresso</h1>
  <section class="grid g3 keep">
    <div class="card stat"><b>${totalResp()}</b><span>questões</span></div>
    <div class="card stat"><b>${ac.liqPct}%</b><span>nota líquida (${ac.pct}% brutos)</span></div>
    <div class="card stat"><b>${Math.round(totalMin() / 6) / 10}h</b><span>de foco</span></div>
  </section>
  <section class="card"><h3>XP nos últimos 7 dias</h3><div class="week">${dias.map(d => { const v = st.dias[dkey(d)]?.xp || 0; return `<div><small class="small">${v || ""}</small><i style="height:${100 * v / max}%"></i><span>${"DSTQQSS"[d.getDay()]}</span></div>`; }).join("")}</div></section>
  <section class="card"><h3>Desempenho por matéria (Cebraspe)</h3><p class="small muted">A barra exibe os acertos brutos; ao lado consta o saldo líquido descontando os erros (1 erro anula 1 acerto).</p>${EDITAL.materias.map(m => { const a = acuracia(m.id); return `<div style="padding:6px 0"><div class="row between small"><span>${m.icone} ${m.nome} <span class="badge">${m.prova}</span></span><span class="muted">${a.n ? `${a.pct}% brutos · <b>${a.liqPct}% líq.</b> (${a.n})` : "—"}</span></div><div class="bar" style="margin-top:4px"><i style="width:${a.pct}%;background:${m.cor}"></i></div></div>`; }).join("")}</section>
  <a class="btn sec block" href="#conquistas">🏅 Ver conquistas (${Object.keys(st.conquistas).length}/${CONQUISTAS.length})</a>`;
};
VIEWS.conquistas = () => `<h1>Conquistas</h1><p class="muted">${Object.keys(st.conquistas).length} de ${CONQUISTAS.length} desbloqueadas</p>
  <section class="grid g2">${CONQUISTAS.map(([id, e, nome, desc]) => `<div class="card flat ach ${st.conquistas[id] ? "" : "locked"}"><span class="e">${e}</span><div><b>${nome}</b><div class="small muted">${desc}</div></div></div>`).join("")}</section>`;
VIEWS.recados = () => `<h1>Recados 💌</h1><p class="muted">Mensagens que desbloqueiam conforme você avança.</p>
  ${RECADOS.map((r, i) => { const ok = st.recadosVistos.includes(i) || recadoAtingido(r); const req = { nivel: `Nível ${r.valor}`, sequencia: `${r.valor} dias seguidos`, questoes: `${r.valor} questões` }[r.tipo]; return `<section class="card flat">${ok ? `<p style="margin:0">💌 ${esc(r.texto)}</p>` : `<p class="muted" style="margin:0">🔒 Desbloqueia com: ${req}</p>`}</section>`; }).join("")}`;

// ----- Mais / materiais / config / import / backup -----
VIEWS.mais = () => {
  const recDesbloq = RECADOS.filter((r, i) => st.recadosVistos.includes(i) || recadoAtingido(r)).length;
  return `<h1>Mais</h1><nav class="card list">
  ${[
    ["#foco", `⏳ Foco (Pomodoro) <span class="badge">${Math.round(totalMin() / 6) / 10}h</span>`],
    ["#discursiva", `✍️ Treino de discursiva <span class="badge">${st.discursivas.length} feitos</span>`],
    ["#progresso", `📊 Progresso e estatísticas`],
    ["#conquistas", `🏅 Conquistas <span class="badge">${Object.keys(st.conquistas).length}/${CONQUISTAS.length}</span>`],
    ["#recados", `💌 Recados <span class="badge">${recDesbloq}/${RECADOS.length}</span>`],
    ["#materiais", `📚 Materiais gratuitos oficiais`],
    ["#importar", `🤖 Gerar mais questões com IA`],
    ["#backup", `🔄 Backup e sincronizar aparelhos`],
    ["#config", `⚙️ Configurações`]
  ].map(([h, t]) => `<a href="${h}" class="row between">${t}</a>`).join("")}
  </nav>
  <section class="card flat small"><b>Instalar no iPhone:</b> abra no Safari → botão Compartilhar → “Adicionar à Tela de Início”.<br><b>No Chrome (notebook):</b> ícone de instalar na barra de endereço.</section>`;
};
VIEWS.materiais = () => `<h1>Materiais gratuitos</h1><p class="muted">Estude pela fonte oficial — é de graça e é exatamente o que a banca cobra.</p>
  ${MATERIAIS.map(g => `<section class="card"><h3>${esc(g.grupo)}</h3><div class="list">${g.itens.map(([t, u, d]) => `<a href="${esc(u)}" ${u.startsWith("#") ? "" : 'target="_blank" rel="noopener"'}><b>${esc(t)}</b>${d ? `<div class="small muted">${esc(d)}</div>` : ""}</a>`).join("")}</div></section>`).join("")}
  <section class="card"><h3>Método sugerido (grátis)</h3><ol class="small" style="padding-left:18px;margin:0">
    <li>Leia a lei seca do tópico (links acima), marcando o edital aqui no app.</li>
    <li>Resolva itens C/E da matéria e leia todos os comentários.</li>
    <li>Revise os flashcards diariamente (5–10 min).</li>
    <li>1 simulado por semana; 1 discursiva por semana a partir de novembro.</li>
    <li>Gere novas questões com IA a partir do texto da lei e importe aqui.</li></ol></section>`;
VIEWS.config = () => `<h1>Configurações</h1><section class="card">
  <label class="field">Seu nome<input type="text" id="cfNome" value="${esc(st.nome)}" maxlength="30"></label>
  <label class="field">Meta diária de questões<input type="number" id="cfMeta" min="5" max="300" value="${st.meta}"></label>
  <label class="field">Data da prova<input type="date" id="cfData" value="${st.dataProva}"></label>
  <label class="field">Tema<select id="cfTema">${[["auto", "Automático"], ["light", "Claro"], ["dark", "Escuro"]].map(([v, t]) => `<option value="${v}" ${st.tema === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
  <label class="row" style="margin-bottom:12px"><input type="checkbox" id="cfSom" ${st.som ? "checked" : ""} style="width:20px;height:20px"> Sons de acerto/erro</label>
  <button class="btn block" data-act="salvarCfg">Salvar</button></section>
  <section class="card"><h3>Zona de perigo</h3><button class="btn ghost" data-act="resetar" style="color:var(--bad)">Apagar todo o progresso</button></section>`;
const PROMPT_GERAR = mat => `Atue como elaborador(a) de provas do Cebraspe. Crie 20 itens inéditos no formato CERTO/ERRADO para o concurso de Analista Legislativo – Comunicação Social (Área: Jornalismo) da Câmara dos Deputados (edital 2026).

Matéria: ${mat.nome}
Tópicos do edital: ${mat.topicos.join("; ")}

Regras:
- Itens com assertivas autossuficientes, no estilo Cebraspe (pegadinhas de troca de palavra, extrapolação, inversão de conceitos).
- Cerca de metade CERTO e metade ERRADO.
- Comentário curto explicando o gabarito, citando artigo de lei quando houver.
- Use apenas fatos verificáveis; na dúvida, não crie o item.

Responda SOMENTE com um JSON válido, sem texto antes ou depois, neste formato:
[{"materia":"${mat.id}","enunciado":"...","gabarito":"C","comentario":"..."}]`;
VIEWS.importar = () => `<h1>Gerar questões com IA (grátis)</h1>
  <p class="muted">1) Escolha a matéria e copie o prompt · 2) Cole no ChatGPT, Gemini ou Claude (versões gratuitas) · 3) Cole a resposta abaixo e importe.</p>
  <section class="card"><label class="field">Matéria<select id="impMat">${EDITAL.materias.map(m => `<option value="${m.id}">${m.icone} ${m.nome}</option>`).join("")}</select></label>
  <button class="btn sec" data-act="copiarPromptGerar">📋 Copiar prompt</button>
  <p class="small muted" style="margin-top:10px">Dica: anexe o PDF da lei (ou cole o texto) junto ao prompt para a IA errar menos. Confira itens duvidosos na lei seca.</p></section>
  <section class="card"><label class="field">Resposta da IA (JSON)<textarea id="impTxt" rows="8" placeholder='[{"materia":"port","enunciado":"...","gabarito":"C","comentario":"..."}]'></textarea></label>
  <button class="btn" data-act="importarQ">Importar questões</button>
  <p class="small muted" style="margin-top:10px">Você já importou ${st.custom.length} itens. <button class="btn ghost sm" data-act="limparCustom" ${st.custom.length ? "" : "disabled"}>Remover importadas</button></p></section>`;
VIEWS.backup = () => `<h1>Backup e sincronização</h1>
  <p class="muted">O progresso fica salvo neste aparelho. Para levar do notebook ao iPhone (ou vice-versa), exporte aqui e importe no outro. Faça backup toda semana.</p>
  <section class="card"><h3>Exportar</h3><div class="row"><button class="btn" data-act="baixarBackup">⬇️ Baixar arquivo</button><button class="btn sec" data-act="copiarBackup">📋 Copiar como texto</button></div>
  <p class="small muted" style="margin-top:8px">“Copiar como texto” é ótimo para mandar por WhatsApp/e-mail para você mesma.</p></section>
  <section class="card"><h3>Importar (substitui o progresso atual)</h3>
  <input type="file" id="bkFile" accept=".json,application/json" style="margin-bottom:10px">
  <textarea id="bkTxt" rows="5" placeholder="…ou cole aqui o texto do backup"></textarea>
  <button class="btn" style="margin-top:10px" data-act="restaurar">Restaurar</button></section>`;

// ---------- Ações (delegação de eventos) ----------
const ACOES = {
  fechar: fecharModal,
  treinoRapido: () => iniciarSessao({ mats: [], modo: "treino", n: 10 }),
  treinoMat: el => iniciarSessao({ mats: [el.dataset.m], modo: "treino", n: 10 }),
  matAll: () => { filtro.mats = []; route(true); },
  matProva: el => { filtro.mats = EDITAL.materias.filter(m => m.prova === el.dataset.p).map(m => m.id); route(true); },
  mat: el => { const m = el.dataset.m; filtro.mats = filtro.mats.includes(m) ? filtro.mats.filter(x => x !== m) : [...filtro.mats, m]; route(true); },
  modo: el => { filtro.modo = el.dataset.k; if (filtro.modo === "simulado" && filtro.n < 30) filtro.n = 30; route(true); },
  qtd: el => { filtro.n = +el.dataset.n; route(true); },
  iniciar: () => iniciarSessao(),
  resp: el => responder(+el.dataset.v),
  prox: proxima,
  sair: () => {
    if (!S) return;
    if (S.resp.length > 0 && S.i + 1 < S.itens.length) {
      modal(`<h3>Encerrar sessão?</h3><p class="muted">Você respondeu ${S.resp.length} de ${S.itens.length} questões.</p><div class="row"><button class="btn" data-act="confirmaSair">${S.modo === "simulado" ? "Finalizar e ver nota" : "Encerrar agora"}</button><button class="btn ghost" data-act="fechar">Continuar estudando</button></div>`);
    } else {
      if (S.resp.length && S.modo === "simulado") finalizarSessao(); else { S = null; saveS(); route(); }
    }
  },
  confirmaSair: () => { fecharModal(); if (S?.resp.length) finalizarSessao(); else { S = null; saveS(); route(); } },
  reverErrosSessao: () => {
    if (!S) return;
    const erradas = S.itens.filter((q, i) => S.resp[i] !== -1 && S.resp[i] !== undefined && (S.resp[i] === 1) !== q.a);
    if (!erradas.length) return;
    S = { modo: "treino", itens: erradas, i: 0, resp: [], seq: 0, xp: 0, inicio: Date.now(), fim: false };
    saveS(); route();
  },
  denovo: () => { S = null; saveS(); route(); },
  limparS: () => { S = null; saveS(); },
  estudarCards: el => estudarCards(el.dataset.m),
  virar: virarCard,
  nota: el => notaCard(+el.dataset.v),
  sairCards: () => { F = null; route(); },
  topico: el => ciclarTopico(el.dataset.k),
  togglePend: () => { editalAbertos = new Set([...document.querySelectorAll("details.mat[open]")].map(d => d.dataset.m)); editalSoPend = !editalSoPend; if (editalSoPend && !editalAbertos.size) editalAbertos = new Set(EDITAL.materias.map(m => m.id)); route(true); },
  toggleExpandEdital: () => { editalAbertos = editalAbertos.size >= EDITAL.materias.length ? new Set() : new Set(EDITAL.materias.map(m => m.id)); route(true); },
  dur: el => { pomo.dur = +el.dataset.v; route(true); },
  iniciarPomo: () => { pomo.mat = $("#pomoMat").value; pomo.fim = Date.now() + pomo.dur * 60000; pomo.pausa = false; syncPomoTimer(); route(true); },
  pausar: () => { if (pomo.pausa) { pomo.fim = Date.now() + pomo.rest; pomo.pausa = false; } else { pomo.rest = pomo.fim - Date.now(); pomo.pausa = true; } syncPomoTimer(); route(true); },
  pararPomo: () => { pomo.fim = 0; pomo.rest = 0; pomo.pausa = false; syncPomoTimer(); document.title = "Rumo à Câmara"; route(true); },
  abrirDisc: el => {
    const id = el.dataset.id;
    const rasc = st.rascunhoDisc?.id === id ? st.rascunhoDisc.texto : null;
    const ant = st.discursivas.filter(d => d.id === id).pop();
    D = { id, texto: rasc ?? ant?.texto ?? "", etapa: "escrever", marc: [], ne: 0, nc: null };
    route();
  },
  sairDisc: () => { D = null; route(); },
  avaliarDisc: () => { if (contaLinhas(D.texto) < 3) return toast("Escreva pelo menos algumas linhas 😉"); D.etapa = "avaliar"; route(); },
  voltarEscrever: () => { D.etapa = "escrever"; route(); },
  aspecto: el => { D.marc[+el.dataset.i] = el.checked; D.nc = null; route(true); },
  promptDisc: () => copiar(promptCorrecao()),
  salvarDisc: () => {
    const p = DISCURSIVAS.find(x => x.id === D.id), pts = p.tipo === "peca" ? 30 : 15, k = p.tipo === "peca" ? 6 : 3;
    const nc = Math.min(pts, Math.max(0, D.nc ?? Math.round(pts * D.marc.filter(Boolean).length / p.aspectos.length * 10) / 10)), tl = Math.max(1, contaLinhas(D.texto));
    st.discursivas.push({ id: D.id, data: Date.now(), linhas: tl, nc, ne: Math.max(0, D.ne || 0), nota: Math.max(0, nc - k * Math.max(0, D.ne || 0) / tl), texto: D.texto });
    if (st.rascunhoDisc?.id === D.id) st.rascunhoDisc = null;
    D = null; marcarAtividade(); addXP(50, "discursiva treinada"); confetti(); route();
  },
  salvarCfg: () => {
    st.nome = $("#cfNome").value.trim() || "Futura Analista"; st.meta = Math.max(5, +$("#cfMeta").value || 30);
    st.dataProva = $("#cfData").value || EDITAL.dataProva; st.tema = $("#cfTema").value; st.som = $("#cfSom").checked;
    save(); aplicarTema(); toast("Salvo ✔"); go("inicio");
  },
  resetar: () => modal(`<h2>Apagar tudo?</h2><p>Isso remove XP, respostas, conquistas e histórico deste aparelho. Considere fazer um backup antes.</p><div class="row"><button class="btn bad" data-act="confirmaReset">Apagar</button><button class="btn ghost" data-act="fechar">Cancelar</button></div>`),
  confirmaReset: () => { const nome = st.nome; st = DEFAULT(); st.nome = nome; S = null; saveS(); save(); buildBank(); fecharModal(); go("inicio"); },
  copiarPromptGerar: () => copiar(PROMPT_GERAR(MAT[$("#impMat").value])),
  importarQ: () => {
    const txt = $("#impTxt").value, a = txt.indexOf("["), b = txt.lastIndexOf("]");
    let arr; try { arr = JSON.parse(txt.slice(a, b + 1)); } catch { return toast("❌ JSON inválido. Copie só a resposta da IA."); }
    const existentes = new Set(ALL.map(q => q.q.trim().toLowerCase())); let n = 0;
    for (const it of Array.isArray(arr) ? arr : []) {
      const m = String(it.materia || "").trim(), q = String(it.enunciado || "").trim(), g = String(it.gabarito ?? "").trim().toUpperCase();
      if (!MAT[m] || q.length < 15 || !["C", "E", "CERTO", "ERRADO", "TRUE", "FALSE"].includes(g) || existentes.has(q.toLowerCase())) continue;
      st.custom.push({ id: `x-${hash(q)}`, m, q, a: ["C", "CERTO", "TRUE"].includes(g), e: String(it.comentario || "Item gerado por IA — confira na fonte.") + " (gerado por IA)" });
      existentes.add(q.toLowerCase()); n++;
    }
    save(); buildBank(); toast(n ? `✅ ${n} questões importadas!` : "Nenhuma questão nova encontrada"); if (n) addXP(5); route();
  },
  limparCustom: () => { st.custom = []; for (const k of Object.keys(st.resp)) if (k.startsWith("x-")) delete st.resp[k]; save(); buildBank(); route(); },
  baixarBackup: () => {
    const blob = new Blob([JSON.stringify(st)], { type: "application/json" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `rumo-camara-backup-${dkey()}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  copiarBackup: () => copiar(JSON.stringify(st), "Backup copiado!"),
  restaurar: async () => {
    let txt = $("#bkTxt").value.trim(); const f = $("#bkFile").files[0];
    if (f) txt = await f.text();
    let obj; try { obj = JSON.parse(txt); if (!obj || obj.v !== 1) throw 0; } catch { return toast("❌ Backup inválido"); }
    st = Object.assign(DEFAULT(), obj); st.custom = (Array.isArray(st.custom) ? st.custom : []).filter(c => c && MAT[c.m]); st.editalXP ||= {};
    save(); buildBank(); aplicarTema(); toast("✅ Progresso restaurado!"); go("inicio");
  },
  onboard: () => { st.nome = $("#obNome").value.trim() || "Futura Analista"; st.meta = +$("#obMeta").value || 30; save(); fecharModal(); addXP(10, "boas-vindas"); route(); }
};
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  if (el.type === "checkbox") { ACOES[el.dataset.act]?.(el, e); return; }
  if (el.tagName !== "A") e.preventDefault();
  ACOES[el.dataset.act]?.(el, e);
});
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") fecharModal(); });
document.addEventListener("keydown", e => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  const k = e.key.toLowerCase();
  if (location.hash.startsWith("#questoes") && S && !S.fim) {
    if (S.resp[S.i] === undefined) { if (k === "c") responder(1); else if (k === "e") responder(0); else if (k === "b") responder(-1); }
    else if (k === "enter" || k === "arrowright") proxima();
  }
  if (location.hash.startsWith("#cards") && F) {
    if (k === " ") { e.preventDefault(); virarCard(); }
    else if (F.virado && ["1", "2", "3"].includes(k)) notaCard(+k - 1);
  }
  if (k === "escape" && !$("#modal").hidden) fecharModal();
});
document.addEventListener("visibilitychange", () => { if (!document.hidden && (pomo.fim > 0 || pomo.rest > 0)) focoTick(); });

function aplicarTema() { if (st.tema === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.dataset.theme = st.tema; }

// ---------- Inicialização ----------
load(); buildBank(); loadS(); aplicarTema();
window.addEventListener("hashchange", () => route(false));
route();
if (!st.nome) modal(`<div style="text-align:center"><div style="font-size:3rem">🏛️</div><h2>Bem-vinda ao Rumo à Câmara!</h2><p class="muted">Seu app de estudos para Analista Legislativo – Comunicação Social (Jornalismo).</p></div>
  <label class="field">Como você quer ser chamada?<input type="text" id="obNome" maxlength="30" placeholder="Seu nome"></label>
  <label class="field">Meta diária de questões<select id="obMeta"><option>20</option><option selected>30</option><option>50</option><option>80</option></select></label>
  <button class="btn block" data-act="onboard">Começar a jornada ✨</button>`);
else checkRecados();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
