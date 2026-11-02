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

  // Concordância: "f" vem do gênero declarado ao TSE.
  const gen = (c, masc, fem) => (c && c.f ? fem : masc);
  const todasMulheres = (lista) => lista.length > 0 && lista.every((c) => c.f);

  // Endereço base do site (a pasta do app.js), para que os links /UF/numero funcionem
  // em qualquer pasta, inclusive no GitHub Pages (/Para-onde-foi-o-seu-voto/).
  const BASE = new URL(".", document.currentScript.src);
  const url = (caminho) => new URL(caminho, BASE).href;

  const $ = (id) => document.getElementById(id);
  const el = {
    uf: $("uf"), ano: $("ano"), passoTipo: $("passo-tipo"), passoEscolha: $("passo-escolha"),
    escCand: $("escolha-candidato"), escLeg: $("escolha-legenda"), busca: $("busca"),
    sugestoes: $("sugestoes"), partido: $("partido"), aviso: $("aviso"), resultado: $("resultado"),
  };
  const TITULO = document.title;

  const fmt = new Intl.NumberFormat("pt-BR");
  const fmtPct = (x) => {
    const p = x * 100;
    const casas = p >= 10 ? 0 : p >= 1 ? 1 : 2;
    return p.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%";
  };
  const semAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let indice = null;
  let dados = null;
  let anoMaisRecente = null;
  const cache = new Map();

  function aviso(msg) {
    el.aviso.hidden = !msg;
    el.aviso.innerHTML = msg || "";
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
    const anos = Object.keys(indice.anos).sort().reverse();
    anoMaisRecente = anos[0];
    el.ano.innerHTML = anos.map((a) => `<option value="${a}">Eleição ${a}</option>`).join("");
    el.ano.hidden = anos.length < 2;
    preencherUFs();
    await abrirRota(lerRota());
  }

  function preencherUFs() {
    const ufs = indice.anos[el.ano.value] || [];
    const atual = el.uf.value;
    el.uf.innerHTML = '<option value="">Escolha o estado…</option>' +
      ufs.slice().sort((a, b) => NOMES_UF[a].localeCompare(NOMES_UF[b], "pt-BR"))
        .map((u) => `<option value="${u}">${NOMES_UF[u]}</option>`).join("");
    if (ufs.includes(atual)) el.uf.value = atual;
  }

  async function carregarUF({ automatico = false } = {}) {
    const uf = el.uf.value, ano = el.ano.value;
    el.resultado.hidden = true;
    if (!uf) { dados = null; el.passoTipo.disabled = true; atualizarRota(); return false; }
    const chave = `${ano}/${uf}`;
    try {
      if (!cache.has(chave)) {
        const r = await fetch(url(`data/${chave}.json`));
        if (!r.ok) throw new Error(r.status);
        cache.set(chave, await r.json());
      }
    } catch (e) {
      aviso("Não foi possível carregar os dados deste estado. Verifique a conexão e tente de novo.");
      return false;
    }
    aviso("");
    dados = cache.get(chave);
    el.passoTipo.disabled = false;
    el.partido.innerHTML = '<option value="">Escolha o partido…</option>' +
      dados.grupos.flatMap((g) => g.partidos.map((p) => ({ p, g })))
        .sort((a, b) => a.p.localeCompare(b.p, "pt-BR"))
        .map(({ p, g }) => `<option value="${esc(p)}">${esc(p)}${g.id[0] === "F" ? ` (${esc(g.sigla)})` : ""}</option>`).join("");
    el.busca.value = "";
    if (!automatico) mudarTipo();
    return true;
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
    if (!partes.length) return rota;
    rota.uf = partes.shift().toUpperCase();
    if (partes.length) rota.voto = partes.shift();
    return rota;
  }

  async function abrirRota(rota) {
    if (!rota) return;
    const ano = rota.ano || anoMaisRecente;
    if (!indice.anos[ano]) { aviso(`Não temos dados da eleição de ${esc(ano)}.`); return; }
    el.ano.value = ano;
    preencherUFs();
    if (!rota.uf) return;
    if (!indice.anos[ano].includes(rota.uf)) { aviso(`Não encontramos o estado “${esc(rota.uf)}”. Use a sigla, como MA ou SP.`); return; }
    el.uf.value = rota.uf;
    if (!(await carregarUF({ automatico: true }))) return;
    const v = rota.voto;
    if (!v) { atualizarRota(); return; }
    const naoAchou = (o) => aviso(`Não encontramos ${o} ${emUF(rota.uf)} em ${ano}. Escolha abaixo como você votou.`);
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
    let r = (el.ano.value !== anoMaisRecente ? el.ano.value + "/" : "") + dados.uf;
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
    document.title = titulo ? `${titulo} · ${TITULO}` : TITULO;
  }

  async function copiarLink(botao) {
    const link = location.href;
    try {
      await navigator.clipboard.writeText(link);
      botao.textContent = "Link copiado";
    } catch (e) {
      const campo = botao.parentElement.querySelector(".link-texto");
      campo.hidden = false;
      campo.select();
      botao.textContent = "Copie o link ao lado";
    }
    setTimeout(() => { botao.textContent = "Copiar link"; }, 2500);
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
    const nomeUF = NOMES_UF[dados.uf];
    let html = "", titulo;

    if (r.tipo === "branco" || r.tipo === "nulo") {
      titulo = r.tipo === "branco" ? `Voto em branco ${emUF(dados.uf)}` : `Voto nulo ${emUF(dados.uf)}`;
      const qtd = r.tipo === "branco" ? dados.brancos : dados.nulos;
      const qeSem = dados.validos / dados.vagas;
      const qeCom = (dados.validos + dados.brancos + dados.nulos) / dados.vagas;
      html = `
        <p class="kicker">${nomeUF} · ${dados.ano}</p>
        <h2>Seu voto não ajudou a eleger ninguém</h2>
        <p class="grande">Votos ${r.tipo === "branco" ? "em branco" : "nulos"} não vão para nenhum candidato nem partido.
          ${maiuscula(emUF(dados.uf))}, <strong>${fmt.format(qtd)}</strong> eleitores votaram ${r.tipo === "branco" ? "em branco" : "nulo"} para deputado federal.</p>
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

      html = `<p class="kicker">${nomeUF} · ${dados.ano} · seu voto</p><h2>${cabecalho}</h2>`;

      if (!r.partes.length) {
        const inicio = r.tipo === "candidato"
          ? `${esc(r.candidato.nome)} não foi ${gen(r.candidato, "eleito", "eleita")}. Seu voto contou ${nomeGrupo.para}`
          : `Seu voto foi ${nomeGrupo.para}`;
        html += `
          <p class="grande">${inicio}, que <strong>não elegeu ninguém</strong> ${emUF(dados.uf)}.</p>
          <p>${eFed ? "A federação" : "O partido"} teve ${fmt.format(a.total)} votos, contra um quociente eleitoral de
            ${fmt.format(Math.round(qe))}. O voto foi válido e contou para o total ${eFed ? "da federação" : "do partido"}, mas não se converteu em cadeira.</p>`;
      } else {
        html += `<p class="grande">${frase(r, nomeGrupo)}</p>`;
        html += barra(r.partes);
        html += `<ol class="lista">${r.partes.map((p, i) => `
          <li><span class="cor" style="--i:${i}"></span>
            <span class="nome">${esc(p.cand.nome)} <span class="sub">${esc(p.cand.partido)} · ${fmt.format(p.cand.v)} votos</span></span>
            <span class="pct">${fmtPct(p.frac)}</span></li>`).join("")}</ol>`;
      }

      html += `
        <div class="numeros">
          ${numero("Quociente eleitoral", fmt.format(Math.round(qe)), "votos válidos ÷ vagas")}
          ${numero(eFed ? "Votos da federação" : "Votos do partido", fmt.format(a.total),
                   `${fmt.format(g.nominais)} nominais + ${fmt.format(g.legenda)} de legenda`)}
          ${numero("Vagas conquistadas", `${g.vagas} de ${dados.vagas}`)}
          ${a.custo ? numero("Votos por vaga conquistada", fmt.format(Math.round(a.custo)), eFed ? "votos da federação ÷ vagas" : "votos do partido ÷ vagas") : ""}
        </div>
        ${a.eleitos.length ? tabelaEleitos(a, r.candidato) : ""}`;
    }

    html += `
      <div class="compartilhar">
        <button type="button" class="botao-link">Copiar link</button>
        <input class="link-texto" type="text" readonly aria-label="Link deste resultado" hidden>
      </div>`;

    el.resultado.innerHTML = html;
    el.resultado.hidden = false;
    atualizarRota(escolha, titulo);
    const campo = el.resultado.querySelector(".link-texto");
    campo.value = location.href;
    el.resultado.querySelector(".botao-link").addEventListener("click", (ev) => copiarLink(ev.currentTarget));
    el.resultado.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function frase(r, nomeGrupo) {
    const c = r.candidato, partes = r.partes, n = partes.length;
    const meu = c && partes.find((p) => p.cand === c);
    const outros = partes.filter((p) => p !== meu).map((p) => p.cand);
    if (meu && n === 1) {
      return `${gen(c, "Seu candidato foi eleito", "Sua candidata foi eleita")} e <strong>todo o seu voto</strong> ficou com ${gen(c, "ele", "ela")}: ` +
        `os votos que ${gen(c, "ele", "ela")} recebeu não chegaram a cobrir sozinhos o “custo” de uma vaga.`;
    }
    if (meu) {
      const colegas = outros.length === 1
        ? gen(outros[0], "mais um colega", "mais uma colega")
        : todasMulheres(outros) ? `outras ${outros.length} colegas` : `outros ${outros.length} colegas`;
      return `${gen(c, "Seu candidato foi eleito", "Sua candidata foi eleita")} com sobra. <strong>${fmtPct(meu.frac)}</strong> do seu voto ficou com ${gen(c, "ele", "ela")}; ` +
        `o restante ajudou a eleger ${colegas} ${nomeGrupo.de}.`;
    }
    const inicio = c ? (c.eleito ? "" : `${esc(c.nome)} não foi ${gen(c, "eleito", "eleita")}, mas o voto não se perdeu: contou ${nomeGrupo.para}. `)
                     : `Seu voto de legenda foi ${nomeGrupo.para}. `;
    const eleitos = partes.map((p) => p.cand);
    return inicio + (n === 1
      ? `Ele ajudou a eleger <strong>${esc(partes[0].cand.nome)}</strong>.`
      : `Ele foi repartido entre <strong>${n} ${todasMulheres(eleitos) ? "deputadas eleitas" : "deputados eleitos"}</strong> que precisavam de votos além dos próprios.`);
  }

  function barra(partes) {
    return `<div class="barra" role="img" aria-label="Divisão do seu voto">${partes.map((p, i) =>
      `<span style="--i:${i};flex-grow:${p.frac}" title="${esc(p.cand.nome)}: ${fmtPct(p.frac)}"></span>`).join("")}</div>`;
  }

  function numero(rotulo, valor, nota) {
    return `<div class="num-card"><span class="rot">${rotulo}</span><span class="val">${valor}</span>${nota ? `<span class="nota">${nota}</span>` : ""}</div>`;
  }

  function tabelaEleitos(a, cand) {
    const linhas = a.eleitos.slice().sort((x, y) => y.cand.v - x.cand.v).map((e) => {
      const situacao = e.excedente > 0 ? `puxou ${fmt.format(Math.round(e.excedente))} votos para colegas`
                                       : `recebeu ${fmt.format(Math.round(e.deficit))} votos de colegas e legenda`;
      return `<tr${e.cand === cand ? ' class="seu"' : ""}><td>${esc(e.cand.nome)}</td><td>${esc(e.cand.partido)}</td>
        <td class="r">${fmt.format(e.cand.v)}</td><td>${situacao}</td></tr>`;
    }).join("");
    return `<details class="eleitos"><summary>Todos os eleitos de ${esc(a.grupo.sigla)} ${emUF(dados.uf)}</summary>
      <div class="tabela"><table><thead><tr><th>Eleito(a)</th><th>Partido</th><th class="r">Votos próprios</th><th>No modelo</th></tr></thead>
      <tbody>${linhas}</tbody></table></div></details>`;
  }

  // ---------- eventos ----------
  el.ano.addEventListener("change", () => { preencherUFs(); carregarUF(); });
  el.uf.addEventListener("change", () => carregarUF());
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
