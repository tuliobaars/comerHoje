# HTML and Quarto targets (DLV-12/13). The files are produced by `node tools/build.mjs` from the single
# front end. Here they are only copied; no asset is generated in R.

#' Write the standalone HTML app
#'
#' Copies the standalone target (one file, no server, no network: data, styles, scripts and fonts inline)
#' built by `node tools/build.mjs`. With `leitor = TRUE`, it also embeds the on-device expiry-date reader
#' (PaddleOCR models and ONNX Runtime, about 40 MB) taken from the files the Shiny app already ships in
#' `inst/app/www/ocr`. This is the same algorithm as `node tools/build.mjs --html-ocr`.
#'
#' @param arquivo Path of the HTML file to write.
#' @param leitor Logical. Embed the on-device date reader (larger file, about 40 MB)?
#' @return The normalized path of the file, invisibly.
#' @examples
#' f <- export_html(tempfile(fileext = ".html"))
#' file.size(f) > 0
#' @export
export_html <- function(arquivo = "comerhoje.html", leitor = FALSE) {
  origem <- system.file("standalone", "comerhoje.html", package = "comerHoje")
  if (!nzchar(origem)) stop("HTML n\u00e3o encontrado: rode `node tools/build.mjs`")
  if (!leitor) {
    file.copy(origem, arquivo, overwrite = TRUE)
    return(invisible(normalizePath(arquivo)))
  }
  pasta <- system.file("app", "www", "ocr", package = "comerHoje")
  if (!nzchar(pasta)) stop("leitor n\u00e3o encontrado em inst/app/www/ocr: rode `node tools/build.mjs`")
  html <- .html_com_leitor(readChar(origem, file.info(origem)$size, useBytes = TRUE), pasta)
  con <- file(arquivo, "wb"); on.exit(close(con))
  writeChar(html, con, eos = NULL, useBytes = TRUE)
  invisible(normalizePath(arquivo))
}

# Inserts "ocrEmbutido": {...base64...} at the start of "recursos" in the JSON payload of the HTML.
# Same algorithm as tools/lib/com-leitor.mjs; both are tested against tests/fixtures/leitor_mini.
.OCR_ARQUIVOS <- c(ortjs = "ort/ort.wasm.min.js", ortmjs = "ort/ort-wasm-simd-threaded.mjs", ortwasm = "ort/ort-wasm-simd-threaded.wasm",
                   det = "det.onnx", rec = "rec.onnx", cls = "cls.onnx", chaves = "chaves.txt")
.html_com_leitor <- function(html, pasta) {
  caminhos <- file.path(pasta, .OCR_ARQUIVOS)
  if (!all(file.exists(caminhos))) stop("leitor incompleto em ", pasta, ": rode `node tools/build.mjs`")
  b64 <- vapply(caminhos, function(x) jsonlite::base64_enc(readBin(x, "raw", file.info(x)$size)), "")
  emb <- paste0('"', names(.OCR_ARQUIVOS), '":"', b64, '"', collapse = ",")
  marca <- '"recursos":{'
  partes <- strsplit(html, marca, fixed = TRUE)[[1]]
  if (length(partes) != 2) stop("payload do HTML sem um \u00fanico \"recursos\"")
  paste0(partes[1], marca, '"ocrEmbutido":{', emb, "},", partes[2])
}

#' Write a Quarto document with the app embedded
#'
#' Writes a `.qmd` file and its two include files into a folder. Render it with `quarto render` to
#' get a page that mixes your own text with the full app (no server needed).
#'
#' @param pasta Output folder (created if needed).
#' @param titulo Title of the document.
#' @return The normalized path of the `.qmd` file, invisibly.
#' @examples
#' qmd <- export_quarto(file.path(tempdir(), "comerhoje-quarto"))
#' basename(qmd)
#' @export
export_quarto <- function(pasta = "comerhoje-quarto", titulo = "comerHoje: a cozinha da casa") {
  dir.create(pasta, showWarnings = FALSE, recursive = TRUE)
  for (f in c("_comerhoje-head.html", "_comerhoje-body.html")) file.copy(system.file("quarto", f, package = "comerHoje"), file.path(pasta, f), overwrite = TRUE)
  qmd <- readLines(system.file("quarto", "comerhoje.qmd", package = "comerHoje"), encoding = "UTF-8")
  writeLines(sub("^title: .*$", sprintf('title: "%s"', titulo), qmd), file.path(pasta, "comerhoje.qmd"), useBytes = TRUE)
  invisible(normalizePath(file.path(pasta, "comerhoje.qmd")))
}

#' Raw HTML block of the app for your own Quarto document
#'
#' For people who write their own `.qmd`: put the result in a raw HTML block, and the file
#' `_comerhoje-head.html` (see [export_quarto()]) in `include-in-header`.
#'
#' @return An [htmltools::HTML()] string.
#' @examples
#' nchar(quarto_block()) > 0
#' @export
quarto_block <- function() htmltools::HTML(paste(readLines(system.file("quarto", "_comerhoje-body.html", package = "comerHoje"), warn = FALSE), collapse = "\n"))
