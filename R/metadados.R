# Remoção de metadados de fotos — R base puro, sem recompressão (sem perda).
#
# JPEG: mantém SOI, APP0 (JFIF), APP2 ICC_PROFILE (cores), tabelas e dados da imagem, sem tocar em um
# único byte dos pixels. Remove APP1 (Exif, XMP: GPS, aparelho, data/hora), APP2 MPF, APP3–APP15
# (ex.: APP10 "AROT" da Apple, APP13 IPTC), COM e tudo o que vier depois do EOI da imagem principal
# (imagens secundárias: mapa de ganho HDR, profundidade). Por padrão grava um Exif mínimo só com a tag
# Orientation, para a foto continuar em pé. PNG: remove tEXt/zTXt/iTXt/eXIf/tIME. Outros formatos: erro.

.comeca <- function(b, txt) {
  r <- charToRaw(txt); length(b) >= length(r) && identical(b[seq_along(r)], r)
}
.u16 <- function(b, i, le = FALSE) {
  v <- as.integer(b[c(i, i + 1L)])
  if (le) v[1] + 256L * v[2] else 256L * v[1] + v[2]
}
.u32 <- function(b, i, le = FALSE) {
  v <- as.numeric(as.integer(b[i:(i + 3L)]))
  if (le) v <- rev(v)
  ((v[1] * 256 + v[2]) * 256 + v[3]) * 256 + v[4]
}

# Lê as tags relevantes do bloco Exif (bytes do TIFF, começando em "II"/"MM").
.exif_resumo <- function(tiff) {
  if (length(tiff) < 8) return(list())
  le <- identical(rawToChar(tiff[1:2]), "II")
  ifd <- .u32(tiff, 5L, le) + 1
  if (ifd + 1 > length(tiff)) return(list())
  n <- .u16(tiff, ifd, le)
  out <- list()
  nomes <- c("0112" = "orientacao", "010f" = "fabricante", "0110" = "modelo", "0132" = "data_hora",
             "8825" = "gps", "8769" = "exif_sub", "0131" = "software")
  for (k in seq_len(n)) {
    e <- ifd + 2 + (k - 1) * 12
    if (e + 11 > length(tiff)) break
    tag <- sprintf("%04x", .u16(tiff, e, le))
    if (tag %in% names(nomes)) {
      out[[nomes[[tag]]]] <- if (tag == "0112") .u16(tiff, e + 8, le) else TRUE
    }
  }
  out
}

# Exif mínimo (big-endian) só com Orientation (tag 0x0112, SHORT, 1 valor).
.exif_so_orientacao <- function(orientacao) {
  corpo <- c(charToRaw("Exif"), as.raw(c(0, 0)),
             charToRaw("MM"), as.raw(c(0x00, 0x2a, 0, 0, 0, 8)),   # cabeçalho TIFF, IFD0 em 8
             as.raw(c(0x00, 0x01)),                                 # 1 entrada
             as.raw(c(0x01, 0x12, 0x00, 0x03, 0, 0, 0, 1)),         # tag, tipo SHORT, contagem 1
             as.raw(c(0x00, as.integer(orientacao), 0, 0)),         # valor + enchimento
             as.raw(c(0, 0, 0, 0)))                                 # sem próximo IFD
  len <- length(corpo) + 2L
  c(as.raw(c(0xff, 0xe1, len %/% 256L, len %% 256L)), corpo)
}

.jpeg_limpar <- function(b, manter_orientacao = TRUE, manter_icc = TRUE) {
  if (length(b) < 4 || b[1] != as.raw(0xff) || b[2] != as.raw(0xd8)) stop("n\u00e3o \u00e9 um JPEG")
  n <- length(b)
  manter <- list(b[1:2])
  removidos <- character()
  info <- list()
  i <- 3L
  while (i <= n - 3L) {
    if (b[i] != as.raw(0xff)) stop("JPEG malformado perto do byte ", i)
    m <- as.integer(b[i + 1L])
    if (m == 0xff) { i <- i + 1L; next }                   # enchimento entre marcadores
    if (m == 0xd9) break
    len <- .u16(b, i + 2L)
    seg <- b[i:(i + 1L + len)]
    sig <- b[(i + 4L):min(i + 15L, n)]
    assinatura <- rawToChar(sig[sig >= as.raw(0x20) & sig < as.raw(0x7f)])   # só ASCII imprimível
    if (m == 0xda) {                                       # SOS: daqui em diante, dados da imagem
      fim <- .jpeg_fim_dados(b, i + 2L + len)
      manter[[length(manter) + 1L]] <- b[i:fim]
      if (fim < n) removidos <- c(removidos, sprintf("%d bytes ap\u00f3s o fim da imagem", n - fim))
      break
    }
    descartar <- FALSE
    if (m == 0xe1) {
      descartar <- TRUE
      if (.comeca(sig, "Exif")) {
        resumo <- .exif_resumo(b[(i + 10L):(i + 1L + len)])
        info <- utils::modifyList(info, resumo)
        if (!identical(names(resumo), "orientacao")) removidos <- c(removidos, "Exif")  # não só o nosso Exif mínimo
      } else removidos <- c(removidos, if (grepl("adobe", assinatura, ignore.case = TRUE)) "XMP" else "APP1")
    } else if (m == 0xe2) {
      eh_icc <- .comeca(sig, "ICC_PROFILE")
      descartar <- !(eh_icc && manter_icc)
      if (descartar) removidos <- c(removidos, if (eh_icc) "ICC" else sprintf("APP2 %s", substr(assinatura, 1, 8)))
    } else if (m >= 0xe3 && m <= 0xef) {
      descartar <- TRUE; removidos <- c(removidos, sprintf("APP%d %s", m - 0xe0, substr(assinatura, 1, 4)))
    } else if (m == 0xfe) {
      descartar <- TRUE; removidos <- c(removidos, "coment\u00e1rio")
    }
    if (!descartar) manter[[length(manter) + 1L]] <- seg
    i <- i + 2L + len
  }
  saida <- do.call(c, manter)
  ori <- info$orientacao
  if (manter_orientacao && !is.null(ori) && ori %in% 2:8) {
    # insere o Exif mínimo logo após o APP0 (ou após o SOI, se não houver APP0)
    pos <- if (length(saida) > 4 && saida[3] == as.raw(0xff) && saida[4] == as.raw(0xe0)) 4L + .u16(saida, 5L) else 2L
    saida <- c(saida[1:pos], .exif_so_orientacao(ori), saida[(pos + 1L):length(saida)])
  }
  list(bytes = saida, removidos = unique(removidos), info = info)
}

# Fim dos dados entropicamente codificados (inclui scans progressivos): posição do último byte do EOI.
.jpeg_fim_dados <- function(b, inicio) {
  n <- length(b)
  ff <- which(b[inicio:(n - 1L)] == as.raw(0xff)) + inicio - 1L
  prox <- as.integer(b[ff + 1L])
  marcador <- ff[!(prox == 0x00 | (prox >= 0xd0 & prox <= 0xd7) | prox == 0xff)]
  j <- 1L
  while (j <= length(marcador)) {
    p <- marcador[j]; m <- as.integer(b[p + 1L])
    if (m == 0xd9) return(p + 1L)
    salto <- p + 2L + .u16(b, p + 2L)                      # segmento entre scans (DHT, SOS…)
    j <- which(marcador >= salto)[1]
    if (is.na(j)) break
  }
  n
}

.png_limpar <- function(b) {
  assin <- as.raw(c(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
  if (!identical(b[1:8], assin)) stop("n\u00e3o \u00e9 um PNG")
  manter <- list(b[1:8]); removidos <- character(); i <- 9L
  while (i < length(b)) {
    len <- .u32(b, i); tipo <- rawToChar(b[(i + 4L):(i + 7L)])
    fim <- i + 11L + len
    if (tipo %in% c("tEXt", "zTXt", "iTXt", "eXIf", "tIME")) removidos <- c(removidos, tipo)
    else manter[[length(manter) + 1L]] <- b[i:fim]
    i <- fim + 1L
    if (tipo == "IEND") break
  }
  list(bytes = do.call(c, manter), removidos = unique(removidos), info = list())
}

#' Remove metadata from photos without recompressing
#'
#' Removes GPS position, device, date and time, XMP, IPTC, comments and the extra images that phones
#' append (HDR gain map, depth) from JPEG files, and the text chunks from PNG files, without touching
#' a single byte of the pixels. By default keeps a minimal Exif with only the orientation, so the photo
#' stays upright, and the ICC colour profile.
#'
#' @param caminhos Files and/or folders (folders: every .jpg, .jpeg and .png inside).
#' @param destino `NULL` to overwrite in place, or an output folder.
#' @param manter_orientacao Write a minimal Exif with only the orientation?
#' @param manter_icc Keep the ICC colour profile? It identifies no one and preserves the colours.
#' @param recursivo Look inside subfolders?
#' @param silencioso Suppress the printed summary?
#' @return Invisibly, a data frame with one row per file: bytes before and after, what was removed and
#'   whether there was GPS.
#' @seealso [metadados_resumo()] to inspect a photo without changing it; [foto_exemplo()] for a
#'   synthetic photo with fake GPS to try it on; the command-line tool
#'   `tools/limpar_metadados.R`.
#' @examples
#' f <- foto_exemplo()                     # a synthetic photo with fake GPS
#' metadados_resumo(f)$gps
#' limpar_metadados(f, silencioso = TRUE)
#' is.null(metadados_resumo(f)$gps)
#' @export
limpar_metadados <- function(caminhos, destino = NULL, manter_orientacao = TRUE, manter_icc = TRUE,
                             recursivo = TRUE, silencioso = FALSE) {
  arqs <- unlist(lapply(caminhos, function(p) {
    if (dir.exists(p)) list.files(p, "\\.(jpe?g|png)$", full.names = TRUE, recursive = recursivo,
                                  ignore.case = TRUE)
    else p
  }))
  if (!is.null(destino)) dir.create(destino, showWarnings = FALSE, recursive = TRUE)
  linhas <- lapply(arqs, function(a) {
    b <- readBin(a, "raw", file.info(a)$size)
    r <- tryCatch(
      if (grepl("\\.png$", a, ignore.case = TRUE)) .png_limpar(b)
      else .jpeg_limpar(b, manter_orientacao, manter_icc),
      error = function(e) list(erro = conditionMessage(e)))
    if (!is.null(r$erro)) {
      return(data.frame(arquivo = a, antes = length(b), depois = NA_real_, gps = NA,
                        removidos = paste("ERRO:", r$erro)))
    }
    saida <- if (is.null(destino)) a else file.path(destino, basename(a))
    tmp <- paste0(saida, ".tmp")
    writeBin(r$bytes, tmp)
    file.rename(tmp, saida)                                # grava atomicamente
    data.frame(arquivo = a, antes = length(b), depois = length(r$bytes), gps = isTRUE(r$info$gps),
               removidos = paste(r$removidos, collapse = ", "))
  })
  res <- do.call(rbind, linhas)
  if (!silencioso && !is.null(res)) {
    for (k in seq_len(nrow(res))) {
      message(sprintf("%s: %s%s", basename(res$arquivo[k]),
                      if (isTRUE(res$gps[k])) "GPS removido; " else "",
                      if (nzchar(res$removidos[k])) res$removidos[k] else "nada a remover"))
    }
  }
  invisible(res)
}

#' Summarize the sensitive metadata of a photo
#'
#' Reads, without changing the file, the Exif tags that matter for privacy.
#'
#' @param caminho Path of a JPEG file.
#' @return A list with the elements present among `orientacao`, `fabricante`, `modelo`, `data_hora`,
#'   `gps`, `exif_sub` and `software`; an empty list for other formats.
#' @examples
#' str(metadados_resumo(foto_exemplo()))
#' @export
metadados_resumo <- function(caminho) {
  b <- readBin(caminho, "raw", file.info(caminho)$size)
  if (length(b) < 4 || b[1] != as.raw(0xff) || b[2] != as.raw(0xd8)) return(list())
  .jpeg_limpar(b)$info
}

#' Remove metadata from a photo in memory
#'
#' Used by the server on every upload before anything else (defence in depth: the browser already
#' sends a re-encoded copy without metadata).
#'
#' @param bytes A raw vector with a JPEG or PNG file.
#' @param manter_orientacao Keep a minimal Exif with only the orientation?
#' @return A raw vector with the cleaned file.
#' @examples
#' f <- foto_exemplo()
#' b <- readBin(f, "raw", file.info(f)$size)
#' length(limpar_metadados_raw(b)) < length(b)
#' @export
limpar_metadados_raw <- function(bytes, manter_orientacao = TRUE) {
  if (length(bytes) > 8 && identical(bytes[1:4], as.raw(c(0x89, 0x50, 0x4e, 0x47)))) .png_limpar(bytes)$bytes
  else .jpeg_limpar(bytes, manter_orientacao)$bytes
}
