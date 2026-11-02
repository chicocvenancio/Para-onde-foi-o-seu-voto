(function () {
  "use strict";

  const NOMES_UF = {
    AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará",
    DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MG: "Minas Gerais",
    MS: "Mato Grosso do Sul", MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco",
    PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondônia",
    RR: "Roraima", RS: "Rio Grande do Sul", SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo",
    TO: "Tocantins",
  };

  // preposição + nome do estado ("no Acre", "na Bahia", "em São Paulo")
  const NO = { AC: "no", AM: "no", AP: "no", BA: "na", CE: "no", DF: "no", ES: "no", MA: "no", PA: "no",
    PI: "no", PR: "no", RJ: "no", RN: "no", RS: "no", TO: "no", PB: "na", MS: "em", MT: "em" };
  const emUF = (uf) => `${NO[uf] || "em"} ${NOMES_UF[uf]}`;
  const maiuscula = (s) => s[0].toUpperCase() + s.slice(1);

  // Cargos: "federal" (Câmara dos Deputados) e "estadual" (Assembleia Legislativa;
  // no DF, deputado distrital na Câmara Legislativa).
  // Nome do cargo; com uma candidata (c.f), no feminino: "vereadora", "deputada federal"...
  const nomeCargo = (d, c) => {
    const nome = d.cargo === "vereador" ? "vereador" : d.cargo === "federal" ? "deputado federal"
      : d.uf === "DF" ? "deputado distrital" : "deputado estadual";
    return c && c.f ? nome.replace(/^vereador$/, "vereadora").replace(/^deputado/, "deputada") : nome;
  };
  const DIGITOS = { federal: 4, estadual: 5, vereador: 5 };
  const municipal = (ano) => Number(ano) % 4 === 0; // 2020, 2024: eleições municipais
  // Onde foi a eleição: o estado (deputados) ou o município (vereadores).
  const ondeDe = (d) => d.cargo !== "vereador" ? emUF(d.uf)
    : d.municipio === "Rio de Janeiro" ? "no Rio de Janeiro" : `em ${d.municipio}`;
  const localDe = (d) => d.cargo === "vereador" ? `${d.municipio} (${d.uf})` : NOMES_UF[d.uf];

  // Concordância: "f" vem do gênero declarado ao TSE.
  const gen = (c, masc, fem) => (c && c.f ? fem : masc);
  const todasMulheres = (lista) => lista.length > 0 && lista.every((c) => c.f);

  // Endereço base do site (a pasta do app.js), para que os links /UF/numero funcionem
  // em qualquer pasta, inclusive no GitHub Pages (/Para-onde-foi-o-seu-voto/).
  const BASE = new URL(".", document.currentScript.src);
  const url = (caminho) => new URL(caminho, BASE).href;

  // Os links diretos trocam o endereço para /UF/numero; fixa os ícones em endereço
  // absoluto antes disso, senão "img/favicon.svg" passaria a apontar para /UF/img/.
  document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((l) => {
    l.href = url(l.getAttribute("href"));
  });

  const $ = (id) => document.getElementById(id);
  const el = {
    uf: $("uf"), ano: $("ano"), passoTipo: $("passo-tipo"), passoEscolha: $("passo-escolha"),
    escCand: $("escolha-candidato"), escLeg: $("escolha-legenda"), busca: $("busca"),
    sugestoes: $("sugestoes"), partido: $("partido"), aviso: $("aviso"), resultado: $("resultado"),
    resumoUF: $("resumo-uf"), cargo: $("cargo"), municipio: $("municipio"), legendaTipo: $("legenda-tipo"), descCandidato: $("desc-candidato"),
  };
  const TITULO = document.title;              // título completo da página inicial
  const MARCA = "Para onde foi o seu voto?";  // sufixo curto nos resultados

  const fmt = new Intl.NumberFormat("pt-BR");
  const fmtPct = (x) => {
    const p = x * 100;
    const casas = Math.round(p * 10) / 10 >= 10 ? 0 : Math.round(p * 100) / 100 >= 1 ? 1 : 2;
    return p.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%";
  };
  const semAcento = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const slug = (s) => semAcento(s).replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let indice = null;
  let dados = null;
  const indicesMunicipios = new Map(); // ano -> {UF: [[código, nome, vagas]], semDados: {...}}
  const cache = new Map();

  function aviso(msg) {
    el.aviso.hidden = !msg;
    el.aviso.innerHTML = msg || "";
  }

  const cargoAtual = () => (el.cargo && el.cargo.value) || "federal";
  // "anos" é o índice dos federais; os outros cargos ficam em "estadual" e "vereador"
  const indiceDo = (cargo) => (cargo === "federal" ? indice.anos : indice[cargo]) || {};
  const anoMaisRecenteDo = (cargo) => Object.keys(indiceDo(cargo)).sort().pop();
  const NOMES_CARGO = { federal: "Deputado federal", estadual: "Deputado estadual (distrital no DF)", vereador: "Vereador" };

  // Eleições: todas as que têm dados, da mais recente para a mais antiga.
  function preencherAnos() {
    const anos = [...new Set(["federal", "estadual", "vereador"].flatMap((c) => Object.keys(indiceDo(c))))].sort().reverse();
    el.ano.innerHTML = anos.map((a) => `<option value="${a}">Eleição ${a} · ${municipal(a) ? "vereadores" : "deputados"}</option>`).join("");
    el.ano.value = anoMaisRecenteDo("federal") || anos[0];
    el.ano.hidden = anos.length < 2;
  }

  // Cargos da eleição escolhida (municipal: vereador; geral: deputado federal e estadual).
  function preencherCargos() {
    const atual = cargoAtual(), ano = el.ano.value;
    const cargos = (municipal(ano) ? ["vereador"] : ["federal", "estadual"]).filter((c) => indiceDo(c)[ano]);
    el.cargo.innerHTML = cargos.map((c) => `<option value="${c}">${NOMES_CARGO[c]}</option>`).join("");
    el.cargo.value = cargos.includes(atual) ? atual : cargos[0];
    el.cargo.disabled = cargos.length < 2;
  }

  async function indiceMunicipios(ano) {
    if (!indicesMunicipios.has(ano)) {
      const r = await fetch(url(`data/${ano}/vereador/index.json`), { cache: "no-cache" });
      if (!r.ok) throw new Error(r.status);
      indicesMunicipios.set(ano, await r.json());
    }
    return indicesMunicipios.get(ano);
  }

  // Lista de municípios do estado (só para vereador). "sem:" marca os que não têm votação nos dados do TSE.
  async function preencherMunicipios() {
    const uf = el.uf.value, ano = el.ano.value;
    if (cargoAtual() !== "vereador" || !uf) { el.municipio.hidden = true; el.municipio.innerHTML = ""; return; }
    const atual = el.municipio.value;
    let idx;
    try { idx = await indiceMunicipios(ano); } catch (e) { aviso("Não foi possível carregar a lista de municípios. Verifique a conexão e tente de novo."); return; }
    const lista = (idx[uf] || []).map(([cod, nome]) => [cod, nome])
      .concat(((idx.semDados || {})[uf] || []).map(([cod, nome]) => [`sem:${cod}`, `${nome} (sem dados)`]))
      .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
    el.municipio.innerHTML = '<option value="">Escolha o município…</option>' +
      lista.map(([cod, nome]) => `<option value="${esc(cod)}">${esc(nome)}</option>`).join("");
    if (lista.some(([cod]) => cod === atual)) el.municipio.value = atual;
    el.municipio.hidden = false;
  }

  // Textos do quiz que dependem do cargo (com o estado escolhido, "distrital" no DF).
  function atualizarTextosCargo() {
    const cargo = cargoAtual();
    const nome = nomeCargo({ cargo, uf: el.uf.value });
    if (el.legendaTipo) el.legendaTipo.textContent = `Como você votou para ${nome}?`;
    if (el.descCandidato) el.descCandidato.textContent = `Digitei o número de ${DIGITOS[cargo]} dígitos`;
    el.busca.placeholder = `Ex.: Maria ou ${DIGITOS[cargo] === 4 ? "1234" : "12345"}`;
  }

  async function iniciar() {
    try {
      const r = await fetch(url("data/index.json"), { cache: "no-cache" });
      if (!r.ok) throw new Error(r.status);
      indice = await r.json();
    } catch (e) {
      aviso("Os dados da eleição ainda não foram gerados. Rode <code>python3 scripts/build_data.py 2022 2026</code> e abra o site por um servidor (ex.: <code>python3 -m http.server</code>).");
      el.uf.disabled = true;
      return;
    }
    preencherAnos();
    preencherCargos();
    preencherUFs();
    atualizarTextosCargo();
    await abrirRota(lerRota());
  }

  function preencherUFs() {
    const ufs = indiceDo(cargoAtual())[el.ano.value] || [];
    const atual = el.uf.value;
    el.uf.innerHTML = '<option value="">Escolha o estado…</option>' +
      ufs.slice().sort((a, b) => NOMES_UF[a].localeCompare(NOMES_UF[b], "pt-BR"))
        .map((u) => `<option value="${u}">${NOMES_UF[u]}</option>`).join("");
    if (ufs.includes(atual)) el.uf.value = atual;
  }

  async function carregarUF({ automatico = false } = {}) {
    const uf = el.uf.value, ano = el.ano.value, cargo = cargoAtual();
    el.resultado.hidden = true;
    atualizarTextosCargo();
    const semDados = () => { dados = null; el.passoTipo.disabled = true; mostrarResumoUF(); };
    if (!uf) { semDados(); atualizarRota(); return false; }
    let chave = `${ano}/${cargo === "federal" ? "" : cargo + "/"}${uf}`;
    if (cargo === "vereador") {
      const cod = el.municipio.value;
      if (!cod) { semDados(); aviso(""); atualizarRota(); return false; }
      if (cod.startsWith("sem:")) {
        semDados();
        aviso(`O TSE não publicou a votação de vereador de ${esc(el.municipio.selectedOptions[0].textContent.replace(" (sem dados)", ""))} em ${esc(ano)} nos dados abertos.`);
        return false;
      }
      chave += "/" + cod;
    }
    try {
      if (!cache.has(chave)) {
        // "no-cache" = revalida com o servidor (304 se nada mudou), para nunca misturar
        // um app.js novo com dados antigos guardados pelo navegador.
        const r = await fetch(url(`data/${chave}.json`), { cache: "no-cache" });
        if (!r.ok) throw new Error(r.status);
        const d = await r.json();
        d.cargo = cargo;
        d.uf = uf;
        // os arquivos de vereador vêm sem o campo de busca (para ficarem menores)
        for (const c of d.candidatos) if (!c.busca) c.busca = semAcento(`${c.nome} ${c.n} ${c.partido}`);
        cache.set(chave, d);
      }
    } catch (e) {
      aviso(`Não foi possível carregar os dados deste ${cargo === "vereador" ? "município" : "estado"}. Verifique a conexão e tente de novo.`);
      semDados();
      return false;
    }
    aviso("");
    dados = cache.get(chave);
    el.passoTipo.disabled = false;
    mostrarResumoUF();
    el.partido.innerHTML = '<option value="">Escolha o partido…</option>' +
      dados.grupos.flatMap((g) => g.partidos.map((p) => ({ p, g })))
        .sort((a, b) => a.p.localeCompare(b.p, "pt-BR"))
        .map(({ p, g }) => `<option value="${esc(p)}">${esc(p)}${g.id[0] === "F" ? ` (${esc(g.sigla)})` : ""}</option>`).join("");
    el.busca.value = "";
    if (!automatico) mudarTipo();
    return true;
  }

  // Resumo do estado escolhido: vagas, votos válidos, quociente eleitoral e o mínimo
  // individual (10% do quociente) que um candidato precisa para ocupar vaga do partido.
  function mostrarResumoUF() {
    if (!dados) { el.resumoUF.hidden = true; el.resumoUF.innerHTML = ""; return; }
    const qe = Motor.quocienteEleitoral(dados);
    const item = (rotulo, valor, nota) =>
      `<div class="item"><dt>${rotulo}</dt><dd><span class="valor">${valor}</span>${nota ? `<span class="nota">${nota}</span>` : ""}</dd></div>`;
    el.resumoUF.innerHTML =
      `<p class="titulo-resumo">${esc(maiuscula(ondeDe(dados)))}${dados.cargo === "vereador" ? ` (${dados.uf})` : ""}, ${nomeCargo(dados)}, eleição ${esc(dados.ano)}</p><dl>` +
      item("Vagas", fmt.format(dados.vagas)) +
      item("Votos válidos", fmt.format(dados.validos)) +
      item("Quociente eleitoral", `${fmt.format(Math.round(qe))} votos`,
        "votos válidos ÷ vagas: o “preço” aproximado de uma cadeira para o partido ou federação") +
      item("Mínimo individual", `${fmt.format(Math.round(qe * 0.1))} votos`,
        "10% do quociente: o candidato precisa disso para ficar com uma vaga do partido") +
      "</dl>";
    el.resumoUF.hidden = false;
  }

  function tipoAtual() {
    const r = document.querySelector('input[name="tipo"]:checked');
    return r ? r.value : null;
  }

  function marcarTipo(tipo) {
    const r = document.querySelector(`input[name="tipo"][value="${tipo}"]`);
    if (r) r.checked = true;
    el.passoEscolha.hidden = !(tipo === "candidato" || tipo === "legenda");
    el.escCand.hidden = tipo !== "candidato";
    el.escLeg.hidden = tipo !== "legenda";
  }

  function mudarTipo() {
    const tipo = tipoAtual();
    if (!dados || !tipo) { atualizarRota(); return; }
    marcarTipo(tipo);
    el.resultado.hidden = true;
    if (tipo === "branco" || tipo === "nulo") mostrar({ tipo });
    else if (tipo === "legenda" && el.partido.value) mostrar({ tipo, partido: el.partido.value });
    else { atualizarRota(); (tipo === "candidato" ? el.busca : el.partido).focus(); }
  }

  // ---------- links diretos: /UF, /UF/numero, /UF/13 (legenda), /UF/branco, /2022/UF/numero ----------

  // Número da legenda = 2 primeiros dígitos do número dos candidatos do partido.
  function numeroDoPartido(sigla) {
    const c = dados.candidatos.find((c) => c.partido === sigla);
    return c ? c.n.slice(0, 2) : sigla;
  }
  function partidoDoNumero(num) {
    const c = dados.candidatos.find((c) => c.n.slice(0, 2) === num);
    return c ? c.partido : null;
  }

  function lerRota() {
    const q = new URLSearchParams(location.search).get("v");
    const caminho = q != null ? q : decodeURIComponent(location.href.startsWith(BASE.href) ? location.pathname.slice(BASE.pathname.length) : "");
    const partes = caminho.split("/").filter(Boolean);
    if (!partes.length) return null;
    const rota = {};
    if (/^\d{4}$/.test(partes[0])) rota.ano = partes.shift();
    if (/^(estadual|distrital|vereador)$/i.test(partes[0] || "")) rota.cargo = /^vereador$/i.test(partes.shift()) ? "vereador" : "estadual";
    if (!partes.length) return rota;
    rota.uf = partes.shift().toUpperCase();
    // vereador: /2024/vereador/SP/campinas/13133 (ou, mais curto, /SP/campinas/13133)
    if (rota.cargo === "vereador" || (rota.ano && municipal(rota.ano)) || (!rota.cargo && partes.length >= 2)) {
      rota.cargo = "vereador";
      if (partes.length) rota.municipio = partes.shift();
    }
    if (partes.length) rota.voto = partes.shift();
    if (!rota.cargo && /^\d{5}$/.test(rota.voto || "")) rota.cargo = "estadual"; // em eleição geral, só estadual tem 5 dígitos
    return rota;
  }

  async function abrirRota(rota) {
    if (!rota) return;
    const cargo = rota.cargo || "federal";
    const ano = rota.ano || anoMaisRecenteDo(cargo);
    const idx = indiceDo(cargo);
    if (!idx[ano]) { aviso(`Não temos dados de ${NOMES_CARGO[cargo].toLowerCase()} na eleição de ${esc(ano || "")}.`); return; }
    el.ano.value = ano;
    preencherCargos();
    el.cargo.value = cargo;
    preencherUFs();
    atualizarTextosCargo();
    if (!rota.uf) return;
    if (!idx[ano].includes(rota.uf)) { aviso(`Não encontramos o estado “${esc(rota.uf)}”. Use a sigla, como MA ou SP.`); return; }
    el.uf.value = rota.uf;
    if (cargo === "vereador") {
      await preencherMunicipios();
      if (!rota.municipio) { atualizarRota(); return; }
      const alvo = slug(rota.municipio);
      const op = [...el.municipio.options].find((o) => o.value && (o.value.replace("sem:", "") === rota.municipio || slug(o.textContent.replace(" (sem dados)", "")) === alvo));
      if (!op) { aviso(`Não encontramos o município “${esc(rota.municipio)}” ${emUF(rota.uf)}.`); return; }
      el.municipio.value = op.value;
    }
    if (!(await carregarUF({ automatico: true }))) return;
    const v = rota.voto;
    if (!v) { atualizarRota(); return; }
    const naoAchou = (o) => aviso(`Não encontramos ${o} ${ondeDe(dados)} em ${ano}. Escolha abaixo como você votou.`);
    if (/^(branco|nulo)$/i.test(v)) {
      marcarTipo(v.toLowerCase());
      mostrar({ tipo: v.toLowerCase() });
    } else if (/^\d{4,5}$/.test(v)) {
      const c = dados.candidatos.find((c) => c.n === v);
      if (!c) return naoAchou(`candidato com o número ${esc(v)}`);
      marcarTipo("candidato");
      escolherCandidato(c);
    } else {
      const sigla = /^\d{2}$/.test(v) ? partidoDoNumero(v)
        : dados.grupos.flatMap((g) => g.partidos).find((p) => semAcento(p) === semAcento(v));
      if (!sigla) return naoAchou(`o partido ${esc(v)}`);
      marcarTipo("legenda");
      el.partido.value = sigla;
      mostrar({ tipo: "legenda", partido: sigla });
    }
  }

  function rotaAtual(escolha) {
    if (!dados) return "";
    let r = dados.cargo === "vereador"
      ? `${dados.ano}/vereador/${dados.uf}/${slug(dados.municipio)}`
      : (String(dados.ano) !== anoMaisRecenteDo(dados.cargo) ? dados.ano + "/" : "") + (dados.cargo === "estadual" ? "estadual/" : "") + dados.uf;
    if (escolha) {
      if (escolha.tipo === "candidato") r += "/" + escolha.numero;
      else if (escolha.tipo === "legenda") r += "/" + numeroDoPartido(escolha.partido);
      else r += "/" + escolha.tipo;
    }
    return r;
  }

  function atualizarRota(escolha, titulo) {
    const destino = url(rotaAtual(escolha));
    if (destino !== location.href) history.replaceState(null, "", destino);
    document.title = titulo ? `${titulo} · ${MARCA}` : TITULO;
  }

  // ---------- compartilhar ----------

  // Link para compartilhar: a página principal com ?v=UF/numero. No GitHub Pages os
  // caminhos /UF/numero passam pelo 404.html (status 404), e as redes podem não mostrar
  // a prévia; com ?v= a resposta é 200 com a prévia do site.
  function linkCompartilhavel(escolha) {
    return `${BASE.href}?v=${rotaAtual(escolha)}`;
  }

  function listaEleitos(partes) {
    const nomes = partes.slice(0, 3).map((p) => `${p.cand.nome} (${fmtPct(p.frac)})`);
    const resto = partes.length - nomes.length;
    if (resto > 0) return `${nomes.join(", ")} e mais ${resto}`;
    return nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}` : nomes[0];
  }

  function textoCompartilhar(r, escolha) {
    const onde = `${ondeDe(dados)} em ${dados.ano}`;
    if (r.tipo === "branco" || r.tipo === "nulo") {
      return `Votei ${r.tipo === "branco" ? "em branco" : "nulo"} para ${nomeCargo(dados)} ${onde}: meu voto não foi para ninguém. Descubra para onde foi o seu:`;
    }
    const fim = " Descubra para onde foi o seu:";
    const c = r.candidato;
    const eSobra = r.sobra ? `, e ${fmtPct(r.sobra)} foi para a sobra, que não elegeu ninguém` : "";
    if (r.tipo === "legenda") {
      return r.partes.length
        ? `Meu voto na legenda ${escolha.partido} ${onde} ajudou a eleger ${listaEleitos(r.partes)}${eSobra}.${fim}`
        : `Meu voto na legenda ${escolha.partido} ${onde} não ajudou a eleger ninguém: ${r.grupo.id[0] === "F" ? "a federação" : "o partido"} não conquistou vagas.${fim}`;
    }
    const votei = `Votei em ${c.nome} (${c.partido}) ${onde}`;
    if (!r.partes.length) {
      return `${votei}, mas meu voto não ajudou a eleger ninguém: ${r.grupo.id[0] === "F" ? "a federação" : "o partido"} não conquistou vagas.${fim}`;
    }
    const meu = r.partes.find((p) => p.cand === c);
    if (!meu) {
      return `${votei}. ${gen(c, "Ele", "Ela")} não foi ${gen(c, "eleito", "eleita")}, mas meu voto ajudou a eleger ${listaEleitos(r.partes)}${eSobra}.${fim}`;
    }
    if (r.partes.length === 1) {
      return r.sobra
        ? `${votei}: ${gen(c, "ele foi eleito", "ela foi eleita")}, ${fmtPct(meu.frac)} do meu voto ficou com ${gen(c, "ele", "ela")} e ${fmtPct(r.sobra)} foi para a sobra, que não elegeu ninguém.${fim}`
        : `${votei}: ${gen(c, "ele foi eleito", "ela foi eleita")} e todo o meu voto ficou com ${gen(c, "ele", "ela")}.${fim}`;
    }
    const outros = r.partes.filter((p) => p !== meu);
    const nomes = outros.slice(0, 3).map((p) => p.cand.nome);
    const lista = outros.length > 3 ? `${nomes.join(", ")} e mais ${outros.length - 3}`
      : nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}` : nomes[0];
    return r.sobra
      ? `${votei}: ${fmtPct(meu.frac)} do meu voto ficou com ${gen(c, "ele", "ela")}, ${fmtPct(1 - meu.frac - r.sobra)} ajudou a eleger ${lista}; ${fmtPct(r.sobra)} foi para a sobra, que não elegeu ninguém.${fim}`
      : `${votei}: ${fmtPct(meu.frac)} do meu voto ficou com ${gen(c, "ele", "ela")} e o resto ajudou a eleger ${lista}.${fim}`;
  }

  function botoesRedes(texto, link) {
    const t = encodeURIComponent(texto), u = encodeURIComponent(link), tu = encodeURIComponent(`${texto} ${link}`);
    const redes = [
      ["WhatsApp", `https://wa.me/?text=${tu}`],
      ["Telegram", `https://t.me/share/url?url=${u}&text=${t}`],
      ["X", `https://x.com/intent/post?text=${t}&url=${u}`],
      ["Bluesky", `https://bsky.app/intent/compose?text=${tu}`],
      ["Reddit", `https://www.reddit.com/submit?url=${u}&title=${t}`],
    ];
    return redes.map(([nome, href]) => `<a class="rede" href="${esc(href)}" target="_blank" rel="noopener">${nome}</a>`).join("");
  }

  async function copiar(texto, botao, rotulo, avisoOk) {
    try {
      await navigator.clipboard.writeText(texto);
      botao.textContent = avisoOk;
    } catch (e) {
      // Sem acesso à área de transferência: mostra o texto selecionado para copiar à mão.
      const campo = el.resultado.querySelector(".texto-compartilhar");
      campo.hidden = false;
      campo.value = texto;
      campo.focus();
      campo.select();
      botao.textContent = "Copie o texto abaixo";
    }
    setTimeout(() => { botao.textContent = rotulo; }, 3000);
  }

  // ---------- imagem para Instagram (Stories e Feed) ----------

  function specCartao(r, escolha) {
    const g = r.grupo;
    const eFed = g && g.id[0] === "F";
    const spec = {
      kicker: `${maiuscula(nomeCargo(dados, r.candidato))} · ${localDe(dados)} · ${dados.ano}`,
      endereco: BASE.host + BASE.pathname.replace(/\/$/, ""),
      icone: url("img/favicon.svg"),
      partes: r.partes.map((p) => ({ nome: p.cand.nome, detalhe: p.cand.partido, pct: fmtPct(p.frac), frac: p.frac })),
      sobra: r.sobra ? { nome: "Sobra", detalhe: "não elegeu ninguém", pct: fmtPct(r.sobra), frac: r.sobra } : null,
    };
    if (r.tipo === "branco" || r.tipo === "nulo") {
      const qtd = r.tipo === "branco" ? dados.brancos : dados.nulos;
      spec.destaque = r.tipo === "branco" ? "Votei em branco" : "Votei nulo";
      spec.frase = `Meu voto não foi para ninguém: votos ${r.tipo === "branco" ? "em branco" : "nulos"} não vão para nenhum candidato nem partido.`;
      spec.numero = { valor: fmt.format(qtd), rotulo: `eleitores votaram ${r.tipo === "branco" ? "em branco" : "nulo"} ${ondeDe(dados)}.` };
      return spec;
    }
    const c = r.candidato;
    spec.destaque = r.tipo === "candidato" ? `Votei em ${c.nome} (${c.partido})` : `Votei na legenda ${escolha.partido}`;
    if (!r.partes.length) {
      spec.frase = `${eFed ? "A federação" : "O partido"} ${g.sigla} não conquistou vagas ${ondeDe(dados)}, então meu voto não elegeu ninguém.`;
      spec.numero = { valor: fmt.format(r.analise.total), rotulo: `votos ${eFed ? "da federação" : "do partido"}, para um quociente eleitoral de ${fmt.format(Math.round(Motor.quocienteEleitoral(dados)))}.` };
      return spec;
    }
    const meu = c && r.partes.find((p) => p.cand === c);
    if (r.tipo === "legenda") spec.frase = `O voto foi ${eFed ? `para a federação ${g.sigla}` : `para o partido ${g.sigla}`} e ajudou a eleger:`;
    else if (!meu) spec.frase = `${gen(c, "Ele", "Ela")} não foi ${gen(c, "eleito", "eleita")}, mas meu voto ajudou a eleger:`;
    else if (r.partes.length === 1) spec.frase = r.sobra
      ? `${gen(c, "Ele foi eleito", "Ela foi eleita")} com mais votos do que precisava; o que passou foi para a sobra, que não elegeu ninguém:`
      : `${gen(c, "Ele foi eleito", "Ela foi eleita")} e todo o meu voto ficou com ${gen(c, "ele", "ela")}.`;
    else spec.frase = `${fmtPct(meu.frac)} do meu voto ficou com ${gen(c, "ele", "ela")} e o resto ajudou a eleger ${eFed ? "colegas da federação" : "colegas de partido"}${r.sobra ? " ou foi para a sobra" : ""}:`;
    return spec;
  }

  function nomeArquivo(escolha, formato) {
    return `para-onde-foi-meu-voto-${rotaAtual(escolha).replace(/\//g, "-")}-${formato === "story" ? "stories" : "feed"}.png`;
  }

  // As imagens são geradas assim que o resultado aparece: o iPhone só abre o menu de
  // compartilhar logo depois do toque, então não dá para gerar a imagem só no clique.
  function prepararImagens(spec, escolha) {
    const imagens = {};
    for (const formato of ["story", "feed"]) {
      imagens[formato] = Cartao.desenhar(spec, formato)
        .then((blob) => new File([blob], nomeArquivo(escolha, formato), { type: "image/png" }))
        .catch(() => null);
    }
    return imagens;
  }

  async function compartilharImagem(botao, arquivoPromessa, rotulo, link) {
    // Copia o link junto (sem esperar, para não perder o "toque" que libera o menu de
    // compartilhar): no Instagram, a pessoa cola no adesivo "Link" do Stories.
    let copiou = Promise.resolve(false);
    try { copiou = navigator.clipboard.writeText(link).then(() => true, () => false); } catch (e) { /* sem área de transferência */ }
    copiou.then((ok) => {
      const dica = el.resultado.querySelector(".dica-imagem");
      if (dica) {
        dica.textContent = ok ? "Link copiado. No Stories do Instagram, toque no adesivo “Link” e cole."
                              : `No Stories do Instagram, use o adesivo “Link” com o endereço ${link}`;
        dica.hidden = false;
      }
    });
    const arquivo = await arquivoPromessa;
    if (!arquivo) { botao.textContent = "Não foi possível gerar a imagem"; return; }
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      try {
        // Só o arquivo: com texto ou link junto, o Instagram às vezes compartilha só o texto.
        await navigator.share({ files: [arquivo] });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(arquivo);
    a.download = arquivo.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    botao.textContent = "Imagem baixada";
    setTimeout(() => { botao.textContent = rotulo; }, 3000);
  }

  async function compartilhar(botao, dadosCompartilhar) {
    const { titulo, texto, link } = dadosCompartilhar;
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, text: texto, url: link });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return; // a pessoa fechou a janela de compartilhar
      }
    }
    copiar(`${texto} ${link}`, botao, "Compartilhar meu resultado", "Texto e link copiados. É só colar!");
  }

  // ---------- autocompletar ----------
  let opcoesAtuais = [], ativo = -1;

  function buscar() {
    const q = semAcento(el.busca.value.trim());
    if (!q || !dados) { fecharSugestoes(); return; }
    const termos = q.split(/\s+/);
    opcoesAtuais = dados.candidatos.filter((c) => termos.every((t) => c.busca.includes(t))).slice(0, 12);
    ativo = -1;
    if (!opcoesAtuais.length) {
      el.sugestoes.innerHTML = '<li class="vazio">Nenhum candidato encontrado</li>';
    } else {
      el.sugestoes.innerHTML = opcoesAtuais.map((c, i) =>
        `<li role="option" id="op-${i}" data-i="${i}"><span class="n">${esc(c.n)}</span>
          <span class="nome">${esc(c.nome)}</span><span class="part">${esc(c.partido)}</span></li>`).join("");
    }
    el.sugestoes.hidden = false;
    el.busca.setAttribute("aria-expanded", "true");
  }

  function fecharSugestoes() {
    el.sugestoes.hidden = true;
    el.busca.setAttribute("aria-expanded", "false");
    el.busca.removeAttribute("aria-activedescendant");
  }

  function escolherCandidato(c) {
    el.busca.value = `${c.n} · ${c.nome} (${c.partido})`;
    fecharSugestoes();
    mostrar({ tipo: "candidato", numero: c.n });
  }

  function teclaBusca(ev) {
    if (el.sugestoes.hidden || !opcoesAtuais.length) return;
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      ativo = (ativo + (ev.key === "ArrowDown" ? 1 : -1) + opcoesAtuais.length) % opcoesAtuais.length;
      [...el.sugestoes.children].forEach((li, i) => li.classList.toggle("ativo", i === ativo));
      el.busca.setAttribute("aria-activedescendant", `op-${ativo}`);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      escolherCandidato(opcoesAtuais[Math.max(ativo, 0)]);
    } else if (ev.key === "Escape") {
      fecharSugestoes();
    }
  }

  // ---------- resultado ----------
  function mostrar(escolha) {
    const r = Motor.atribuir(dados, escolha);
    const qe = Motor.quocienteEleitoral(dados);
    const nomeUF = localDe(dados);
    let html = "", titulo;

    if (r.tipo === "branco" || r.tipo === "nulo") {
      titulo = r.tipo === "branco" ? `Voto em branco ${ondeDe(dados)}` : `Voto nulo ${ondeDe(dados)}`;
      const qtd = r.tipo === "branco" ? dados.brancos : dados.nulos;
      const qeSem = dados.validos / dados.vagas;
      const qeCom = (dados.validos + dados.brancos + dados.nulos) / dados.vagas;
      html = `
        <p class="kicker">${maiuscula(nomeCargo(dados))} · ${nomeUF} · ${dados.ano}</p>
        <h2>Seu voto não ajudou a eleger ninguém</h2>
        <p class="grande">Votos ${r.tipo === "branco" ? "em branco" : "nulos"} não vão para nenhum candidato nem partido.
          ${maiuscula(ondeDe(dados))}, <strong>${fmt.format(qtd)}</strong> eleitores votaram ${r.tipo === "branco" ? "em branco" : "nulo"} para ${nomeCargo(dados)}.</p>
        <div class="numeros">
          ${numero("Votos válidos", fmt.format(dados.validos))}
          ${numero("Brancos", fmt.format(dados.brancos))}
          ${numero("Nulos", fmt.format(dados.nulos))}
          ${numero("Vagas", dados.vagas)}
        </div>
        <p>O único efeito é indireto: como brancos e nulos ficam fora dos votos válidos, o quociente eleitoral fica menor.
          Ele foi de <strong>${fmt.format(Math.round(qeSem))}</strong> votos por vaga; se brancos e nulos contassem,
          seria ${fmt.format(Math.round(qeCom))}. Isso não favorece nenhum partido específico —
          só deixa cada voto válido um pouco mais pesado.</p>
        <p class="mito"><strong>Mito:</strong> “se a maioria votar nulo, a eleição é anulada”. Não é verdade —
          a anulação prevista em lei é para votos anulados pela Justiça Eleitoral (por fraude, por exemplo), não para o voto nulo do eleitor.</p>`;
    } else {
      const g = r.grupo, a = r.analise;
      titulo = r.tipo === "candidato" ? `${r.candidato.nome} (${r.candidato.n})` : `Legenda ${escolha.partido}`;
      const cabecalho = r.tipo === "candidato"
        ? `${esc(r.candidato.nome)} <span class="sub">${esc(r.candidato.n)} · ${esc(r.candidato.partido)}</span>`
        : `Legenda ${esc(escolha.partido)} <span class="sub">${esc(numeroDoPartido(escolha.partido))}</span>`;
      const eFed = g.id[0] === "F";
      const desc = eFed ? `federação ${esc(g.sigla)} (${g.partidos.map(esc).join(", ")})` : `partido ${esc(g.sigla)}`;
      const nomeGrupo = { de: (eFed ? "da " : "do ") + desc, para: (eFed ? "para a " : "para o ") + desc };

      html = `<p class="kicker">${maiuscula(nomeCargo(dados, r.candidato))} · ${nomeUF} · ${dados.ano}</p><h2>${cabecalho}</h2>`;

      if (!r.partes.length) {
        const inicio = r.tipo === "candidato"
          ? `${esc(r.candidato.nome)} não foi ${gen(r.candidato, "eleito", "eleita")}. Seu voto contou ${nomeGrupo.para}`
          : `Seu voto foi ${nomeGrupo.para}`;
        html += `
          <p class="grande">${inicio}, que <strong>não elegeu ninguém</strong> ${ondeDe(dados)}.</p>
          <p>${eFed ? "A federação" : "O partido"} teve ${fmt.format(a.total)} votos, contra um quociente eleitoral de
            ${fmt.format(Math.round(qe))}. O voto foi válido e contou para o total ${eFed ? "da federação" : "do partido"}, mas não se converteu em cadeira.</p>`;
      } else {
        html += `<p class="grande">${frase(r, nomeGrupo)}</p>`;
        html += barra(r.partes, r.sobra);
        html += `<ol class="lista">${r.partes.map((p, i) => `
          <li><span class="cor" style="--i:${i}"></span>
            <span class="nome">${esc(p.cand.nome)} <span class="sub">${esc(p.cand.partido)} · ${fmt.format(p.cand.v)} votos</span></span>
            <span class="pct">${fmtPct(p.frac)}</span></li>`).join("")}${r.sobra ? `
          <li class="item-sobra"><span class="cor sobra"></span>
            <span class="nome">Sobra ${nomeGrupo.de} <span class="sub">não elegeu ninguém</span></span>
            <span class="pct">${fmtPct(r.sobra)}</span></li>` : ""}</ol>`;
        if (a.sobra > 0.5) html += explicacaoSobra(a, eFed, qe);
      }

      html += `
        <div class="numeros">
          ${numero("Quociente eleitoral", fmt.format(Math.round(qe)), "votos válidos ÷ vagas")}
          ${numero(eFed ? "Votos da federação" : "Votos do partido", fmt.format(a.total),
                   `${fmt.format(g.nominais)} nominais + ${fmt.format(g.legenda)} de legenda`)}
          ${numero("Vagas conquistadas", `${g.vagas} de ${dados.vagas}`)}
          ${a.custo ? numero("Custo de cada vaga", fmt.format(Math.round(a.custo)),
                   a.custo < qe - 0.5 ? `${eFed ? "votos da federação" : "votos do partido"} ÷ vagas (abaixo do quociente: vaga nas sobras)` : "o quociente eleitoral") : ""}
          ${a.eleitos.length && a.sobra > 0.5 ? numero("Sobra", fmt.format(Math.round(a.sobra)),
                   `${fmtPct(a.sobra / a.total)} dos votos ${eFed ? "da federação" : "do partido"}: não elegeram ninguém`) : ""}
        </div>
        ${a.eleitos.length ? tabelaEleitos(a, r.candidato) : ""}`;
    }

    const share = { titulo: `${titulo} · ${MARCA}`, texto: textoCompartilhar(r, escolha), link: linkCompartilhavel(escolha) };
    html += `
      <div class="compartilhar">
        <button type="button" class="botao-compartilhar">Compartilhar meu resultado</button>
        <div class="redes" aria-label="Compartilhar em">${botoesRedes(share.texto, share.link)}
          <button type="button" class="rede botao-copiar-link">Copiar link</button></div>
        <textarea class="texto-compartilhar" rows="3" readonly aria-label="Texto para compartilhar" hidden></textarea>
        <div class="imagens">
          <span class="rotulo-imagens">Imagem para Instagram e outras redes</span>
          <div class="redes">
            <button type="button" class="rede botao-imagem" data-formato="story">Stories (vertical)</button>
            <button type="button" class="rede botao-imagem" data-formato="feed">Feed (quadrada)</button>
          </div>
          <p class="dica-imagem" role="status" hidden></p>
        </div>
      </div>`;

    el.resultado.innerHTML = html;
    el.resultado.hidden = false;
    atualizarRota(escolha, titulo);
    el.resultado.querySelector(".botao-compartilhar").addEventListener("click", (ev) => compartilhar(ev.currentTarget, share));
    el.resultado.querySelector(".botao-copiar-link").addEventListener("click", (ev) =>
      copiar(share.link, ev.currentTarget, "Copiar link", "Link copiado"));
    if (window.Cartao) {
      const imagens = prepararImagens(specCartao(r, escolha), escolha);
      el.resultado.querySelectorAll(".botao-imagem").forEach((b) => {
        const rotulo = b.textContent;
        b.addEventListener("click", () => compartilharImagem(b, imagens[b.dataset.formato], rotulo, share.link));
      });
    } else {
      el.resultado.querySelector(".imagens").hidden = true;
    }
    el.resultado.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function frase(r, nomeGrupo) {
    const c = r.candidato, partes = r.partes, n = partes.length, s = r.sobra;
    const meu = c && partes.find((p) => p.cand === c);
    const outros = partes.filter((p) => p !== meu).map((p) => p.cand);
    const foiEleito = gen(c, "Seu candidato foi eleito", "Sua candidata foi eleita");
    if (meu && n === 1) {
      if (!s) {
        return `${foiEleito} e <strong>todo o seu voto</strong> ficou com ${gen(c, "ele", "ela")}: ` +
          `os votos que ${gen(c, "ele", "ela")} recebeu não chegaram a cobrir sozinhos o “custo” de uma vaga.`;
      }
      return `${foiEleito} com mais votos do que precisava. <strong>${fmtPct(meu.frac)}</strong> do seu voto ficou com ${gen(c, "ele", "ela")}; ` +
        `<strong>${fmtPct(s)}</strong> foi para a sobra ${nomeGrupo.de}, que não elegeu ninguém.`;
    }
    if (meu) {
      const colegas = outros.length === 1
        ? gen(outros[0], "mais um colega", "mais uma colega")
        : todasMulheres(outros) ? `outras ${outros.length} colegas` : `outros ${outros.length} colegas`;
      return `${foiEleito} com mais votos do que precisava. <strong>${fmtPct(meu.frac)}</strong> do seu voto ficou com ${gen(c, "ele", "ela")}; ` +
        (s ? `${fmtPct(1 - meu.frac - s)} ajudou a eleger ${colegas} ${nomeGrupo.de} e <strong>${fmtPct(s)}</strong> foi para a sobra, que não elegeu ninguém.`
           : `o restante ajudou a eleger ${colegas} ${nomeGrupo.de}.`);
    }
    const inicio = c ? (c.eleito ? "" : `${esc(c.nome)} não foi ${gen(c, "eleito", "eleita")}, mas o voto não se perdeu: contou ${nomeGrupo.para}. `)
                     : `Seu voto de legenda foi ${nomeGrupo.para}. `;
    const eleitos = partes.map((p) => p.cand);
    return inicio + (n === 1
      ? `Ele ajudou a eleger <strong>${esc(partes[0].cand.nome)}</strong>.`
      : `Ele foi repartido entre <strong>${n} ${todasMulheres(eleitos) ? (dados.cargo === "vereador" ? "vereadoras eleitas" : "deputadas eleitas") : (dados.cargo === "vereador" ? "vereadores eleitos" : "deputados eleitos")}</strong> que precisavam de votos além dos próprios.`) +
      (s ? ` Desse voto, <strong>${fmtPct(s)}</strong> foi para a sobra ${nomeGrupo.de} e não elegeu ninguém.` : "");
  }

  // Por que o partido teve sobra (e, no caso extremo, por que ficou com menos vagas
  // do que o quociente permitia).
  function explicacaoSobra(a, eFed, qe) {
    const quem = eFed ? "A federação" : "O partido", k = a.eleitos.length;
    let t = `${quem} teve ${fmt.format(a.total)} votos e usou ${fmt.format(Math.round(a.custo * k))} ${k === 1 ? "na vaga conquistada" : `nas ${k} vagas conquistadas`}. ` +
      `Os outros ${fmt.format(Math.round(a.sobra))} votos são a sobra: disputaram as últimas vagas, mas não alcançaram mais uma cadeira.`;
    if (a.vagasPeloQuociente > k) {
      t += ` Pelo quociente, ${eFed ? "a federação" : "o partido"} tinha votos para ${a.vagasPeloQuociente} vagas, mas ficou com ${k}: ` +
        `os outros candidatos não chegaram a 10% do quociente (${fmt.format(Math.round(qe * 0.1))} votos), o mínimo para ocupar uma vaga.`;
    }
    return `<p class="nota-sobra">${t}</p>`;
  }

  function barra(partes, sobra) {
    return `<div class="barra" role="img" aria-label="Divisão do seu voto">${partes.map((p, i) =>
      `<span style="--i:${i};flex-grow:${p.frac}" title="${esc(p.cand.nome)}: ${fmtPct(p.frac)}"></span>`).join("")}${sobra
      ? `<span class="sobra" style="flex-grow:${sobra}" title="Sobra, não elegeu ninguém: ${fmtPct(sobra)}"></span>` : ""}</div>`;
  }

  function numero(rotulo, valor, nota) {
    return `<div class="num-card"><span class="rot">${rotulo}</span><span class="val">${valor}</span>${nota ? `<span class="nota">${nota}</span>` : ""}</div>`;
  }

  function tabelaEleitos(a, cand) {
    const linhas = a.eleitos.slice().sort((x, y) => y.cand.v - x.cand.v).map((e) => {
      const situacao = e.excedente > 0.5 ? `teve ${fmt.format(Math.round(e.excedente))} votos além do custo da vaga`
                     : e.deficit > 0.5 ? `precisou de ${fmt.format(Math.round(e.deficit))} votos de colegas e legenda`
                     : "usou só os próprios votos";
      return `<tr${e.cand === cand ? ' class="seu"' : ""}><td>${esc(e.cand.nome)}</td><td>${esc(e.cand.partido)}</td>
        <td class="r">${fmt.format(e.cand.v)}</td><td>${situacao}</td></tr>`;
    }).join("");
    return `<details class="eleitos"><summary>Todos os eleitos de ${esc(a.grupo.sigla)} ${ondeDe(dados)}</summary>
      <div class="tabela"><table><thead><tr><th>Eleito(a)</th><th>Partido</th><th class="r">Votos próprios</th><th>No modelo</th></tr></thead>
      <tbody>${linhas}</tbody></table></div></details>`;
  }

  // ---------- eventos ----------
  const recarregar = async () => { await preencherMunicipios(); carregarUF(); };
  el.ano.addEventListener("change", () => { preencherCargos(); preencherUFs(); recarregar(); });
  el.cargo.addEventListener("change", () => { preencherUFs(); recarregar(); });
  el.uf.addEventListener("change", () => { el.municipio.value = ""; recarregar(); });
  el.municipio.addEventListener("change", () => carregarUF());
  document.querySelectorAll('input[name="tipo"]').forEach((r) => r.addEventListener("change", mudarTipo));
  el.partido.addEventListener("change", () => el.partido.value && mostrar({ tipo: "legenda", partido: el.partido.value }));
  el.busca.addEventListener("input", buscar);
  el.busca.addEventListener("keydown", teclaBusca);
  el.busca.addEventListener("blur", () => setTimeout(fecharSugestoes, 150));
  el.sugestoes.addEventListener("mousedown", (ev) => {
    const li = ev.target.closest("li[data-i]");
    if (li) { ev.preventDefault(); escolherCandidato(opcoesAtuais[+li.dataset.i]); }
  });

  iniciar();
})();
