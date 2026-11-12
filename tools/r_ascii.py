#!/usr/bin/env python3
"""Rewrites non-ASCII characters inside R string literals as \\uXXXX (R CMD check: "Portable packages must use
only ASCII characters in their R code"). Comments are left as they are (R allows non-ASCII there).
  python3 tools/r_ascii.py [R/*.R]      (idempotent; default: all of R/; --verificar only reports)"""
import sys, pathlib

def escapar(src):
    out, i, n, estado, aspas, mudou = [], 0, len(src), "codigo", None, 0
    while i < n:
        c = src[i]
        if estado == "codigo":
            if c == "#": estado = "comentario"
            elif c in "\"'`": estado, aspas = "texto", c
            out.append(c)
        elif estado == "comentario":
            if c == "\n": estado = "codigo"
            out.append(c)
        else:                                   # inside a string or a backtick name
            if c == "\\" and i + 1 < n: out.append(src[i:i + 2]); i += 2; continue
            if c == aspas: estado = "codigo"; out.append(c)
            elif ord(c) > 127:
                cp = ord(c); out.append("\\u%04x" % cp if cp <= 0xFFFF else "\\U{%x}" % cp); mudou += 1
            else: out.append(c)
        i += 1
    return "".join(out), mudou

if __name__ == "__main__":
    so_ver = "--verificar" in sys.argv
    total = 0
    arquivos = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not arquivos:                            # default: every R file of the package
        arquivos = sorted(str(p) for p in (pathlib.Path(__file__).resolve().parents[1] / "R").glob("*.R"))
    for f in arquivos:
        p = pathlib.Path(f); novo, n = escapar(p.read_text(encoding="utf-8"))
        if n:
            total += n; print(f"{f}: {n} caractere(s) não-ASCII em strings")
            if not so_ver: p.write_text(novo, encoding="utf-8")
    if so_ver and not total: print(f"R/: {len(arquivos)} arquivos, código só com ASCII (comentários podem ter acentos)")
    if so_ver and total: print("corrija com: python3 tools/r_ascii.py")
    sys.exit(1 if (so_ver and total) else 0)
