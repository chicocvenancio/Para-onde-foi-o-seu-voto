# Para onde foi o seu voto?

Site educativo sobre o sistema proporcional da Câmara dos Deputados. O usuário escolhe o estado e como votou
(candidato, legenda, branco ou nulo) e vê quais deputados federais o voto ajudou a eleger, e em que proporção.

**Site:** https://chicocvenancio.github.io/Para-onde-foi-o-seu-voto/

Dados das eleições de 2022 e 2026, do Portal de Dados Abertos do TSE.

## Gerar os dados (TSE)

```bash
python3 scripts/build_data.py 2022 2026
```

Baixa do Portal de Dados Abertos do TSE (`cdn.tse.jus.br`) os arquivos `votacao_candidato_munzona`,
`votacao_partido_munzona` e `detalhe_votacao_munzona` e gera `data/<ano>/<UF>.json` + `data/index.json`.

## Rodar localmente

```bash
python3 -m http.server 8000
```

## Testes

```bash
node --test tests/engine.test.js
```

## Modelo de atribuição (`engine.js`)

Cada eleito de um partido/federação "custa" `votos do partido ÷ vagas`. O eleito usa primeiro os próprios votos
até esse custo; o excedente dos puxadores, os votos de não eleitos e os de legenda completam quem ficou abaixo,
na proporção do que falta a cada um. Brancos e nulos não vão para ninguém.
