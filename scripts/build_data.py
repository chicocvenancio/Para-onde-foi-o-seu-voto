#!/usr/bin/env python3
"""Gera data/<ano>/<UF>.json a partir dos dados abertos do TSE (Deputado Federal).

Uso:
    python3 scripts/build_data.py 2022 [2026 ...]

Baixa (e guarda em cache em scripts/.cache/) três arquivos do Portal de Dados
Abertos do TSE para cada ano:
  - votacao_candidato_munzona_<ano>.zip  -> votos nominais e situação de cada candidato
  - votacao_partido_munzona_<ano>.zip    -> votos de legenda de cada partido
  - detalhe_votacao_munzona_<ano>.zip    -> brancos, nulos, comparecimento
  - consulta_cand_<ano>.zip              -> gênero declarado (concordância no texto)

Os arquivos são somados por UF (todas as zonas/municípios) e reduzidos a um JSON
pequeno por estado, que é o que o site lê.
"""
import csv
import io
import json
import sys
import unicodedata
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

BASE = "https://cdn.tse.jus.br/estatistica/sead/odsele"
ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / ".cache"
CARGO_DEP_FED = "6"
UFS = ("AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO").split()
NULOS = {"#NULO#", "#NE#", "#NULO", "-1", "-3", ""}

csv.field_size_limit(1 << 30)


def baixar(nome: str, ano: int) -> Path:
    CACHE.mkdir(exist_ok=True)
    destino = CACHE / f"{nome}_{ano}.zip"
    if not destino.exists():
        url = f"{BASE}/{nome}/{nome}_{ano}.zip"
        print(f"baixando {url}", file=sys.stderr)
        tmp = destino.with_suffix(".part")
        with urllib.request.urlopen(url) as r, open(tmp, "wb") as f:
            total = int(r.headers.get("Content-Length") or 0)
            feito = 0
            while chunk := r.read(1 << 20):
                f.write(chunk)
                feito += len(chunk)
                if total:
                    print(f"\r  {feito >> 20} / {total >> 20} MB", end="", file=sys.stderr, flush=True)
            print(file=sys.stderr)
        tmp.rename(destino)
    return destino


def linhas(zip_path: Path, uf: str):
    """Lê o CSV da UF dentro do zip (o TSE publica um CSV por UF + um _BRASIL)."""
    with zipfile.ZipFile(zip_path) as z:
        nomes = [n for n in z.namelist() if n.upper().endswith(f"_{uf}.CSV")]
        if not nomes:
            return
        with z.open(nomes[0]) as raw:
            texto = io.TextIOWrapper(raw, encoding="latin-1", newline="")
            yield from csv.DictReader(texto, delimiter=";")


def col(row, *nomes, default="0"):
    for n in nomes:
        if n in row and row[n] not in (None, ""):
            return row[n]
    return default


def num(v) -> int:
    try:
        return max(int(v), 0)
    except (TypeError, ValueError):
        return 0


def limpo(v: str) -> str:
    v = (v or "").strip()
    return "" if v.upper() in NULOS else v


def chave_grupo(row) -> tuple[str, str, str]:
    """Federação conta como um único 'partido' na distribuição de vagas."""
    nr_fed = limpo(col(row, "NR_FEDERACAO", default=""))
    if nr_fed:
        sigla = limpo(col(row, "SG_FEDERACAO", default="")) or f"Federação {nr_fed}"
        nome = limpo(col(row, "NM_FEDERACAO", default="")) or sigla
        return f"F{nr_fed}", sigla, nome
    sigla = row["SG_PARTIDO"].strip()
    return f"P{sigla}", sigla, limpo(col(row, "NM_PARTIDO", default="")) or sigla


def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


MINUSCULAS = {"da", "de", "do", "das", "dos", "e"}


def titulo(nome: str) -> str:
    """'JOÃO DA SILVA' -> 'João da Silva' (o TSE publica nomes em maiúsculas)."""
    partes = nome.strip().lower().split()
    return " ".join(p if (i and p in MINUSCULAS) else p[:1].upper() + p[1:] for i, p in enumerate(partes))


def eh_dep_fed(row) -> bool:
    return col(row, "CD_CARGO", default="") == CARGO_DEP_FED and col(row, "NR_TURNO", default="1") == "1"


def generos(zip_path: Path, uf: str) -> dict[str, bool]:
    """SQ_CANDIDATO -> True se o gênero declarado ao TSE é feminino."""
    return {row["SQ_CANDIDATO"]: row.get("DS_GENERO", "").strip().upper() == "FEMININO"
            for row in linhas(zip_path, uf) if col(row, "CD_CARGO", default="") == CARGO_DEP_FED}


def processar(ano: int, uf: str, zips: dict) -> dict | None:
    feminino = generos(zips["cand_info"], uf)
    cands: dict[str, dict] = {}
    grupos: dict[str, dict] = {}
    partidos_legenda = defaultdict(int)

    def grupo(row):
        gid, sigla, nome = chave_grupo(row)
        g = grupos.setdefault(gid, {"id": gid, "sigla": sigla, "nome": nome,
                                    "partidos": set(), "legenda": 0, "nominais_oficial": 0})
        g["partidos"].add(row["SG_PARTIDO"].strip())
        return gid

    for row in linhas(zips["cand"], uf):
        if not eh_dep_fed(row):
            continue
        sq = row["SQ_CANDIDATO"]
        votos = num(col(row, "QT_VOTOS_NOMINAIS_VALIDOS", "QT_VOTOS_NOMINAIS"))
        c = cands.get(sq)
        if c is None:
            situacao = row["DS_SIT_TOT_TURNO"].strip().upper()
            c = cands[sq] = {
                "n": row["NR_CANDIDATO"].strip(),
                "nome": titulo(row["NM_URNA_CANDIDATO"]),
                "partido": row["SG_PARTIDO"].strip(),
                "g": grupo(row),
                "v": 0,
                "eleito": situacao.startswith("ELEITO"),
                "sit": situacao.title(),
            }
            if feminino.get(sq):
                c["f"] = 1
        c["v"] += votos

    if not cands:
        return None

    for row in linhas(zips["partido"], uf):
        if not eh_dep_fed(row):
            continue
        # Total de legenda inclui votos nominais de candidatos com registro negado
        # que a lei manda contar para o partido ("convertidos em legenda").
        leg = num(col(row, "QT_TOTAL_VOTOS_LEG_VALIDOS", "QT_VOTOS_LEGENDA_VALIDOS", "QT_VOTOS_LEGENDA"))
        gid = grupo(row)
        grupos[gid]["legenda"] += leg
        grupos[gid]["nominais_oficial"] += num(col(row, "QT_VOTOS_NOMINAIS_VALIDOS"))
        partidos_legenda[row["SG_PARTIDO"].strip()] += leg

    totais = defaultdict(int)
    for row in linhas(zips["detalhe"], uf):
        if not eh_dep_fed(row):
            continue
        for campo in ("QT_APTOS", "QT_COMPARECIMENTO", "QT_ABSTENCOES", "QT_VOTOS_BRANCOS",
                      "QT_VOTOS_NULOS", "QT_TOTAL_VOTOS_NULOS", "QT_VOTOS_NOMINAIS_VALIDOS",
                      "QT_TOTAL_VOTOS_LEG_VALIDOS", "QT_TOTAL_VOTOS_ANUL_SUBJUD", "QT_TOTAL_VOTOS_VALIDOS"):
            if campo in row:
                totais[campo] += num(row[campo])

    lista_grupos = []
    for g in grupos.values():
        membros = [c for c in cands.values() if c["g"] == g["id"]]
        nominais = g["nominais_oficial"] or sum(c["v"] for c in membros)
        lista_grupos.append({
            "id": g["id"], "sigla": g["sigla"], "nome": g["nome"],
            "partidos": sorted(g["partidos"]),
            "nominais": nominais, "legenda": g["legenda"],
            "vagas": sum(1 for c in membros if c["eleito"]),
        })
    lista_grupos.sort(key=lambda g: -(g["nominais"] + g["legenda"]))

    validos = sum(g["nominais"] + g["legenda"] for g in lista_grupos)
    vagas = sum(g["vagas"] for g in lista_grupos)
    oficial = totais.get("QT_TOTAL_VOTOS_VALIDOS")
    if oficial and oficial != validos:
        print(f"  aviso {ano} {uf}: válidos somados {validos} != oficial {oficial}", file=sys.stderr)
    nulos = totais.get("QT_TOTAL_VOTOS_NULOS") or totais.get("QT_VOTOS_NULOS", 0)

    lista_cands = sorted(cands.values(), key=lambda c: -c["v"])
    for c in lista_cands:
        c["busca"] = sem_acento(f'{c["nome"]} {c["n"]} {c["partido"]}')

    return {
        "ano": ano, "uf": uf, "vagas": vagas,
        "validos": validos,
        "brancos": totais.get("QT_VOTOS_BRANCOS", 0),
        "nulos": nulos,
        "comparecimento": totais.get("QT_COMPARECIMENTO", 0),
        "aptos": totais.get("QT_APTOS", 0),
        "legendaPorPartido": dict(partidos_legenda),
        "grupos": lista_grupos,
        "candidatos": lista_cands,
    }


def main(anos):
    for ano in anos:
        zips = {
            "cand": baixar("votacao_candidato_munzona", ano),
            "partido": baixar("votacao_partido_munzona", ano),
            "detalhe": baixar("detalhe_votacao_munzona", ano),
            "cand_info": baixar("consulta_cand", ano),
        }
        pasta = ROOT / "data" / str(ano)
        pasta.mkdir(parents=True, exist_ok=True)
        feitos = []
        for uf in UFS:
            dados = processar(ano, uf, zips)
            if dados is None:
                print(f"{ano} {uf}: sem dados", file=sys.stderr)
                continue
            (pasta / f"{uf}.json").write_text(json.dumps(dados, ensure_ascii=False, separators=(",", ":")))
            feitos.append(uf)
            print(f"{ano} {uf}: {dados['vagas']} vagas, {len(dados['candidatos'])} candidatos", file=sys.stderr)
        indice_path = ROOT / "data" / "index.json"
        indice = json.loads(indice_path.read_text()) if indice_path.exists() else {"anos": {}}
        indice["anos"][str(ano)] = feitos
        indice_path.write_text(json.dumps(indice, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main([int(a) for a in sys.argv[1:]])
