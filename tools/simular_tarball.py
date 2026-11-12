#!/usr/bin/env python3
"""Simulates which files `R CMD build` puts in the package tarball, with the same rules as R
(tools:::.build_packages in R 4.6): the .Rbuildignore lines as Perl regexes, case-insensitive, over the
relative paths; R's built-in exclusions (VCS folders, .Rhistory, .Rprofile, .gitignore, ._*, *.Rcheck...).
Then flags what R CMD check would complain about in that tarball:
  non-standard top-level files, hidden files, paths over 100 bytes, executables / object files
  (node_modules!), files with future time stamps, and the installed size.
No R needed. Exit 1 on problems, with the .Rbuildignore lines to add.
    python3 tools/simular_tarball.py [pasta-do-pacote]"""
import os
import pathlib
import re
import sys
import time

RAIZ = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parents[1]).resolve()

# R 4.6: tools:::get_exclude_patterns(), .hidden_file_exclusions, .vc_dir_names
PADROES_R = [r"^\.Rbuildignore$", r"(^|/)\.DS_Store$", r"^\.(RData|Rhistory)$", r"~$", r"\.bak$", r"\.sw.$",
             r"(^|/)\.#[^/]*$", r"(^|/)#[^/]*#$", r"^TITLE$", r"^data/00Index$", r"^inst/doc/00Index\.dcf$",
             r"^config\.(cache|log|status)$", r"(^|/)autom4te\.cache$", r"^src/.*\.d$", r"^src/Makedeps$",
             r"^src/so_locations$", r"^inst/doc/Rplots\.(ps|pdf)$", r"^(GPATH|GRTAGS|GTAGS)$"]
OCULTOS_R = {".Renviron", ".Rprofile", ".Rproj.user", ".Rhistory", ".Rapp.history", ".tex", ".log", ".aux", ".pdf",
             ".png", ".backups", ".cvsignore", ".cproject", ".directory", ".dropbox", ".exrc", ".gdb.history",
             ".gitattributes", ".gitignore", ".gitmodules", ".hgignore", ".hgtags", ".htaccess", ".latex2html-init",
             ".project", ".seed", ".settings", ".tm_properties"}
VCS = {"CVS", ".svn", ".arch-ids", ".bzr", ".git", ".hg", "_darcs", ".metadata"}
# R CMD check "checking top-level files": what a package may have at the top level
PADRAO_TOPO = re.compile(r"^(DESCRIPTION|NAMESPACE|LICEN[CS]E(\.md)?|NEWS(\.md|\.Rd)?|README(\.md|\.Rmd)?|ChangeLog|INDEX|"
                         r"configure(\.win|\.ucrt)?|cleanup(\.win|\.ucrt)?|CITATION|"
                         r"R|man|inst|tests|tools|data|demo|exec|po|src|vignettes|build)$")


def ler_rbuildignore():
    f = RAIZ / ".Rbuildignore"
    if not f.exists():
        return [], False
    linhas = [l.strip() for l in f.read_text(encoding="utf-8", errors="replace").splitlines()]
    return [l for l in linhas if l], True


def main():
    linhas, tem = ler_rbuildignore()
    padroes = []
    for p in PADROES_R + linhas:
        try:
            padroes.append(re.compile(p, re.IGNORECASE))
        except re.error as e:
            print(f"FALHOU: linha inválida no .Rbuildignore: {p!r} ({e})")
            sys.exit(1)
    nome = re.search(r"^Package:\s*(\S+)", (RAIZ / "DESCRIPTION").read_text(encoding="utf-8"), re.M).group(1)
    tarball = re.compile(rf"^{re.escape(nome)}_[0-9.-]+\.(tar\.gz|tar|tar\.bz2|tar\.xz|tgz|zip)$")

    def excluido(rel, base, e_dir):
        if any(p.search(rel) for p in padroes):
            return True
        if e_dir and (base in {"check", "chm"} | VCS or re.search(r"([Oo]ld|\.Rcheck)$", base)):
            return True
        return base in {"Read-and-delete-me", "GNUMakefile"} or base.startswith("._") or base in OCULTOS_R or bool(tarball.match(rel))

    incluidos = []
    for raiz, dirs, arqs in os.walk(RAIZ):
        relraiz = os.path.relpath(raiz, RAIZ)
        relraiz = "" if relraiz == "." else relraiz.replace(os.sep, "/") + "/"
        dirs[:] = [d for d in dirs if not excluido(relraiz + d, d, True)]
        for d in dirs:
            incluidos.append((relraiz + d, True))
        for a in arqs:
            if not excluido(relraiz + a, a, False):
                incluidos.append((relraiz + a, False))

    problemas, adicionar = [], []
    topo = sorted({r.split("/")[0] for r, _ in incluidos})
    fora = [t for t in topo if not PADRAO_TOPO.match(t)]
    if fora:
        problemas.append("fora do padrão no topo do tarball (NOTE 'Non-standard files/directories'): " + ", ".join(fora))
        adicionar += ["^" + re.escape(t).replace("\\-", "-") + "$" for t in fora]
    ocultos = [r for r, _ in incluidos if any(p.startswith(".") for p in r.split("/"))]
    if ocultos:
        problemas.append(f"{len(ocultos)} arquivos/pastas ocultos iriam para o tarball (NOTE 'hidden files'): " + ", ".join(ocultos[:6]))
        adicionar += ["^" + re.escape(r).replace("\\-", "-") + "$" for r in ocultos if "/" not in r]
    longos = [r for r, _ in incluidos if len((nome + "/" + r).encode()) > 100]
    if longos:
        problemas.append(f"{len(longos)} caminhos com mais de 100 bytes (NOTE 'non-portable file paths'): {longos[0]}")
    binarios = []
    for r, d in incluidos:
        if d:
            continue
        if re.search(r"\.(o|so|dll|dylib|a|exe)$", r, re.I):
            binarios.append(r)
            continue
        try:
            with open(RAIZ / r, "rb") as fh:
                cab = fh.read(4)
        except OSError:
            continue
        if cab[:4] in (b"\x7fELF", b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe", b"\xca\xfe\xba\xbe") or cab[:2] == b"MZ":
            binarios.append(r)
    if binarios:
        problemas.append(f"{len(binarios)} executáveis/bibliotecas (WARNING 'executable files' / NOTE 'object files'): {binarios[0]}")
    agora = time.time()
    futuros = [r for r, d in incluidos if not d and os.path.getmtime(RAIZ / r) > agora + 60]
    if futuros:
        problemas.append(f"{len(futuros)} arquivos com data no futuro (WARNING 'future file timestamps'): {', '.join(futuros[:4])}"
                         "\n      corrija: python3 tools/verificar.py (o preflight ajusta) ou  find . -newermt now -exec touch {} +")
    tam = sum(os.path.getsize(RAIZ / r) for r, d in incluidos if not d)
    inst = sum(os.path.getsize(RAIZ / r) for r, d in incluidos if not d and r.startswith("inst/"))

    if not tem:
        problemas.insert(0, ".Rbuildignore ausente: tudo (node_modules, srcjs, docs...) iria para o tarball")
    if problemas:
        for p in problemas:
            print("FALHOU:", p)
        if adicionar:
            print("      o .Rbuildignore desta cópia não é o do repositório (ou foi substituído). Acrescente estas linhas:")
            for a in dict.fromkeys(adicionar):
                print("        " + a)
        sys.exit(1)
    n = sum(1 for _, d in incluidos if not d)
    print(f"tarball simulado: {n} arquivos, {tam / 1e6:.1f} MB ({inst / 1e6:.1f} MB em inst/: o tamanho instalado sai como INFO no R 4.6, NOTE em versões antigas); "
          f"topo: {', '.join(topo)}; sem ocultos, executáveis, caminhos longos ou datas no futuro")
    print(f"{n} arquivos no tarball")


if __name__ == "__main__":
    main()
