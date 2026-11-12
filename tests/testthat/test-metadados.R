# Metadata remover: GPS gone, orientation kept, image data (entropy-coded scan) byte for byte identical.
# synthetic photo WITH GPS (fake coordinates 0,0), camera, date, comment and APP13; plus the
# references (already stripped: there must be no GPS in them, and the tool must be a no-op on them)
sintetica <- test_path("..", "fixtures", "fotos", "sintetica_com_gps.jpg")
refs <- list.files(if (dir.exists("/refs")) "/refs" else test_path("..", "..", "references"), "\\.jpe?g$", full.names = TRUE)
fotos <- c(sintetica, refs)
scan_bytes <- function(b) { i <- 3L; repeat { m <- as.integer(b[i + 1L]); len <- .u16(b, i + 2L); if (m == 0xda) return(b[i:length(b)]); i <- i + 2L + len } }
for (foto in fotos) test_that(paste("limpar_metadados", basename(foto)), {
  antes <- metadados_resumo(foto)
  saida <- file.path(tempdir(), basename(foto))
  limpar_metadados(foto, destino = tempdir(), silencioso = TRUE)
  depois <- metadados_resumo(saida)
  if (identical(foto, sintetica)) expect_true(isTRUE(antes$gps)) else expect_null(antes$gps)   # references: already clean
  expect_null(depois$gps); expect_null(depois$fabricante); expect_null(depois$data_hora)
  expect_identical(depois$orientacao, antes$orientacao)
  b0 <- readBin(foto, "raw", file.info(foto)$size); b1 <- readBin(saida, "raw", file.info(saida)$size)
  expect_identical(scan_bytes(b1), scan_bytes(b0))                       # pixels untouched (no recompression)
  expect_identical(length(grepRaw("iPhone", b1, all = TRUE)), 0L)
  if (identical(foto, sintetica)) expect_gte(length(grepRaw("CameraDeTeste", b0, all = TRUE)), 1L)
  expect_identical(length(grepRaw("CameraDeTeste", b1, all = TRUE)), 0L)
})
test_that("limpar_metadados é idempotente", {
  f <- file.path(tempdir(), basename(sintetica))
  r <- limpar_metadados(f, silencioso = TRUE)
  expect_identical(r$removidos, "")
})
test_that("foto_exemplo() grava a mesma foto sint\u00e9tica da fixture", {
  f <- foto_exemplo(tempfile(fileext = ".jpg"))
  expect_identical(unname(tools::md5sum(f)), unname(tools::md5sum(sintetica)))
  expect_true(isTRUE(metadados_resumo(f)$gps))
})
