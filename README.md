# Para onde foi o seu voto?

Site educativo sobre o sistema proporcional da Câmara dos Deputados e das Assembleias Legislativas. O usuário escolhe o estado e como votou
(candidato, legenda, branco ou nulo) e vê quais deputados (federais, estaduais ou distritais) ou vereadores o voto ajudou a eleger, e em que proporção.

**Site:** https://chicocvenancio.github.io/Para-onde-foi-o-seu-voto/

Dados das eleições de 2020, 2022, 2024 e 2026, do Portal de Dados Abertos do TSE.

Privacidade: o cálculo roda no navegador e a página não faz nenhuma requisição a terceiros (sem analytics, cookies ou CDN; as fontes estão em `fonts/`, sob a licença SIL Open Font License).

## Links diretos

Cada resultado tem endereço próprio, que pode ser compartilhado:

- `/MA/1301`: voto no candidato 1301 no Maranhão, na eleição mais recente
- `/2022/SP/5010`: o mesmo para outra eleição
- `/MA/13` ou `/MA/PT`: voto de legenda
- `/MA/branco` e `/MA/nulo`
- `/2024/vereador/SP/campinas/50100` (ou só `/SP/campinas/50100`, que usa a eleição municipal mais recente): vereador
- `/estadual/SP/13133` ou `/2022/estadual/RJ/50`: deputado estadual (distrital no DF); um número de 5 dígitos, como `/SP/13133`, já abre como estadual

Como o GitHub Pages só serve arquivos que existem, o `404.html` redireciona esses caminhos para a página principal,
que abre o resultado e mantém o endereço original na barra do navegador.

## Gerar os dados (TSE)

```bash
python3 scripts/build_data.py 2020 2022 2024 2026
```

Baixa do Portal de Dados Abertos do TSE (`cdn.tse.jus.br`) os arquivos `votacao_candidato_munzona`,
`votacao_partido_munzona`, `detalhe_votacao_munzona` e `consulta_cand` (gênero, para a concordância do texto) e gera `data/<ano>/<UF>.json` (deputado federal), `data/<ano>/estadual/<UF>.json` (estadual e distrital), `data/<ano>/vereador/<UF>/<código do município>.json` (anos de eleição municipal, com
`data/<ano>/vereador/index.json` listando os municípios) e `data/index.json`. Alguns municípios de 2024 têm candidatos
registrados, mas nenhuma votação de vereador nos dados abertos; eles ficam em `semDados` e o site avisa.

## Rodar localmente

```bash
python3 -m http.server 8000
```

## Publicar mudanças no app.js, engine.js ou style.css

```bash
python3 scripts/versionar.py
```

Atualiza o `?v=<hash>` dessas URLs no `index.html`, para o navegador não misturar versões novas e antigas
(o GitHub Pages manda guardar cada arquivo por 10 minutos). O teste `tests/versoes.test.js` falha se isso for esquecido.

## Testes

```bash
node --test tests/*.test.js
```

## Modelo de atribuição (`engine.js`)

Cada eleito de um partido/federação "custa" `votos do partido ÷ vagas`. O eleito usa primeiro os próprios votos
até esse custo; o excedente dos puxadores, os votos de não eleitos e os de legenda completam quem ficou abaixo,
na proporção do que falta a cada um. Brancos e nulos não vão para ninguém.
