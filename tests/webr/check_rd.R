# Checks man/*.Rd in webR, the parts of R CMD check that do not need an installed package:
#   1. tools::checkRd() on every file (what "checking Rd files" reports: lost braces, bad macros...);
#   2. usage vs code: every \usage matches the formals of the function (names and defaults, like codoc);
#   3. every formal argument has an \item in \arguments, and every exported function has an Rd;
#   4. the examples run (tools::Rd2ex), except those that need packages webR does not have.
# node tools/webr/run.mjs tests/webr/check_rd.R --mount=R:/pkg/R --mount=man:/pkg/man --mount=NAMESPACE:/pkg/NAMESPACE --mount=DESCRIPTION:/pkg/DESCRIPTION \
#   --mount=tests:/pkg/tests --mount=inst/extdata:/pkg/inst/extdata --mount=inst/standalone:/pkg/inst/standalone \
#   --mount=inst/quarto:/pkg/inst/quarto
source("/pkg/tests/webr/shim.R")
source("/pkg/tests/webr/dbi_node_sqlite.R")       # RSQLite stand-in on real SQLite (node:sqlite)
for (f in list.files("/pkg/R", "\\.R$", full.names = TRUE)) sys.source(f, envir = globalenv())

# examples that need packages absent from webR (htmltools; RSQLite when node:sqlite is unavailable)
PRECISAM_PACOTES <- c("quarto_block", if (!isTRUE(.dbi_disponivel)) c("repo_sqlite", "catalogo_semear"))
problemas <- character()
nota <- function(...) problemas <<- c(problemas, paste0(...))
n_ex <- 0L

rds <- list.files("/pkg/man", "\\.Rd$", full.names = TRUE)
exportadas <- sub("^export\\((.*)\\)$", "\\1", grep("^export\\(", readLines("/pkg/NAMESPACE"), value = TRUE))
aliases <- character()

secao <- function(rd, tag) Filter(function(x) identical(attr(x, "Rd_tag"), tag), rd)
texto_rd <- function(x) paste(unlist(lapply(x, function(y) if (is.list(y)) texto_rd(y) else as.character(y))), collapse = "")

for (f in rds) {
  rd <- tools::parse_Rd(f, encoding = "UTF-8")
  msgs <- tools::checkRd(rd, def_enc = TRUE)   # DESCRIPTION declares Encoding: UTF-8
  if (length(msgs)) nota(basename(f), ": checkRd: ", paste(msgs, collapse = " | "))
  nomes <- vapply(secao(rd, "\\alias"), texto_rd, "")
  aliases <- c(aliases, nomes)
  u <- secao(rd, "\\usage")
  if (!length(u)) next
  uso <- gsub("\\\\%", "%", texto_rd(u[[1]]))
  chamada <- parse(text = uso)[[1]]
  fn_nome <- as.character(chamada[[1]])
  fn <- get(fn_nome, envir = globalenv())
  fo <- formals(fn)
  args_uso <- as.list(chamada)[-1]
  nomes_uso <- ifelse(nzchar(names(args_uso) %||% rep("", length(args_uso))), names(args_uso), vapply(args_uso, deparse, ""))
  if (!identical(as.character(nomes_uso), as.character(names(fo)))) nota(basename(f), ": usage ", paste(nomes_uso, collapse = ","), " != formals ", paste(names(fo), collapse = ","))
  else for (k in names(fo)) {
    padrao_codigo <- if (is.symbol(fo[[k]]) && !nzchar(as.character(fo[[k]]))) "" else paste(deparse(fo[[k]]), collapse = "")
    padrao_uso <- if (nzchar(names(args_uso)[match(k, nomes_uso)] %||% "")) paste(deparse(args_uso[[match(k, nomes_uso)]]), collapse = "") else ""
    if (!identical(gsub("\\s", "", padrao_codigo), gsub("\\s", "", padrao_uso)))
      nota(basename(f), ": default de '", k, "' difere: codigo=", padrao_codigo, " uso=", padrao_uso)
  }
  itens <- unlist(lapply(secao(rd, "\\arguments"), function(a) lapply(Filter(function(x) identical(attr(x, "Rd_tag"), "\\item"), a),
                                                                       function(it) trimws(strsplit(texto_rd(it[[1]]), ",")[[1]]))))
  falta <- setdiff(names(fo), itens)
  if (length(falta)) nota(basename(f), ": argumentos sem documentacao: ", paste(falta, collapse = ", "))
  if (!length(secao(rd, "\\value"))) nota(basename(f), ": sem \\value")

  # examples
  if (length(secao(rd, "\\examples")) && !fn_nome %in% PRECISAM_PACOTES) {
    ex <- tempfile(fileext = ".R")
    tools::Rd2ex(rd, ex, commentDontrun = TRUE)
    if (file.exists(ex)) {
      amb <- new.env(parent = globalenv())
      r <- tryCatch({ capture.output(source(ex, local = amb, echo = FALSE, encoding = "UTF-8")); NULL }, error = function(e) conditionMessage(e))
      if (!is.null(r)) nota(basename(f), ": exemplo falhou: ", r) else n_ex <- n_ex + 1L
    }
  }
}
sem_rd <- setdiff(exportadas, aliases)
# "checking code files for non-ASCII characters" and "checking DESCRIPTION meta-information"
ascii <- tools:::.check_package_ASCII_code("/pkg")
if (length(ascii)) nota("c\u00f3digo R com caracteres n\u00e3o-ASCII: ", paste(ascii, collapse = ", "))
desc <- tryCatch(tools:::.check_package_description("/pkg/DESCRIPTION"), error = function(e) conditionMessage(e))
if (length(desc) && (is.character(desc) || length(unlist(desc)))) nota("DESCRIPTION: ", paste(capture.output(print(desc)), collapse = " "))
if (length(sem_rd)) nota("exportadas sem Rd: ", paste(sem_rd, collapse = ", "))

for (p in problemas) cat("FALHOU", p, "\n")
if (!length(ascii)) cat("ASCII no c\u00f3digo R (R CMD check): ok\n")
cat(sprintf("Rd: %d arquivos, checkRd/usage/argumentos ok em %d; %d exemplos rodaram (%d pulados: %s)\n",
            length(rds), length(rds) - length(unique(sub(":.*", "", problemas))), n_ex, length(PRECISAM_PACOTES), paste(PRECISAM_PACOTES, collapse = ", ")))
if (length(problemas)) cat("R ERROR: problemas no Rd\n")
