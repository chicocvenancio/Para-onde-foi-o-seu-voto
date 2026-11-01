/*
 * Motor de atribuição: "para quem foi o meu voto?"
 *
 * No sistema proporcional de lista aberta, o voto (nominal ou de legenda) é
 * somado primeiro ao partido/federação. As vagas são do partido; os eleitos são
 * os mais votados dele. A lei não diz qual eleito "recebeu" cada voto — então
 * usamos um modelo transparente, no espírito da transferência de votos:
 *
 *  1. Cada eleito de um partido "custa" o mesmo: c = votos do partido / vagas.
 *  2. O eleito usa primeiro os votos que recebeu diretamente, até o limite c.
 *  3. Tudo o que sobra — excedente de quem passou de c, votos de candidatos não
 *     eleitos e votos de legenda — completa a parte que falta aos eleitos que
 *     ficaram abaixo de c, na proporção do que falta a cada um.
 *
 * Assim cada eleito soma exatamente c votos, e todo voto válido de um partido
 * que elegeu alguém é repartido entre os seus eleitos (a soma dá 100%).
 */
(function (global) {
  "use strict";

  function analisarGrupo(dados, grupoId) {
    const grupo = dados.grupos.find((g) => g.id === grupoId);
    const membros = dados.candidatos.filter((c) => c.g === grupoId);
    const total = grupo.nominais + grupo.legenda;
    const eleitos = membros.filter((c) => c.eleito);
    const k = eleitos.length;
    if (k === 0 || total === 0) {
      return { grupo, total, custo: 0, eleitos: [], deficitTotal: 0 };
    }
    const custo = total / k;
    const lista = eleitos.map((c) => {
      const proprio = Math.min(c.v, custo);
      return { cand: c, proprio, deficit: custo - proprio, excedente: Math.max(c.v - custo, 0) };
    });
    const deficitTotal = lista.reduce((s, e) => s + e.deficit, 0);
    return { grupo, total, custo, eleitos: lista, deficitTotal };
  }

  // Reparte "peso" entre os eleitos com déficit, proporcional ao déficit.
  function repartir(analise, peso, destino) {
    if (peso <= 0) return;
    const { eleitos, deficitTotal } = analise;
    if (deficitTotal <= 0) {
      // Caso degenerado (todos exatamente no custo): divide igualmente.
      eleitos.forEach((e) => somar(destino, e.cand, peso / eleitos.length));
      return;
    }
    eleitos.forEach((e) => {
      if (e.deficit > 0) somar(destino, e.cand, (peso * e.deficit) / deficitTotal);
    });
  }

  function somar(destino, cand, frac) {
    destino.set(cand, (destino.get(cand) || 0) + frac);
  }

  /**
   * escolha: { tipo: "candidato", numero } | { tipo: "legenda", partido }
   *        | { tipo: "branco" } | { tipo: "nulo" }
   * Retorna { tipo, grupo, analise, partes: [{cand, frac}], candidato? }
   */
  function atribuir(dados, escolha) {
    if (escolha.tipo === "branco" || escolha.tipo === "nulo") {
      return { tipo: escolha.tipo, partes: [] };
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

    if (analise.eleitos.length > 0) {
      const meu = candidato && analise.eleitos.find((e) => e.cand === candidato);
      if (meu) {
        const fica = meu.cand.v > 0 ? meu.proprio / meu.cand.v : 1;
        somar(destino, meu.cand, fica);
        repartir(analise, 1 - fica, destino);
      } else {
        repartir(analise, 1, destino);
      }
    }

    const partes = [...destino.entries()]
      .map(([cand, frac]) => ({ cand, frac }))
      .filter((p) => p.frac > 1e-12)
      .sort((a, b) => b.frac - a.frac);

    return { tipo: escolha.tipo, grupo: analise.grupo, analise, partes, candidato };
  }

  function quocienteEleitoral(dados) {
    return dados.vagas ? dados.validos / dados.vagas : 0;
  }

  const api = { atribuir, analisarGrupo, quocienteEleitoral };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Motor = api;
})(typeof window !== "undefined" ? window : globalThis);
