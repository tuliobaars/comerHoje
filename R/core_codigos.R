# Códigos: EAN/GTIN, etiqueta de balança (prefixo 2), chave da NFC-e, leitura de etiqueta por OCR.

#' Check an EAN/GTIN barcode
#'
#' Validates the length (8, 12, 13 or 14 digits) and the check digit of a barcode.
#'
#' @param codigo The code, as text or number; non-digits are ignored.
#' @return `TRUE` or `FALSE`.
#' @examples
#' ean_valido("7891000100103")
#' ean_valido("7891000100104")
#' @export
ean_valido <- function(codigo) {
  s <- gsub("\\D", "", as.character(codigo))
  if (!nchar(s) %in% c(8L, 12L, 13L, 14L)) return(FALSE)
  d <- as.integer(strsplit(s, "")[[1]]); dv <- d[length(d)]; d <- rev(d[-length(d)])
  (10L - sum(d * rep_len(c(3L, 1L), length(d))) %% 10L) %% 10L == dv
}

#' Decode an in-store scale barcode
#'
#' Barcodes that start with 2 are printed by the store's scale: 2, a product code (PLU), a value
#' (price or weight) and the check digit. The positions vary by store, so they are arguments.
#'
#' @param codigo The 13-digit barcode.
#' @param plu Start and end positions of the product code.
#' @param valor Start and end positions of the value.
#' @param valor_tipo Whether the value is the total price in cents (`"preco"`) or the weight in
#'   grams (`"peso"`).
#' @return A list with `plu`, `preco_total` and `peso_kg` (one of them `NA`), or `NULL` when the code
#'   is not a valid scale barcode.
#' @examples
#' parse_etiqueta_balanca("2001230014896")
#' @export
parse_etiqueta_balanca <- function(codigo, plu = c(2, 6), valor = c(7, 12), valor_tipo = c("preco", "peso")) {
  valor_tipo <- match.arg(valor_tipo)
  s <- gsub("\\D", "", as.character(codigo))
  if (nchar(s) != 13 || substr(s, 1, 1) != "2" || !ean_valido(s)) return(NULL)
  v <- as.integer(substr(s, valor[1], valor[2]))
  list(plu = substr(s, plu[1], plu[2]), preco_total = if (valor_tipo == "preco") v / 100 else NA_real_,
       peso_kg = if (valor_tipo == "peso") v / 1000 else NA_real_)
}

.UF_IBGE <- c("42" = "SC", "41" = "PR", "43" = "RS", "35" = "SP", "33" = "RJ", "31" = "MG", "53" = "DF")

#' Parse the access key of an NFC-e
#'
#' Finds the 44-digit access key in the text of the receipt's QR code (usually a URL) and checks its
#' check digit (modulo 11).
#'
#' @param entrada Text of the QR code, a URL or the key itself (spaces allowed).
#' @return `NULL` when there is no key; otherwise a list with `chave`, `valida`, `uf` (state, `"SC"`
#'   for Santa Catarina), `aamm`, `cnpj`, `modelo`, `serie`, `numero` and `nfce` (model 65).
#' @examples
#' k <- chave_nfce("42240112345678000195650010000012341000012347")
#' k$uf
#' k$valida
#' @export
chave_nfce <- function(entrada) {
  m <- regmatches(entrada, regexpr("(?<!\\d)\\d{44}(?!\\d)", entrada, perl = TRUE))
  if (!length(m)) { d <- gsub("\\D", "", entrada); if (nchar(d) == 44) m <- d else return(NULL) }
  c <- as.integer(strsplit(m, "")[[1]])
  pesos <- rep_len(2:9, 43)                                 # da direita para a esquerda
  soma <- sum(rev(c[1:43]) * pesos); resto <- soma %% 11
  dv <- if (resto < 2) 0L else 11L - resto
  uf <- substr(m, 1, 2)
  list(chave = m, valida = dv == c[44], uf = if (uf %in% names(.UF_IBGE)) .UF_IBGE[[uf]] else uf,
       aamm = substr(m, 3, 6), cnpj = substr(m, 7, 20), modelo = substr(m, 21, 22), serie = substr(m, 23, 25),
       numero = as.character(as.integer(substr(m, 26, 34))), nfce = substr(m, 21, 22) == "65")
}

#' Read a scale label from OCR text
#'
#' Extracts the net weight, the price per kilogram and the total from the text of a butcher or deli
#' label, and checks that the three agree.
#'
#' @param texto OCR text of the label (lines separated by newlines).
#' @return A list with `peso_kg`, `preco_kg`, `total` and `consistente` (`NA` when something is
#'   missing).
#' @examples
#' ler_balanca_texto("PESO LIQ. 0,482 KG
#' R$/KG 30,90
#' TOTAL R$ 14,89")
#' @export
ler_balanca_texto <- function(texto) {
  linhas <- strsplit(normalizar_ocr(texto), "\r?\n")[[1]]
  num <- function(x) as.numeric(sub(",", ".", gsub(".", "", x, fixed = TRUE), fixed = TRUE))
  peso <- NA_real_; preco_kg <- NA_real_; total <- NA_real_
  for (i in seq_along(linhas)) {
    l <- linhas[[i]]
    if (!grepl("TARA", l) && is.na(peso)) { m <- regmatches(l, regexec("(\\d{1,3}[,.]\\d{3})\\s*K", l))[[1]]; if (length(m)) peso <- num(m[2]) }
    pk <- regmatches(l, regexec("R\\S?\\s*/\\s*KG\\W{0,3}(\\d{1,4}[,.]\\d{2})(?!\\d)", l, perl = TRUE))[[1]]
    if (length(pk)) preco_kg <- num(pk[2])
    if (grepl("TOTAL", l)) {
      t <- regmatches(paste(l, if (i < length(linhas)) linhas[[i + 1]] else ""),
                      regexec("TOTAL[^\\d]*(\\d{1,5}[,.]\\d{2})(?!\\d)", paste(l, if (i < length(linhas)) linhas[[i + 1]] else ""), perl = TRUE))[[1]]
      if (length(t)) total <- as.numeric(sub(",", ".", t[2], fixed = TRUE))
    }
  }
  consistente <- if (anyNA(c(peso, preco_kg, total))) NA else abs(peso * preco_kg - total) / total < 0.01
  list(peso_kg = peso, preco_kg = preco_kg, total = total, consistente = consistente)
}

#' Find barcodes in OCR text
#'
#' @param texto OCR text.
#' @return A character vector of the GTIN/EAN codes found whose check digit is valid.
#' @examples
#' gtins_do_texto("COD 7891000100103 LOTE 12345")
#' @export
gtins_do_texto <- function(texto) {
  m <- regmatches(texto, gregexpr("(?<!\\d)(\\d[\\d ]{6,17}\\d)(?!\\d)", texto, perl = TRUE))[[1]]
  d <- gsub(" ", "", m)
  unique(d[nchar(d) %in% c(8, 12, 13, 14) & vapply(d, ean_valido, logical(1))])
}
