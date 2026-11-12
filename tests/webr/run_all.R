# Runs the R tests in webR (R 4.6 base in WebAssembly): node tools/webr/run.mjs tests/webr/run_all.R ...
source("/pkg/tests/webr/shim.R")
Sys.setenv(COMERHOJE_WEBR = "1")
source("/pkg/tests/webr/dbi_node_sqlite.R")        # DBI/RSQLite stand-in on real SQLite (node:sqlite), if available
cat(if (isTRUE(.dbi_disponivel)) "SQLite: node:sqlite (regras do RSQLite)\n" else "SQLite: node:sqlite indispon\u00edvel (Node < 22.5); testes do RSQLite pulados\n")
for (f in list.files("/pkg/R", "\\.R$", full.names = TRUE)) sys.source(f, envir = globalenv())
for (f in list.files("/pkg/tests/testthat", "^helper.*\\.R$", full.names = TRUE)) source(f)
arquivos <- list.files("/pkg/tests/testthat", "^test-.*\\.R$", full.names = TRUE)
for (f in arquivos) {
  antes <- c(.t$ok, length(.t$falhas))
  source(f)
  cat(sprintf("%-28s %3d ok  %d falha(s)\n", basename(f), .t$ok - antes[1], length(.t$falhas) - antes[2]))
}
skips <- grepl("SKIP$", .t$falhas)
for (m in .t$falhas[!skips]) cat("FALHOU", m, "\n")
cat(sprintf("\nR (webR %s): %d expectativas ok, %d falha(s), %d teste(s) pulados no webR (o HTML de 40 MB; e o SQLite se o node n\u00e3o tiver node:sqlite)\n",
            R.version.string, .t$ok, sum(!skips), sum(skips)))
if (any(!skips)) cat("R ERROR: falhas\n")
