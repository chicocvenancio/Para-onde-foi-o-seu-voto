#!/usr/bin/env python3
"""Atualiza o ?v=<hash> de app.js, engine.js e style.css no index.html.

O GitHub Pages manda o navegador guardar cada arquivo por 10 minutos. Com o hash do
conteúdo na URL, um index.html novo sempre carrega os scripts e o CSS novos, sem
misturar versões. Rode antes de cada commit que mude esses arquivos:

    python3 scripts/versionar.py

(tests/versoes.test.js falha se os hashes estiverem desatualizados.)
"""
import hashlib
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARQUIVOS = ("app.js", "engine.js", "style.css")


def versao(nome: str) -> str:
    return hashlib.sha256((RAIZ / nome).read_bytes()).hexdigest()[:10]


def main():
    caminho = RAIZ / "index.html"
    html = caminho.read_text(encoding="utf-8")
    for nome in ARQUIVOS:
        padrao = re.compile(r'((?:src|href)=")' + re.escape(nome) + r'(?:\?v=[0-9a-f]*)?(")')
        html, n = padrao.subn(lambda m: f"{m.group(1)}{nome}?v={versao(nome)}{m.group(2)}", html)
        if n != 1:
            raise SystemExit(f"esperava 1 referência a {nome} no index.html, achei {n}")
    caminho.write_text(html, encoding="utf-8")
    print("index.html:", ", ".join(f"{n}?v={versao(n)}" for n in ARQUIVOS))


if __name__ == "__main__":
    main()
