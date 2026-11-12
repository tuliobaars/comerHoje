# NFC-e from Santa Catarina (SEFAZ-SC, cUF 42). The consumer photographs the QR code; the app reads the
# access key on the device and the SERVER fetches the public consultation page (the browser cannot,
# because of CORS), then parses the items.
# [to verify] The parser targets the common public-consultation layout (table "tabResult", spans
# txtTit / Rqtd / RUN / RvlUnit / valor) and falls back to a generic reading. Confirm with real SC
# receipts (tests/fixtures/nfce/); until then, failures degrade to "open the receipt / add by hand".

NFCE_SC_CONSULTA <- "https://sat.sef.sc.gov.br/nfce/consulta"

#' Read the items of a Santa Catarina NFC-e receipt
#'
#' Takes the text of the receipt's QR code, checks the access key and fetches the public consultation
#' page of SEFAZ-SC (the browser cannot, because of CORS), then parses the items. Only addresses under
#' `sef.sc.gov.br` are fetched. The parser targets the common public layout and must be confirmed with
#' real receipts; failures degrade to adding the items by hand.
#'
#' @param url_ou_chave Text of the QR code (URL) or the 44-digit access key.
#' @param html Optional HTML of the page, to parse without going to the network (tests).
#' @return A list with `chave`, `uf`, `numero`, `emitente`, `itens` (see [nfce_itens_html()]) and
#'   `n`.
#' @examples
#' \dontrun{
#' nfce_sc_consultar("https://sat.sef.sc.gov.br/nfce/consulta?p=4224...|2|1|1|...")
#' }
#' @export
nfce_sc_consultar <- function(url_ou_chave, html = NULL) {
  info <- chave_nfce(url_ou_chave)
  if (is.null(info)) stop("QR code sem chave de acesso de 44 d\u00edgitos")
  if (!info$valida) stop("chave de acesso com d\u00edgito verificador inv\u00e1lido")
  if (!identical(info$uf, "SC")) warning("nota de ", info$uf, ", n\u00e3o de Santa Catarina")
  if (is.null(html)) {
    url <- if (grepl("^https?://", url_ou_chave)) url_ou_chave else paste0(NFCE_SC_CONSULTA, "?p=", info$chave)
    if (!grepl("^https://([a-z0-9-]+\\.)*sef\\.sc\\.gov\\.br/", url) && identical(info$uf, "SC"))
      stop("endere\u00e7o do QR code n\u00e3o \u00e9 da SEFAZ-SC: ", url)                   # never fetch arbitrary URLs
    html <- .buscar_html(url)
  }
  itens <- nfce_itens_html(html)
  emit <- regmatches(html, regexec('(?s)id="u20"[^>]*>\\s*([^<]+)<', html, perl = TRUE))[[1]]
  list(chave = info$chave, uf = info$uf, numero = info$numero, emitente = if (length(emit)) trimws(emit[2]) else NULL,
       itens = itens, n = length(itens))
}

.buscar_html <- function(url) {
  if (requireNamespace("httr2", quietly = TRUE)) {
    r <- httr2::request(url) |> httr2::req_user_agent("comerHoje (consulta de NFC-e do consumidor)") |>
      httr2::req_timeout(25) |> httr2::req_retry(max_tries = 2) |> httr2::req_perform()
    return(httr2::resp_body_string(r, encoding = "UTF-8"))
  }
  paste(readLines(url(url, method = "libcurl"), warn = FALSE, encoding = "UTF-8"), collapse = "\n")
}

#' Parse the items of an NFC-e consultation page
#'
#' Tolerant parser: reads the usual item spans of the public page and falls back to a line-based
#' reading of the text.
#'
#' @param html HTML of the page as one string.
#' @return A list of items, each a list with `descricao`, `quantidade`, `unidade`, `valor_unitario`
#'   and `valor`.
#' @examples
#' html <- paste0('<span class="txtTit">LEITE UHT INTEGRAL 1L</span>',
#'                '<span class="Rqtd">Qtde.:2</span><span class="RUN">UN: UN</span>',
#'                '<span class="RvlUnit">Vl. Unit.:4,99</span><span class="valor">9,98</span>')
#' str(nfce_itens_html(html))
#' @export
nfce_itens_html <- function(html) {
  limpa <- function(x) trimws(gsub("&nbsp;|\u00a0", " ", gsub("<[^>]+>", " ", x)))
  num <- function(x) parse_num_br(gsub("[^0-9,.]", "", x))
  blocos <- regmatches(html, gregexpr('(?s)<span class="txtTit[^"]*">.*?<span class="valor">[^<]*</span>', html, perl = TRUE))[[1]]
  itens <- lapply(blocos, function(b) {
    pega <- function(cls) { m <- regmatches(b, regexec(sprintf('(?s)<span class="%s">(.*?)</span>', cls), b, perl = TRUE))[[1]]; if (length(m)) limpa(m[2]) else NA }
    list(descricao = pega("txtTit[^\"]*"), quantidade = num(sub(".*?:", "", pega("Rqtd"))), unidade = toupper(trimws(sub(".*?:", "", pega("RUN")))),
         valor_unitario = num(sub(".*?:", "", pega("RvlUnit"))), valor = num(pega("valor")))
  })
  itens <- Filter(function(i) !is.na(i$descricao) && nzchar(i$descricao), itens)
  if (length(itens)) return(itens)
  # fallback: "DESCRIÇÃO ... Qtde.: 1,482 UN: KG Vl. Unit.: 30,90 ... 14,89"
  txt <- limpa(gsub("(?i)<br\\s*/?>|</tr>|</li>", "\n", html, perl = TRUE))
  linhas <- strsplit(txt, "\n")[[1]]
  m <- regmatches(linhas, regexec("^\\s*(.+?)\\s+\\(C[o\u00f3]digo:.*?Qtde\\.?:\\s*([0-9.,]+)\\s+UN:\\s*(\\w+).*?Unit\\.?:\\s*([0-9.,]+)\\s+.*?([0-9.,]+)\\s*$", linhas, perl = TRUE))
  Filter(Negate(is.null), lapply(m, function(x) if (length(x) == 6) list(descricao = x[2], quantidade = num(x[3]), unidade = toupper(x[4]),
                                                                      valor_unitario = num(x[5]), valor = num(x[6])) else NULL))
}
