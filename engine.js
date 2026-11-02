/*
 * Motor de atribuição: "para quem foi o meu voto?"
 *
 * No sistema proporcional de lista aberta, o voto (nominal ou de legenda) é
 * somado primeiro ao partido/federação. As vagas são do partido; os eleitos são
 * os mais votados dele. A lei não diz qual eleito "recebeu" cada voto — então
 * usamos um modelo transparente, no espírito da transferência de votos:
 *
 *  1. Cada eleito de um partido "custa" o mesmo: c = o menor entre o quociente
 *     eleitoral (QE) e votos do partido ÷ vagas conquistadas. Quem ganhou vaga
 *     nas sobras pagou menos que o QE; quem teve votos de sobra não paga mais
 *     que o QE por cadeira.
 *  2. O eleito usa primeiro os votos que recebeu diretamente, até o limite c.
 *  3. O resto — excedente de quem passou de c, votos de candidatos não eleitos e
 *     votos de legenda — completa a parte que falta aos eleitos que ficaram
 *     abaixo de c, na proporção do que falta a cada um.
 *  4. O que ainda sobra depois disso é a "sobra" do partido: votos que
 *     disputaram as últimas vagas e não elegeram ninguém. Cada voto do resto
 *     contribui para a sobra na mesma proporção.
 *
 * Assim cada eleito soma exatamente c votos, e eleitos + sobra = votos do partido.
 */
(function (global) {
  "use strict";

  function quocienteEleitoral(dados) {
    return dados.vagas ? dados.validos / dados.vagas : 0;
  }

  function analisarGrupo(dados, grupoId) {
    const grupo = dados.grupos.find((g) => g.id === grupoId);
    const membros = dados.candidatos.filter((c) => c.g === grupoId);
    const total = grupo.nominais + grupo.legenda;
    const qe = quocienteEleitoral(dados);
    const eleitos = membros.filter((c) => c.eleito);
    const k = eleitos.length;
    const vagasPeloQuociente = qe ? Math.floor(total / qe) : 0;
    if (k === 0 || total === 0) {
      return { grupo, total, qe, custo: 0, eleitos: [], deficitTotal: 0, resto: total, sobra: total, vagasPeloQuociente };
    }
    const custo = qe ? Math.min(qe, total / k) : total / k;
    const lista = eleitos.map((c) => {
      const proprio = Math.min(c.v, custo);
      return { cand: c, proprio, deficit: custo - proprio, excedente: Math.max(c.v - custo, 0) };
    });
    const deficitTotal = lista.reduce((s, e) => s + e.deficit, 0);
    // "resto": tudo o que não é voto próprio usado pelo eleito (excedentes, não eleitos, legenda)
    const resto = total - lista.reduce((s, e) => s + e.proprio, 0);
    const sobra = Math.max(0, resto - deficitTotal);
    return { grupo, total, qe, custo, eleitos: lista, deficitTotal, resto, sobra, vagasPeloQuociente };
  }

  // Reparte "peso" do resto: parte completa os eleitos com déficit, parte vai para a sobra.
  function repartir(analise, peso, destino) {
    if (peso <= 0 || analise.resto <= 0) return 0;
    for (const e of analise.eleitos) {
      if (e.deficit > 0) destino.set(e.cand, (destino.get(e.cand) || 0) + (peso * e.deficit) / analise.resto);
    }
    return (peso * analise.sobra) / analise.resto;
  }

  /**
   * escolha: { tipo: "candidato", numero } | { tipo: "legenda", partido }
   *        | { tipo: "branco" } | { tipo: "nulo" }
   * Retorna { tipo, grupo, analise, partes: [{cand, frac}], sobra, candidato? }
   * (soma das partes + sobra = 1 quando o partido elegeu alguém)
   */
  function atribuir(dados, escolha) {
    if (escolha.tipo === "branco" || escolha.tipo === "nulo") {
      return { tipo: escolha.tipo, partes: [], sobra: 0 };
    }

    let grupoId, candidato = null;
    if (escolha.tipo === "candidato") {
      candidato = dados.candidatos.find((c) => c.n === String(escolha.numero));
      if (!candidato) throw new Error("Candidato não encontrado: " + escolha.numero);
      grupoId = candidato.g;
    } else if (escolha.tipo === "legenda") {
      const grupo = dados.grupos.find((g) => g.partidos.includes(escolha.partido));
      if (!grupo) throw new Error("Partido não encontrado: " + escolha.partido);
      grupoId = grupo.id;
    } else {
      throw new Error("Tipo de voto inválido: " + escolha.tipo);
    }

    const analise = analisarGrupo(dados, grupoId);
    const destino = new Map();
    let sobra = 0;

    if (analise.eleitos.length > 0) {
      const meu = candidato && analise.eleitos.find((e) => e.cand === candidato);
      if (meu) {
        const fica = meu.cand.v > 0 ? meu.proprio / meu.cand.v : 1;
        destino.set(meu.cand, fica);
        sobra = repartir(analise, 1 - fica, destino);
      } else {
        sobra = repartir(analise, 1, destino);
      }
    }

    const partes = [...destino.entries()]
      .map(([cand, frac]) => ({ cand, frac }))
      .filter((p) => p.frac > 1e-12)
      .sort((a, b) => b.frac - a.frac);

    return { tipo: escolha.tipo, grupo: analise.grupo, analise, partes, sobra: sobra > 1e-12 ? sobra : 0, candidato };
  }

  const api = { atribuir, analisarGrupo, quocienteEleitoral };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Motor = api;
})(typeof window !== "undefined" ? window : globalThis);
