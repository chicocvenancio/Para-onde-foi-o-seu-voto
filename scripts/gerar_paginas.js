#!/usr/bin/env node
/*
 * Gera uma página estática pequena para cada link direto (/UF/numero, /UF/legenda,
 * /UF/branco, /UF/nulo e as mesmas com /ano/ na frente), para que o link tenha
 * status 200 e título/descrição próprios na prévia do Reddit, WhatsApp etc.
 * A página só leva as meta tags e redireciona para o site, que abre o resultado.
 *
 * Uso:
 *   node scripts/gerar_paginas.js [pasta-de-saída] [filtro]
 *   node scripts/gerar_paginas.js . MA/1301      # só uma página, para conferir
 */
const fs = require("fs");
const path = require("path");
const Motor = require("../engine.js");

const RAIZ = path.resolve(__dirname, "..");
const SAIDA = path.resolve(process.argv[2] || RAIZ);
const FILTRO = process.argv[3] || "";
const SITE = "https://chicocvenancio.github.io/Para-onde-foi-o-seu-voto/";

const NOMES_UF = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MG: "Minas Gerais",
  MS: "Mato Grosso do Sul", MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco",
  PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondônia",
  RR: "Roraima", RS: "Rio Grande do Sul", SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo",
  TO: "Tocantins",
};
const NO = { AC: "no", AM: "no", AP: "no", BA: "na", CE: "no", DF: "no", ES: "no", MA: "no", PA: "no",
  PI: "no", PR: "no", RJ: "no", RN: "no", RS: "no", TO: "no", PB: "na", MS: "em", MT: "em" };
const emUF = (uf) => `${NO[uf] || "em"} ${NOMES_UF[uf]}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (x) => Math.round(x * 100) + "%";

function listaPartes(partes) {
  const top = partes.slice(0, 3).map((p) => `${p.cand.nome} (${pct(p.frac)})`);
  const resto = partes.length - top.length;
  if (resto > 0) return `${top.join(", ")} e mais ${resto}`;
  return top.length > 1 ? `${top.slice(0, -1).join(", ")} e ${top.at(-1)}` : top[0];
}

function textos(d, escolha) {
  const onde = `${emUF(d.uf)} em ${d.ano}`;
  if (escolha.tipo === "branco" || escolha.tipo === "nulo") {
    const n = escolha.tipo === "branco" ? d.brancos : d.nulos;
    return {
      titulo: `Voto ${escolha.tipo === "branco" ? "em branco" : "nulo"} para deputado federal ${onde}`,
      descricao: `Votos ${escolha.tipo === "branco" ? "em branco" : "nulos"} não vão para ninguém. ` +
        `${n.toLocaleString("pt-BR")} eleitores votaram assim ${onde}. Veja o que isso muda no quociente eleitoral.`,
    };
  }
  const r = Motor.atribuir(d, escolha);
  const quem = escolha.tipo === "candidato"
    ? `${r.candidato.nome} (${r.candidato.n}, ${r.candidato.partido})`
    : `legenda ${escolha.partido}`;
  const titulo = `Para onde foi o voto em ${quem} ${onde}?`;
  const descricao = r.partes.length
    ? `Um voto em ${quem} ajudou a eleger ${listaPartes(r.partes)}.`
    : `Um voto em ${quem} não ajudou a eleger ninguém: ${r.grupo.id[0] === "F" ? "a federação" : "o partido"} ${r.grupo.sigla} não conquistou vagas ${emUF(d.uf)}.`;
  return { titulo, descricao: descricao + " Entenda o sistema proporcional da Câmara." };
}

function pagina(rota, { titulo, descricao }) {
  const profundidade = rota.split("/").length;
  const raiz = "../".repeat(profundidade);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<link rel="canonical" href="${SITE}${rota}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Para onde foi o seu voto?">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${SITE}${rota}">
<meta property="og:locale" content="pt_BR">
<meta name="twitter:card" content="summary">
<script>
var r = ${JSON.stringify(rota)}, p = location.pathname.replace(/\\/$/, "");
var base = p.slice(-r.length) === r ? p.slice(0, -r.length) : ${JSON.stringify(raiz)};
location.replace(base + "?v=" + encodeURIComponent(r) + location.hash);
</script>
</head>
<body>
<p>${esc(descricao)}</p>
<p><a href="${raiz}?v=${encodeURIComponent(rota)}">Ver o resultado completo</a></p>
</body>
</html>
`;
}

function rotas(d, maisRecente) {
  const prefixos = String(d.ano) === maisRecente ? ["", `${d.ano}/`] : [`${d.ano}/`];
  const numeros = new Map(); // legenda: número -> sigla
  for (const c of d.candidatos) if (!numeros.has(c.n.slice(0, 2))) numeros.set(c.n.slice(0, 2), c.partido);
  const escolhas = [
    ...d.candidatos.map((c) => [c.n, { tipo: "candidato", numero: c.n }]),
    ...[...numeros].map(([n, sigla]) => [n, { tipo: "legenda", partido: sigla }]),
    ["branco", { tipo: "branco" }], ["nulo", { tipo: "nulo" }],
  ];
  return prefixos.flatMap((p) => escolhas.map(([fim, e]) => [`${p}${d.uf}/${fim}`, e]));
}

const indice = JSON.parse(fs.readFileSync(path.join(RAIZ, "data/index.json"), "utf8"));
const maisRecente = Object.keys(indice.anos).sort().at(-1);
let total = 0, bytes = 0;
for (const [ano, ufs] of Object.entries(indice.anos)) {
  for (const uf of ufs) {
    const d = JSON.parse(fs.readFileSync(path.join(RAIZ, `data/${ano}/${uf}.json`), "utf8"));
    for (const [rota, escolha] of rotas(d, maisRecente)) {
      if (FILTRO && rota !== FILTRO) continue;
      const html = pagina(rota, textos(d, escolha));
      const destino = path.join(SAIDA, rota, "index.html");
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, html);
      total++; bytes += Buffer.byteLength(html);
    }
  }
}
console.error(`${total} páginas, ${(bytes / 1e6).toFixed(1)} MB`);
