// Testes do motor. Rode com: node --test tests/*.test.js
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const Motor = require("../engine.js");

const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`);

// Estado FICTÍCIO (números inventados só para o teste): 1.000 votos válidos, 3 vagas,
// quociente eleitoral = 333,33.
//  - Partido A: 700 votos (2,1 quocientes), 2 vagas -> custo 333,33 por vaga e 33,33 de sobra.
//  - Partido B: 300 votos (0,9 quociente), 1 vaga nas sobras -> custo 300, sem sobra.
const cand = (n, nome, g, v, eleito) => ({ n, nome, partido: g.slice(1), g, v, eleito });
const dados = {
  vagas: 3, validos: 1000, brancos: 50, nulos: 80,
  grupos: [
    { id: "PA", sigla: "A", partidos: ["A"], nominais: 600, legenda: 100, vagas: 2 },
    { id: "PB", sigla: "B", partidos: ["B"], nominais: 260, legenda: 40, vagas: 1 },
  ],
  candidatos: [
    cand("101", "Puxador", "PA", 500, true),  // passa do custo em 166,67
    cand("102", "Carona", "PA", 60, true),    // falta 273,33
    cand("103", "Perdedor A", "PA", 40, false),
    cand("201", "Eleito B", "PB", 200, true), // falta 100
    cand("202", "Perdedor B", "PB", 60, false),
  ],
};
const QE = 1000 / 3;
const RESTO_A = 700 - (QE + 60);           // excedente + não eleito + legenda
const SOBRA_A = 700 - 2 * QE;

const mapa = (r) => Object.fromEntries(r.partes.map((p) => [p.cand.nome, p.frac]));
const soma = (r) => r.partes.reduce((s, p) => s + p.frac, 0) + r.sobra;

test("custo da vaga é o menor entre o quociente e votos ÷ vagas", () => {
  perto(Motor.analisarGrupo(dados, "PA").custo, QE, "partido A");
  perto(Motor.analisarGrupo(dados, "PB").custo, 300, "partido B (vaga nas sobras)");
  perto(Motor.analisarGrupo(dados, "PA").sobra, SOBRA_A, "sobra do partido A");
  perto(Motor.analisarGrupo(dados, "PB").sobra, 0, "sobra do partido B");
});

test("puxador: fica com o custo; o excedente vai para o carona e para a sobra", () => {
  const r = Motor.atribuir(dados, { tipo: "candidato", numero: "101" });
  const m = mapa(r), resto = 1 - QE / 500;
  perto(m["Puxador"], QE / 500, "puxador");
  perto(m["Carona"], resto * (QE - 60) / RESTO_A, "carona");
  perto(r.sobra, resto * SOBRA_A / RESTO_A, "sobra");
  perto(soma(r), 1, "total");
});

test("eleito abaixo do custo fica com 100% do voto, sem sobra", () => {
  const r = Motor.atribuir(dados, { tipo: "candidato", numero: "102" });
  assert.deepStrictEqual(mapa(r), { Carona: 1 });
  assert.strictEqual(r.sobra, 0);
});

test("não eleito e legenda completam o carona e o resto vai para a sobra", () => {
  for (const escolha of [{ tipo: "candidato", numero: "103" }, { tipo: "legenda", partido: "A" }]) {
    const r = Motor.atribuir(dados, escolha);
    perto(mapa(r)["Carona"], (QE - 60) / RESTO_A, "carona");
    perto(r.sobra, SOBRA_A / RESTO_A, "sobra");
    perto(soma(r), 1, "total");
  }
});

test("partido com vaga nas sobras não tem sobra", () => {
  const r = Motor.atribuir(dados, { tipo: "candidato", numero: "202" });
  assert.deepStrictEqual(mapa(r), { "Eleito B": 1 });
  assert.strictEqual(r.sobra, 0);
});

test("cada eleito soma exatamente o custo e eleitos + sobra = votos do partido", () => {
  for (const [g, legenda] of [["PA", 100], ["PB", 40]]) {
    const a = Motor.analisarGrupo(dados, g);
    const recebido = new Map();
    let sobra = 0;
    const somar = (r, votos) => {
      for (const p of r.partes) recebido.set(p.cand.nome, (recebido.get(p.cand.nome) || 0) + p.frac * votos);
      sobra += r.sobra * votos;
    };
    for (const c of dados.candidatos.filter((c) => c.g === g)) somar(Motor.atribuir(dados, { tipo: "candidato", numero: c.n }), c.v);
    somar(Motor.atribuir(dados, { tipo: "legenda", partido: g.slice(1) }), legenda);
    for (const [nome, v] of recebido) perto(v, a.custo, `${g} ${nome}`);
    perto(sobra, a.sobra, `${g} sobra`);
    perto([...recebido.values()].reduce((s, v) => s + v, 0) + sobra, a.total, `${g} total`);
  }
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

// Casos reais citados num comentário no Reddit (dados do TSE no repositório).
const real = (ano, uf) => require(path.join(__dirname, "..", "data", ano, `${uf}.json`));

test("Jones Manoel (PE 2026): eleito sozinho com votos além do quociente -> parte vai para a sobra", () => {
  const r = Motor.atribuir(real("2026", "PE"), { tipo: "candidato", numero: "5050" });
  assert.strictEqual(r.partes.length, 1);
  assert.strictEqual(r.partes[0].cand.nome, "Jones Manoel");
  assert.ok(r.partes[0].frac > 0.84 && r.partes[0].frac < 0.85, `Jones ${r.partes[0].frac}`);
  assert.ok(r.sobra > 0.15 && r.sobra < 0.16, `sobra ${r.sobra}`);
});

test("PSOL/REDE SP 2026: votos para 9 vagas pelo quociente, mas só 6 eleitos", () => {
  const d = real("2026", "SP");
  const g = d.grupos.find((g) => g.partidos.includes("PSOL"));
  const a = Motor.analisarGrupo(d, g.id);
  assert.strictEqual(a.vagasPeloQuociente, 9);
  assert.strictEqual(a.eleitos.length, 6);
  const r = Motor.atribuir(d, { tipo: "legenda", partido: "PSOL" });
  assert.ok(r.sobra > 0.5, `sobra da legenda ${r.sobra}`);
  perto(soma(r), 1, "total");
});

test("sem sobra, o resultado não muda (Creuzamar, MA 2026)", () => {
  const r = Motor.atribuir(real("2026", "MA"), { tipo: "candidato", numero: "1301" });
  assert.strictEqual(r.sobra, 0);
  assert.deepStrictEqual(r.partes.map((p) => [p.cand.nome, Math.round(p.frac * 1000)]), [["Márcio Jerry", 622], ["Rubens Pereira Jr", 378]]);
});
