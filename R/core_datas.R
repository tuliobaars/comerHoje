# Datas em rótulos: porta fiel de extrairDatas()/votarDatas() de srcjs/core/comerhoje-core.js.
# As duas implementações passam pelas MESMAS fixtures (tests/fixtures/golden_datas.json).

normalizar_ocr <- function(txt) {
  s <- gsub("\uff0c", ",", txt); s <- gsub("\uff0e", ".", s); s <- gsub("\uff1a", ":", s); s <- gsub("\uff0f", "/", s)
  s <- toupper(sem_acentos(s))
  s <- gsub("\\bVAL\\s*[JIL1|/\\\\]?\\s*LOTE", "VAL/LOTE", s, perl = TRUE)
  s <- gsub("(\\d)\\s*['`\u00b4\\\\|]\\s*(?=\\d)", "\\1/", s, perl = TRUE)
  s <- gsub("(?<=\\d)O(?=\\d)", "0", s, perl = TRUE)
  gsub("(?<=\\d)[IL](?=\\d)", "1", s, perl = TRUE)
}

data_valida <- function(a, m, d) {
  a <- suppressWarnings(as.integer(a)); m <- suppressWarnings(as.integer(m)); d <- suppressWarnings(as.integer(d))
  if (anyNA(c(a, m, d))) return(as.Date(NA))
  as.Date(sprintf("%04d-%02d-%02d", a, m, d), format = "%Y-%m-%d")
}
ultimo_dia_mes <- function(a, m) {
  m <- suppressWarnings(as.integer(m)); a <- suppressWarnings(as.integer(a))
  if (is.na(m) || is.na(a) || !m %in% 1:12) return(as.Date(NA))
  seq(data_valida(a, m, 1), by = "month", length.out = 2)[2] - 1
}
.ano4 <- function(a) if (nchar(a) == 2) 2000L + as.integer(a) else as.integer(a)

.MESES <- c(JAN = 1, FEV = 2, FEB = 2, MAR = 3, ABR = 4, APR = 4, MAI = 5, MAY = 5, JUN = 6, JUL = 7,
            AGO = 8, AUG = 8, SET = 9, SEP = 9, OUT = 10, OCT = 10, NOV = 11, DEZ = 12, DEC = 12)
.MES_RE <- paste(names(.MESES), collapse = "|")

.ANCORAS <- c(
  validade   = "\\b(VALIDADE|VALID|VAL|V[BRE8]L|VAI|VENCIMENTO|VENC|V(?=\\s*[:.]\\s*\\d)|CONSUMIR\\s+(PREFERENCIALMENTE\\s+)?(ATE|ANTES)|BEST\\s+BEFORE|EXP(IRY|IRA)?|SCAD(ENZA)?|DA\\s+CONSUMARSI)\\b",
  fabricacao = "\\b(FABRICACAO|FABRICADO|FABR|FAB|PRODUCAO|PROD|EMBALADO(\\s+EM)?|EMB|F(?=\\s*:))\\b",
  pesagem    = "\\bPESAG\\w*",
  lote       = "\\b(LOTE|LOT|L(?=\\s*:))\\b")

.PADROES <- list(
  list(formato = "AAAA-MM-DD", re = "(?<!\\d)(\\d{4})-(\\d{2})-(\\d{2})(?!\\d)", f = function(g) data_valida(g[1], g[2], g[3])),
  list(formato = "DD/MM/AAAA", re = "(?<!\\d)(\\d{1,2})[/.\\- ]{1,2}(\\d{1,2})[/.\\- ]{1,2}(\\d{4})(?!\\d)", f = function(g) data_valida(g[3], g[2], g[1])),
  list(formato = "DD/MM/AA", re = "(?<!\\d)(\\d{1,2})[/.\\-](\\d{1,2})[/.\\-](\\d{2})(?!\\d)", f = function(g) data_valida(2000L + as.integer(g[3]), g[2], g[1])),
  list(formato = "DD MMM AAAA", re = sprintf("(?<![A-Z\\d])(\\d{1,2})[/.\\- ]{0,2}(%s)[A-Z]*\\.?[/.\\- ]{0,2}(\\d{4}|\\d{2})(?!\\d)", .MES_RE),
       f = function(g) data_valida(.ano4(g[3]), .MESES[[g[2]]], g[1])),
  list(formato = "MMM/AAAA", fim_do_mes = TRUE, re = sprintf("(?<![A-Z\\d])(%s)[A-Z]*\\.?[/.\\- ]{0,2}(\\d{4}|\\d{2})(?!\\d)", .MES_RE),
       f = function(g) ultimo_dia_mes(.ano4(g[2]), .MESES[[g[1]]])),
  list(formato = "MM/AAAA", fim_do_mes = TRUE, re = "(?<![\\d/.\\-])(\\d{1,2})[/.\\-](\\d{4})(?![\\d/.\\-])", f = function(g) ultimo_dia_mes(g[2], g[1])),
  list(formato = "DDMMAAAA", compacto = TRUE, re = "(?<![\\d/.\\-])(?<!\\d:)(\\d{2})(\\d{2})(20\\d{2})(?![\\d/.\\-:])", f = function(g) data_valida(g[3], g[2], g[1])),
  list(formato = "DDMMAA", compacto = TRUE, re = "(?<![\\d/.\\-])(?<!\\d:)(\\d{2})(\\d{2})(\\d{2})(?=\\d{2}:\\d{2})", f = function(g) data_valida(2000L + as.integer(g[3]), g[2], g[1])),
  list(formato = "DDMMAA", compacto = TRUE, re = "(?<![\\d/.\\-])(?<!\\d:)(\\d{2})(\\d{2})(\\d{2})(?![\\d/.\\-:])", f = function(g) data_valida(2000L + as.integer(g[3]), g[2], g[1])),
  list(formato = "MMAAAA", compacto = TRUE, fim_do_mes = TRUE, so_ancorado = TRUE,
       re = "(?<![\\d/.\\-])(?<!\\d:)(0[1-9]|1[0-2])(20\\d{2})(?![\\d/.\\-:])", f = function(g) ultimo_dia_mes(g[2], g[1])))

.ancora_para <- function(linhas, i, col) {
  melhor <- NA_character_; melhor_fim <- -Inf
  for (tipo in names(.ANCORAS)) {
    m <- gregexpr(.ANCORAS[[tipo]], linhas[[i]], perl = TRUE)[[1]]
    if (m[1] == -1) next
    fim <- as.integer(m) + attr(m, "match.length")          # 1-based, exclusive (igual ao JS)
    ok <- fim <= col & col - fim <= 25
    if (any(ok) && max(fim[ok]) > melhor_fim) { melhor <- tipo; melhor_fim <- max(fim[ok]) }
  }
  if (!is.na(melhor) || i == 1) return(melhor)
  pos <- vapply(.ANCORAS, function(re) as.integer(regexpr(re, linhas[[i - 1]], perl = TRUE)), integer(1))
  pos <- pos[pos > 0]
  if (length(pos)) names(pos)[which.min(pos)] else NA_character_
}

#' Extract the expiry date from label text
#'
#' Reads every date in the OCR text of a label, in the formats printed in Brazil (19/01/2027,
#' 29 06 2027, 19.01.27, JAN/2027, 03/2027, 190127 and others), classifies each one by the nearest
#' anchor (VAL, VALIDADE, VENC, FAB, LOTE, PESAGEM) and picks the expiry date. Month-only dates mean
#' the last day of that month. This is a faithful port of the JavaScript core; both pass the same
#' fixtures.
#'
#' @param texto OCR text of the label.
#' @param hoje Reference date, used to discard implausible readings.
#' @return A list with `validade` (Date or `NA`), `confianca` (0 to 1), `trecho` (the snippet read),
#'   `fabricacao`, `pesagem` and `candidatos` (every date found).
#' @examples
#' extrair_datas("FAB 02/01/2026 VAL 19/01/2027 L 2301", hoje = as.Date("2026-06-01"))$validade
#' extrair_datas("VAL: 03/2027", hoje = as.Date("2026-06-01"))$validade
#' @export
extrair_datas <- function(texto, hoje = hoje_br()) {
  hoje <- as.Date(hoje)
  linhas <- strsplit(normalizar_ocr(texto), "\r?\n|\\s\\|\\s", perl = TRUE)[[1]]
  cand <- list()
  for (i in seq_along(linhas)) {
    ocupado <- matrix(numeric(0), ncol = 2)
    for (p in .PADROES) {
      m <- gregexpr(p$re, linhas[[i]], perl = TRUE)[[1]]
      if (m[1] == -1) next
      cs <- attr(m, "capture.start"); cl <- attr(m, "capture.length")
      for (k in seq_along(m)) {
        ini <- m[k]; fim <- ini + attr(m, "match.length")[k]
        if (nrow(ocupado) > 0 && any(ini < ocupado[, 2] & fim > ocupado[, 1])) next
        g <- substring(linhas[[i]], cs[k, ], cs[k, ] + cl[k, ] - 1)
        d <- tryCatch(suppressWarnings(p$f(g)), error = function(e) as.Date(NA))
        if (length(d) != 1 || is.na(d)) next
        anc <- .ancora_para(linhas, i, ini)
        if (isTRUE(p$so_ancorado) && !identical(anc, "validade")) next
        ocupado <- rbind(ocupado, c(ini, fim))
        if (identical(anc, "lote")) next
        cand[[length(cand) + 1]] <- list(data = d, formato = p$formato, trecho = trimws(substr(linhas[[i]], ini, fim - 1)),
          tipo = if (is.na(anc)) "desconhecido" else anc, compacto = isTRUE(p$compacto), fim_do_mes = isTRUE(p$fim_do_mes),
          dias = as.integer(d - hoje), sem_ancora = FALSE)
      }
    }
  }
  ok <- Filter(function(c) if (c$tipo %in% c("validade", "desconhecido")) c$dias >= -365 && c$dias <= 5 * 365
               else c$dias <= 1 && c$dias >= -5 * 365, cand)
  tipos <- vapply(ok, `[[`, "", "tipo")
  sem <- which(tipos == "desconhecido")
  if (length(sem) >= 2 && !"validade" %in% tipos) {
    dias <- vapply(ok[sem], `[[`, 0L, "dias"); o <- sem[order(dias)]
    ok[[o[length(o)]]]$tipo <- "validade"; ok[[o[length(o)]]]$sem_ancora <- TRUE
    if (ok[[o[1]]]$dias <= 1) ok[[o[1]]]$tipo <- "fabricacao"
  } else if (length(sem) == 1 && !"validade" %in% tipos && ok[[sem]]$dias >= 0) {
    ok[[sem]]$tipo <- "validade"; ok[[sem]]$sem_ancora <- TRUE
  }
  for (j in seq_along(ok)) {
    c <- ok[[j]]; conf <- 0.5
    if (c$tipo == "validade" && !c$sem_ancora) conf <- conf + 0.3
    if (c$sem_ancora) conf <- conf - 0.1
    if (grepl("AAAA", c$formato)) conf <- conf + 0.1
    if (c$compacto) conf <- conf - 0.15
    if (c$fim_do_mes) conf <- conf - 0.05
    ok[[j]]$confianca <- round(min(1, max(0, conf)), 2)
  }
  pega <- function(t) { x <- Filter(function(c) c$tipo == t, ok); if (length(x)) x[[1]]$data else as.Date(NA) }
  vals <- Filter(function(c) c$tipo == "validade", ok)
  if (length(vals)) vals <- vals[order(-vapply(vals, `[[`, 0, "confianca"))]   # order() é estável, como o sort do JS
  list(validade = if (length(vals)) vals[[1]]$data else as.Date(NA),
       confianca = if (length(vals)) vals[[1]]$confianca else 0,
       trecho = if (length(vals)) vals[[1]]$trecho else NA_character_,
       fabricacao = pega("fabricacao"), pesagem = pega("pesagem"), candidatos = ok)
}

#' Combine several readings of the same label
#'
#' The device reads each photo several times (whole picture, zoom around the anchor, dot-matrix
#' filter). This function weighs the readings by confidence and by the fidelity of each pass and
#' returns the winner, flagging a conflict when a rival date is close.
#'
#' @param leituras A list of readings as returned by [extrair_datas()], each optionally with a
#'   `peso` (fidelity weight, default 1).
#' @return A list with `validade`, `confianca`, `votos`, `fieis`, `alternativas` and `conflito`.
#' @examples
#' h <- as.Date("2026-06-01")
#' votar_datas(list(extrair_datas("VAL 19/01/2027", h), extrair_datas("VAL 19/01/2027", h),
#'                  extrair_datas("VAL 18/01/2027", h)))$validade
#' @export
votar_datas <- function(leituras) {
  leituras <- Filter(function(l) !is.null(l) && !is.na(l$validade), leituras)
  pega <- function(k, todas) { for (l in todas) if (!is.null(l[[k]]) && !is.na(l[[k]])) return(l[[k]]); as.Date(NA) }
  if (!length(leituras)) return(list(validade = as.Date(NA), confianca = 0, votos = 0L, alternativas = character()))
  chave <- vapply(leituras, function(l) format(l$validade), "")
  peso <- vapply(leituras, function(l) if (is.null(l$peso)) 1 else l$peso, 0)
  conf <- vapply(leituras, function(l) l$confianca, 0)
  u <- unique(chave)
  tab <- data.frame(data = u, soma = vapply(u, function(d) sum(conf[chave == d] * peso[chave == d]), 0),
                    maxP = vapply(u, function(d) max(conf[chave == d] * peso[chave == d]), 0),
                    max = vapply(u, function(d) max(conf[chave == d]), 0),
                    n = vapply(u, function(d) sum(chave == d), 0L), fieis = vapply(u, function(d) sum(chave == d & peso >= 1), 0L))
  tab <- tab[order(-tab$soma, -tab$maxP), ]
  a <- tab[1, ]
  cf <- min(1, a$max + 0.05 * (a$n - 1))
  rival <- nrow(tab) > 1 && any(tab$maxP[-1] >= 0.8 * a$maxP)
  if (rival) cf <- min(cf, 0.6)
  list(validade = as.Date(a$data), confianca = round(cf, 2), votos = a$n, fieis = a$fieis,
       alternativas = utils::head(tab$data[-1], 2), conflito = rival)
}
