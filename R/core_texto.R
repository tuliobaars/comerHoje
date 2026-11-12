# Texto: normalização sem depender do locale/iconv do servidor (iconv TRANSLIT varia entre
# plataformas; no webR vira "*"). Mapa explícito de acentos do português.
.DE <- "\u00e1\u00e0\u00e2\u00e3\u00e4\u00e9\u00e8\u00ea\u00eb\u00ed\u00ec\u00ee\u00ef\u00f3\u00f2\u00f4\u00f5\u00f6\u00fa\u00f9\u00fb\u00fc\u00e7\u00f1\u00c1\u00c0\u00c2\u00c3\u00c4\u00c9\u00c8\u00ca\u00cb\u00cd\u00cc\u00ce\u00cf\u00d3\u00d2\u00d4\u00d5\u00d6\u00da\u00d9\u00db\u00dc\u00c7\u00d1"
.PARA <- "aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN"

sem_acentos <- function(x) chartr(.DE, .PARA, enc2utf8(as.character(x)))

#' Normalize a term for matching
#'
#' Lower case, without Portuguese accents, only letters and digits, single spaces. Does not depend on
#' the server's locale or iconv.
#'
#' @param x A character vector.
#' @return A character vector of the same length.
#' @examples
#' normalizar_termo("Feijão-fradinho")
#' @export
normalizar_termo <- function(x) {
  x <- tolower(sem_acentos(x))
  x <- gsub("[^a-z0-9]+", " ", x)
  trimws(gsub(" +", " ", x))
}

# for matching: without Portuguese particles (receipts write "MOLHO TOMATE" for "molho de tomate")
sem_particulas <- function(x) {
  r <- paste0(" ", x, " ")
  for (k in 1:2) r <- gsub(" (de|da|do|das|dos|d|com|em|e|a|o|para) ", " ", r, perl = TRUE)
  trimws(gsub(" +", " ", r))
}
