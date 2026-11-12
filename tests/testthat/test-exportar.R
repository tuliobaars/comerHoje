# Standalone HTML and the embedded reader (export_html(leitor = TRUE)). The embedding must be byte-for-byte
# the same as the node build (tools/lib/com-leitor.mjs): both are checked against the same fixture.
mini <- test_path("..", "fixtures", "leitor_mini")
ler <- function(f) readChar(f, file.info(f)$size, useBytes = TRUE)
# the 7 fake reader files are bytes in ocr.json (no binary files in the repository): write them to a temp folder
ocr <- file.path(tempdir(), "leitor_mini_ocr")
for (par in local({ j <- jsonlite::fromJSON(file.path(mini, "ocr.json"), simplifyVector = FALSE)$arquivos; Map(list, names(j), j) })) {
  dir.create(dirname(file.path(ocr, par[[1]])), recursive = TRUE, showWarnings = FALSE)
  writeBin(as.raw(as.integer(unlist(par[[2]]))), file.path(ocr, par[[1]]))
}
test_that("leitor embutido igual ao da build em node (mesma fixture)", {
  expect_identical(.html_com_leitor(ler(file.path(mini, "base.html")), ocr), ler(file.path(mini, "esperado.html")))
})
test_that("leitor embutido: erros claros", {
  base <- ler(file.path(mini, "base.html"))
  expect_error(.html_com_leitor(paste0(base, base), ocr), "recursos")
  expect_error(.html_com_leitor(base, file.path(mini, "nao-existe")), "incompleto")
})
test_that("export_html() copia o HTML aut\u00f4nomo", {
  f <- export_html(tempfile(fileext = ".html"))
  txt <- ler(f)
  expect_true(file.size(f) > 100000)
  expect_true(grepl('id="ch-dados"', txt, fixed = TRUE))
  expect_false(grepl("\"ocrEmbutido\":{", txt, fixed = TRUE))   # the JS mentions the key; the payload must not carry it
})
test_that("export_html(leitor = TRUE) embute os modelos do pacote", {
  skip_on_cran()                                              # writes ~40 MB
  skip_if(nzchar(Sys.getenv("COMERHOJE_WEBR")), "webR: base64 de 30 MB em R puro \u00e9 lento demais")
  pasta <- system.file("app", "www", "ocr", package = "comerHoje")
  skip_if(!nzchar(pasta) || !file.exists(file.path(pasta, "det.onnx")), "modelos OCR ausentes (rode node tools/build.mjs)")
  f <- export_html(tempfile(fileext = ".html"), leitor = TRUE)
  on.exit(unlink(f))
  expect_true(file.size(f) > 20e6)
  cabeca <- readChar(f, 2e6, useBytes = TRUE)            # the payload sits after the inline CSS and fonts
  expect_true(grepl('"recursos":{"ocrEmbutido":{"ortjs":"', cabeca, fixed = TRUE))
})
