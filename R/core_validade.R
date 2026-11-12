# Validade efetiva e "hoje" no fuso da casa (servidores rodam em UTC).

#' Today in the household's time zone
#'
#' Servers usually run in UTC, so after 21:00 in Brazil their date is already tomorrow. All "days
#' left" computations use this date instead.
#'
#' @param tz Time zone; defaults to the `COMERHOJE_TZ` environment variable or `America/Sao_Paulo`
#'   (Brazil has had no daylight saving time since 2019).
#' @return A `Date`.
#' @examples
#' hoje_br()
#' @export
hoje_br <- function(tz = Sys.getenv("COMERHOJE_TZ", "America/Sao_Paulo")) as.Date(format(Sys.time(), "%Y-%m-%d", tz = tz))

somar_dias <- function(d, n) format(as.Date(d) + n)

#' Effective expiry date of a lot
#'
#' The earliest of the label date (or, without it, the purchase date plus the catalog default) and
#' the date it was opened plus the days it lasts once open.
#'
#' @param lote A lot: a list with `validade`, `data_compra` and `aberto_em` (AAAA-MM-DD or `NULL`).
#' @param ing The ingredient: a list with `validade_padrao_dias` and `aberto_dias`.
#' @return A date as AAAA-MM-DD text, or `NA`.
#' @examples
#' validade_efetiva(list(validade = "2027-01-19", aberto_em = "2026-06-01"),
#'                  list(validade_padrao_dias = 90, aberto_dias = 5))
#' @export
validade_efetiva <- function(lote, ing) {
  v <- if (!is.null(lote$validade) && !is.na(lote$validade) && nzchar(lote$validade)) as.Date(lote$validade) else as.Date(NA)
  if (is.na(v) && !is.null(lote$data_compra) && !is.na(lote$data_compra) && !is.null(ing$validade_padrao_dias))
    v <- as.Date(lote$data_compra) + as.integer(ing$validade_padrao_dias)
  if (!is.null(lote$aberto_em) && !is.na(lote$aberto_em) && nzchar(lote$aberto_em) && !is.null(ing$aberto_dias) && !is.na(ing$aberto_dias)) {
    a <- as.Date(lote$aberto_em) + as.integer(ing$aberto_dias)
    if (is.na(v) || a < v) v <- a
  }
  if (is.na(v)) NA_character_ else format(v)
}

faixa_validade <- function(dias) {
  if (is.null(dias) || is.na(dias)) "sem" else if (dias < 0) "vencido" else if (dias <= 3) "urgente" else if (dias <= 7) "atencao" else "ok"
}
