# webR shim (base R only): jsonlite via a base-R parser, system.file() for the package, and a minimal
# testthat. Lets the SAME tests/testthat/*.R run in webR (no CRAN packages) and in real testthat on CI.
# Technique from taiga-design-system/tools/bench/shim.R (`::` is an ordinary R function).

.json_parse <- function(txt) {
  s <- paste(txt, collapse = "\n"); n <- nchar(s); i <- 1L
  chars <- strsplit(s, "")[[1]]
  ws <- function() while (i <= n && chars[i] %in% c(" ", "\n", "\t", "\r")) i <<- i + 1L
  valor <- function() {
    ws(); ch <- chars[i]
    if (ch == "{") { i <<- i + 1L; out <- list(); nomes <- character(); ws()
      if (chars[i] == "}") { i <<- i + 1L; return(structure(list(), names = character())) }
      repeat { ws(); k <- texto(); ws(); i <<- i + 1L; v <- valor()
        out[length(out) + 1L] <- list(v); nomes <- c(nomes, k); ws()
        if (chars[i] == ",") { i <<- i + 1L; next }; i <<- i + 1L; break }
      names(out) <- nomes; return(out) }
    if (ch == "[") { i <<- i + 1L; out <- list(); ws()
      if (chars[i] == "]") { i <<- i + 1L; return(out) }
      repeat { v <- valor(); out[length(out) + 1L] <- list(v); ws()
        if (chars[i] == ",") { i <<- i + 1L; next }; i <<- i + 1L; break }
      return(out) }
    if (ch == "\"") return(texto())
    if (substr(s, i, i + 3) == "true") { i <<- i + 4L; return(TRUE) }
    if (substr(s, i, i + 4) == "false") { i <<- i + 5L; return(FALSE) }
    if (substr(s, i, i + 3) == "null") { i <<- i + 4L; return(NULL) }
    j <- i; while (i <= n && chars[i] %in% c(0:9, "-", "+", ".", "e", "E")) i <<- i + 1L
    as.numeric(substr(s, j, i - 1L))
  }
  texto <- function() {
    i <<- i + 1L; partes <- character()
    repeat {
      ch <- chars[i]
      if (ch == "\"") { i <<- i + 1L; break }
      if (ch == "\\") {
        e <- chars[i + 1L]
        if (e == "u") {
          cp <- strtoi(substr(s, i + 2L, i + 5L), 16L); i <<- i + 6L
          if (cp >= 0xD800 && cp <= 0xDBFF && chars[i] == "\\" && chars[i + 1L] == "u") {
            lo <- strtoi(substr(s, i + 2L, i + 5L), 16L); i <<- i + 6L; cp <- 0x10000 + (cp - 0xD800) * 1024 + (lo - 0xDC00) }
          partes <- c(partes, intToUtf8(cp))
        } else { partes <- c(partes, switch(e, n = "\n", t = "\t", r = "\r", b = "\b", f = "\f", e)); i <<- i + 2L }
      } else { partes <- c(partes, ch); i <<- i + 1L }
    }
    paste(partes, collapse = "")
  }
  ws(); if (!chars[i] %in% c("{", "[", "\"", "t", "f", "n", "-", 0:9)) stop("JSON inválido")
  valor()
}
.json_escrever <- function(x, auto_unbox = TRUE, ...) {
  esc <- function(s) paste0("\"", gsub("\n", "\\\\n", gsub("\"", "\\\\\"", gsub("\\\\", "\\\\\\\\", s))), "\"")
  if (is.null(x)) return("null")
  if (is.list(x)) {
    if (!is.null(names(x)) && length(x)) return(paste0("{", paste(esc(names(x)), vapply(x, .json_escrever, ""), sep = ":", collapse = ","), "}"))
    return(paste0("[", paste(vapply(x, .json_escrever, ""), collapse = ","), "]"))
  }
  v <- if (is.character(x)) esc(x) else if (is.logical(x)) ifelse(is.na(x), "null", tolower(as.character(x))) else ifelse(is.na(x), "null", format(x, digits = 15))
  if (length(v) == 1 && auto_unbox) v else paste0("[", paste(v, collapse = ","), "]")
}
.b64_alfabeto <- strsplit("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "")[[1]]
.base64_enc <- function(x) {                    # RFC 4648, no line breaks (like jsonlite::base64_enc)
  b <- as.integer(if (is.character(x)) charToRaw(x) else x); n <- length(b)
  if (!n) return("")
  resto <- n %% 3L; b <- c(b, rep(0L, (3L - resto) %% 3L))
  m <- matrix(b, nrow = 3L)
  v <- m[1, ] * 65536L + m[2, ] * 256L + m[3, ]
  idx <- rbind(v %/% 262144L, (v %/% 4096L) %% 64L, (v %/% 64L) %% 64L, v %% 64L) + 1L
  ch <- .b64_alfabeto[idx]
  if (resto) { k <- length(ch); ch[(k - (3L - resto) + 1L):k] <- "=" }
  paste(ch, collapse = "")
}
.jsonlite <- list(
  fromJSON = function(txt, simplifyVector = FALSE, ...) .json_parse(if (length(txt) == 1 && !grepl("^\\s*[\\[{]", txt) && file.exists(txt)) readLines(txt, warn = FALSE, encoding = "UTF-8") else txt),
  toJSON = function(x, ...) structure(.json_escrever(x, ...), class = "json"),
  base64_enc = .base64_enc)

`::` <- function(pkg, name) {
  pkg <- as.character(substitute(pkg)); name <- as.character(substitute(name))
  if (pkg == "jsonlite") return(.jsonlite[[name]])
  if (pkg %in% c("DBI", "RSQLite") && exists(".DBI_fake")) {     # tests/webr/dbi_node_sqlite.R (real SQLite via node)
    f <- (if (pkg == "DBI") .DBI_fake else .RSQLite_fake)[[name]]
    if (is.null(f)) stop(sprintf("%s::%s n\u00e3o existe no substituto do webR", pkg, name))
    return(f)
  }
  get(name, envir = asNamespace(pkg), inherits = FALSE)
}
system.file <- function(..., package = "base") {
  if (identical(package, "comerHoje")) { p <- file.path("/pkg/inst", ...); return(if (file.exists(p)) p else "") }
  base::system.file(..., package = package)
}

# ---------- minimal testthat ----------
.t <- new.env(); .t$ok <- 0L; .t$falhas <- character(); .t$atual <- ""
test_path <- function(...) file.path("/pkg/tests/testthat", ...)
test_that <- function(desc, code) {
  .t$atual <- desc
  tryCatch(eval(substitute(code), envir = new.env(parent = parent.frame())),
           error = function(e) .t$falhas <- c(.t$falhas, sprintf("[%s] %s", desc, conditionMessage(e))))
  invisible(TRUE)
}
.registra <- function(ok, msg) if (isTRUE(ok)) .t$ok <- .t$ok + 1L else stop(msg, call. = FALSE)
expect_equal <- function(obj, esp, tolerance = 1e-8, ...) {
  ok <- isTRUE(all.equal(obj, esp, tolerance = tolerance, check.attributes = FALSE))
  .registra(ok, sprintf("esperado %s, obtido %s", paste(format(esp), collapse = ","), paste(format(obj), collapse = ",")))
}
expect_identical <- function(obj, esp, ...) .registra(identical(obj, esp), sprintf("não idêntico: %s vs %s", paste(format(obj), collapse = ","), paste(format(esp), collapse = ",")))
expect_true <- function(x, ...) .registra(isTRUE(x), "não é TRUE")
expect_false <- function(x, ...) .registra(identical(x, FALSE), "não é FALSE")
expect_null <- function(x, ...) .registra(is.null(x), "não é NULL")
expect_error <- function(expr, regexp = NULL, ...) {
  m <- tryCatch({ force(expr); NULL }, error = function(e) conditionMessage(e))
  .registra(!is.null(m) && (is.null(regexp) || grepl(regexp, m)), sprintf("esperava erro %s; obtido: %s", regexp, format(m)))
}
expect_gte <- function(x, y) .registra(x >= y, sprintf("%s < %s", x, y))
expect_lte <- function(x, y) .registra(x <= y, sprintf("%s > %s", x, y))
skip_if_not_installed <- function(pkg) {
  if (pkg %in% c("DBI", "RSQLite") && isTRUE(get0(".dbi_disponivel"))) return(invisible(TRUE))   # node:sqlite stand-in
  if (!requireNamespace(pkg, quietly = TRUE)) stop("SKIP")
}
skip_if <- function(condicao, mensagem = NULL) if (isTRUE(condicao)) stop("SKIP")
skip_on_cran <- function() invisible(NULL)
