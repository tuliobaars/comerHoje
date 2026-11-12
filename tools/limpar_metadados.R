#!/usr/bin/env Rscript
# Remove GPS e demais metadados de fotos, sem recomprimir (a imagem fica idêntica, pixel a pixel).
#   Rscript tools/limpar_metadados.R references/                # sobrescreve no lugar
#   Rscript tools/limpar_metadados.R fotos/ --saida=fotos_limpas/
#   Rscript tools/limpar_metadados.R foto.jpg --verificar       # só mostra o que há (não altera)
args <- commandArgs(trailingOnly = TRUE)
if (!length(args) || any(args %in% c("-h", "--help"))) {
  cat("uso: Rscript tools/limpar_metadados.R <arquivos|pastas> [--saida=PASTA] [--verificar] [--sem-orientacao]\n")
  quit(status = 0)
}
raiz <- normalizePath(file.path(dirname(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE))), ".."))
if (requireNamespace("comerHoje", quietly = TRUE)) {
  limpar_metadados <- comerHoje::limpar_metadados; metadados_resumo <- comerHoje::metadados_resumo
} else source(file.path(raiz, "R", "metadados.R"))
saida <- sub("^--saida=", "", grep("^--saida=", args, value = TRUE))
alvos <- args[!startsWith(args, "--")]
if ("--verificar" %in% args) {
  for (a in alvos) for (f in if (dir.exists(a)) list.files(a, "\\.jpe?g$", full.names = TRUE, ignore.case = TRUE) else a) {
    m <- metadados_resumo(f)
    cat(sprintf("%s: %s\n", f, if (length(m)) paste(names(m), collapse = ", ") else "sem metadados sensíveis"))
  }
  quit(status = 0)
}
res <- limpar_metadados(alvos, destino = if (length(saida)) saida else NULL,
                        manter_orientacao = !("--sem-orientacao" %in% args))
erros <- sum(startsWith(res$removidos, "ERRO"))
cat(sprintf("%d arquivo(s), %d com GPS, %d erro(s)\n", nrow(res), sum(res$gps, na.rm = TRUE), erros))
quit(status = if (erros) 1 else 0)
