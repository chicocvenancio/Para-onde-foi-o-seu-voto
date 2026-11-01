// Teste do motor com um estado FICTÍCIO (números inventados só para o teste).
// Rode com: node --test tests/
const test = require("node:test");
const assert = require("node:assert");
const Motor = require("../engine.js");

const cand = (n, nome, g, v, eleito) => ({ n, nome, partido: g.slice(1), g, v, eleito });
const dados = {
  vagas: 3, validos: 1000, brancos: 50, nulos: 80,
  grupos: [
    { id: "PA", sigla: "A", partidos: ["A"], nominais: 600, legenda: 100, vagas: 2 },
    { id: "PB", sigla: "B", partidos: ["B"], nominais: 260, legenda: 40, vagas: 1 },
  ],
  candidatos: [
    cand("101", "Puxador", "PA", 500, true),  // custo = 350 -> excedente 150
    cand("102", "Carona", "PA", 60, true),    // déficit 290
    cand("103", "Perdedor A", "PA", 40, false),
    cand("201", "Eleito B", "PB", 200, true), // custo 300 -> déficit 100
    cand("202", "Perdedor B", "PB", 60, false),
  ],
};

const mapa = (r) => Object.fromEntries(r.partes.map((p) => [p.cand.nome, p.frac]));
const soma = (r) => r.partes.reduce((s, p) => s + p.frac, 0);

test("puxador: 70% fica com ele, 30% vai para o carona", () => {
  const r = Motor.atribuir(dados, { tipo: "candidato", numero: "101" });
  const m = mapa(r);
  assert.ok(Math.abs(m["Puxador"] - 350 / 500) < 1e-9);
  assert.ok(Math.abs(m["Carona"] - 150 / 500) < 1e-9);
  assert.ok(Math.abs(soma(r) - 1) < 1e-9);
});

test("eleito abaixo do custo fica com 100% do voto", () => {
  const r = Motor.atribuir(dados, { tipo: "candidato", numero: "102" });
  assert.deepStrictEqual(mapa(r), { Carona: 1 });
});

test("não eleito e legenda vão para quem tem déficit", () => {
  for (const escolha of [{ tipo: "candidato", numero: "103" }, { tipo: "legenda", partido: "A" }]) {
    assert.deepStrictEqual(mapa(Motor.atribuir(dados, escolha)), { Carona: 1 });
  }
});

test("cada eleito soma exatamente o custo", () => {
  const a = Motor.analisarGrupo(dados, "PA");
  const recebido = new Map();
  for (const c of dados.candidatos.filter((c) => c.g === "PA")) {
    for (const p of Motor.atribuir(dados, { tipo: "candidato", numero: c.n }).partes) {
      recebido.set(p.cand.nome, (recebido.get(p.cand.nome) || 0) + p.frac * c.v);
    }
  }
  for (const p of Motor.atribuir(dados, { tipo: "legenda", partido: "A" }).partes) {
    recebido.set(p.cand.nome, recebido.get(p.cand.nome) + p.frac * 100);
  }
  for (const v of recebido.values()) assert.ok(Math.abs(v - a.custo) < 1e-6);
});

test("branco e nulo não vão para ninguém", () => {
  assert.strictEqual(Motor.atribuir(dados, { tipo: "branco" }).partes.length, 0);
  assert.strictEqual(Motor.atribuir(dados, { tipo: "nulo" }).partes.length, 0);
});

test("partido sem eleitos: voto não elege ninguém", () => {
  const d = structuredClone(dados);
  d.candidatos.find((c) => c.n === "201").eleito = false;
  const r = Motor.atribuir(d, { tipo: "candidato", numero: "202" });
  assert.strictEqual(r.partes.length, 0);
});
