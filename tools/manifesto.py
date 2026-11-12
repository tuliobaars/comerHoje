#!/usr/bin/env python3
"""Manifest of the repository: every source file with its size and SHA-256, plus the full text of the small
hidden files (.Rbuildignore, .gitignore...). Copies made with Finder, some zip tools or some download
tools lose hidden files and sometimes binary files. tools/verificar.py uses this manifest in its preflight
to say exactly which files are missing, and to put the hidden files back.

    python3 tools/manifesto.py --gravar     # after changing the repository (writes tools/manifesto.json)
    python3 tools/manifesto.py              # compares this copy with the manifest
Generated files (build outputs, man/ from roxygen, node_modules...) are not listed."""
import hashlib
import json
import os
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parents[1]
ARQ = RAIZ / "tools" / "manifesto.json"
OCULTOS = [".Rbuildignore", ".gitignore", ".dockerignore", ".env.exemplo", ".github/workflows/ci.yml"]
FORA_PASTAS = {".git", "node_modules", "taiga-design-system", "__MACOSX", ".Rproj.user", "dist", "renv/library",
               "renv", "comerHoje.Rcheck", "check", "inst/app/www", "inst/standalone", "man",
               "docs/verification"}
FORA_ARQS = re.compile(r"(^|/)(\.DS_Store|\.Rhistory|\.RData|\.Renviron|\.env|00check\.log|NAMESPACE)$|^(\.Rprofile|renv\.lock|[^/]*\.Rproj)$|\.db(-wal|-shm)?$|\.tar\.gz$|"
                       r"^inst/extdata/catalogo\.json$|^inst/app/tema-inicial\.js$|^inst/quarto/_comerhoje-(head|body)\.html$|"
                       r"^tools/manifesto\.json$|^comerhoje[^/]*\.html$")


def listar():
    saida = []
    for raiz, dirs, arqs in os.walk(RAIZ):
        rel = os.path.relpath(raiz, RAIZ).replace(os.sep, "/")
        rel = "" if rel == "." else rel + "/"
        dirs[:] = sorted(d for d in dirs if (rel + d) not in FORA_PASTAS and d not in FORA_PASTAS and not d.endswith(".Rcheck"))
        for a in sorted(arqs):
            r = rel + a
            if not FORA_ARQS.search(r) and not os.path.islink(RAIZ / r):
                saida.append(r)
    return saida


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()[:20]


def gravar():
    arquivos = {r: {"bytes": (RAIZ / r).stat().st_size, "sha256": sha(RAIZ / r)} for r in listar()}
    conteudo = {o: (RAIZ / o).read_text(encoding="utf-8") for o in OCULTOS if (RAIZ / o).exists()}
    ARQ.write_text(json.dumps({"nota": __doc__.strip().splitlines()[0], "arquivos": arquivos, "ocultos": conteudo},
                              ensure_ascii=False, indent=0, sort_keys=True) + "\n", encoding="utf-8")
    print(f"manifesto: {len(arquivos)} arquivos, {len(conteudo)} ocultos com conteúdo")


def comparar():
    """-> (manifest or None, missing, different)"""
    if not ARQ.exists():
        return None, [], []
    m = json.loads(ARQ.read_text(encoding="utf-8"))
    faltando = [r for r in m["arquivos"] if not (RAIZ / r).exists()]
    diferentes = [r for r, i in m["arquivos"].items() if (RAIZ / r).exists()
                  and ((RAIZ / r).stat().st_size != i["bytes"] or sha(RAIZ / r) != i["sha256"])]
    return m, faltando, diferentes


if __name__ == "__main__":
    if "--gravar" in sys.argv:
        gravar()
        sys.exit(0)
    m, faltando, diferentes = comparar()
    if m is None:
        print("sem tools/manifesto.json")
        sys.exit(1)
    print(f"{len(m['arquivos'])} arquivos no manifesto; faltando: {len(faltando)}; diferentes: {len(diferentes)}")
    for r in faltando:
        print("  falta:", r)
    for r in diferentes:
        print("  diferente:", r)
    sys.exit(1 if faltando else 0)
