# Google Sheet: durable mirror of the stock and the family's shared surface.
#
# Three ways in, by configuration (environment variables):
#   1. Apps Script of the sheet itself (RECOMMENDED: the owner deploys it once, no Google Cloud):
#        COMERHOJE_PLANILHA_SCRIPT = https://script.google.com/macros/s/.../exec
#        COMERHOJE_PLANILHA_TOKEN  = the password set in the script (Script properties)
#      Reads and writes. Code: inst/apps-script/Code.gs.
#   2. Link-shared sheet ("anyone with the link can view"), READ-ONLY:
#        COMERHOJE_PLANILHA_ID = the id in the URL. The tab is read as CSV (gviz). Restores stock on a
#        cold start (shinyapps.io) but does not write.
#   3. Service account (googlesheets4), optional: COMERHOJE_PLANILHA_ID + COMERHOJE_GSA_JSON_B64.
# The merge is three-way against the base of the last sync (sync_base), because a person editing the sheet
# does not update "atualizado_em" (see docs/ARCHITECTURE.md §11).

ABA_CAMPOS <- c("id", "item", "ingrediente_id", "quantidade", "unidade", "local", "validade", "aberto_em",
                "validade_efetiva", "preco_total", "atualizado_em", "excluido")
SYNC_CAMPOS <- c("item", "quantidade", "unidade", "local", "validade", "aberto_em", "preco_total", "excluido")

.planilha_configurada <- function() nzchar(Sys.getenv("COMERHOJE_PLANILHA_SCRIPT")) || nzchar(Sys.getenv("COMERHOJE_PLANILHA_ID"))
.planilha_descricao <- function() {
  if (nzchar(Sys.getenv("COMERHOJE_PLANILHA_SCRIPT"))) "Apps Script (leitura e grava\u00e7\u00e3o)"
  else if (nzchar(Sys.getenv("COMERHOJE_GSA_JSON_B64")) && nzchar(Sys.getenv("COMERHOJE_PLANILHA_ID"))) "conta de servi\u00e7o"
  else if (nzchar(Sys.getenv("COMERHOJE_PLANILHA_ID"))) "link p\u00fablico (somente leitura)"
  else NULL
}

#' Parse numbers written the Brazilian way
#'
#' Accepts "1,5", "1.234,56" and also "1.5" (as typed in a spreadsheet).
#'
#' @param x A character vector.
#' @return A numeric vector (`NA` where there is no number).
#' @examples
#' parse_num_br(c("1,5", "1.234,56", "1.5", ""))
#' @export
parse_num_br <- function(x) {
  x <- trimws(as.character(x)); x[is.na(x) | x == ""] <- NA
  v <- ifelse(grepl(",", x, fixed = TRUE), gsub(",", ".", gsub(".", "", x, fixed = TRUE), fixed = TRUE), x)
  suppressWarnings(as.numeric(gsub("[^0-9.+-]", "", v)))
}
#' Parse dates from the Google Sheet
#'
#' Accepts dd/mm/aaaa, AAAA-MM-DD and the serial numbers of Google Sheets (days since 1899-12-30).
#'
#' @param x A character vector.
#' @return A character vector of AAAA-MM-DD dates (`NA` where there is no date).
#' @examples
#' parse_data_br(c("19/01/2027", "2027-01-19", "46406"))
#' @export
parse_data_br <- function(x) {
  x <- trimws(as.character(x)); out <- rep(NA_character_, length(x))
  br <- grepl("^\\d{1,2}/\\d{1,2}/\\d{4}$", x); out[br] <- format(as.Date(x[br], format = "%d/%m/%Y"))
  iso <- grepl("^\\d{4}-\\d{2}-\\d{2}", x); out[iso] <- substr(x[iso], 1, 10)
  ser <- grepl("^\\d{5}(\\.\\d+)?$", x); out[ser] <- format(as.Date(floor(as.numeric(x[ser])), origin = "1899-12-30"))
  out
}

.normalizar_linha <- function(r) {
  r$quantidade <- parse_num_br(.ou(r$quantidade, NA))
  r$preco_total <- { p <- parse_num_br(.ou(r$preco_total, NA)); if (is.na(p)) NULL else p }
  r$validade <- { v <- parse_data_br(.ou(r$validade, "")); if (is.na(v)) "" else v }
  r$aberto_em <- { v <- parse_data_br(.ou(r$aberto_em, "")); if (is.na(v)) "" else v }
  r$excluido <- if (grepl("^(1|true|verdadeiro|sim)$", tolower(as.character(.ou(r$excluido, ""))))) 1L else 0L
  if (is.null(r$id) || !nzchar(r$id)) r$id <- .uuid()
  r
}
.uuid <- function() { h <- sprintf("%08x%08x%08x%08x", sample.int(2^31 - 1, 1), sample.int(2^31 - 1, 1), sample.int(2^31 - 1, 1), sample.int(2^31 - 1, 1))
  paste(substr(h, 1, 8), substr(h, 9, 12), paste0("4", substr(h, 14, 16)), paste0("a", substr(h, 18, 20)), substr(h, 21, 32), sep = "-") }

#' Sheet row from a lot (same columns as linhaDeLote in srcjs/app/80-extras.js)
#' @noRd
linha_de_lote <- function(l, catalogo = .catalogo()) {
  ing <- Filter(function(g) g$id == l$ingrediente_id, catalogo$ingredientes)
  g <- if (length(ing)) ing[[1]] else list(nome = l$ingrediente_id, unidade_base = "un")
  gl <- list(validade_padrao_dias = as.integer(.ou(g$validade_padrao_dias, 7)), aberto_dias = suppressWarnings(as.integer(.ou(g$aberto_dias, NA))))
  list(id = l$id, item = g$nome, ingrediente_id = l$ingrediente_id, quantidade = as.numeric(l$quantidade), unidade = g$unidade_base,
       local = l$local, validade = .ou(l$validade, ""), aberto_em = .ou(l$aberto_em, ""), validade_efetiva = .ou(validade_efetiva(l, gl), ""),
       preco_total = .ou(l$preco_total, ""), atualizado_em = .ou(l$atualizado_em, ""),
       excluido = if (isTRUE(as.integer(.ou(l$excluido, 0)) == 1L) || !identical(.ou(l$status, "ativo"), "ativo")) 1L else 0L)
}

# ---------- clients (list(ler, gravar)) ----------
.planilha_cliente <- function() {
  url <- Sys.getenv("COMERHOJE_PLANILHA_SCRIPT"); id <- Sys.getenv("COMERHOJE_PLANILHA_ID")
  if (nzchar(url)) {
    if (!requireNamespace("httr2", quietly = TRUE)) stop("instale o pacote httr2 para usar o Apps Script")
    token <- Sys.getenv("COMERHOJE_PLANILHA_TOKEN")
    return(list(
      ler = function() {
        r <- httr2::request(url) |> httr2::req_url_query(acao = "ler", token = token) |> httr2::req_timeout(30) |>
          httr2::req_retry(max_tries = 3) |> httr2::req_perform() |> httr2::resp_body_json(simplifyVector = FALSE, check_type = FALSE)
        if (!isTRUE(r$ok)) stop("planilha: ", .ou(r$erro, "erro"))
        list(revisao = r$revisao, linhas = .ou(r$abas$estoque, list()))
      },
      gravar = function(linhas, revisao) {
        corpo <- list(acao = "gravar", token = token, aba = "estoque", campos = ABA_CAMPOS, linhas = linhas, revisao_esperada = revisao)
        r <- httr2::request(url) |> httr2::req_body_raw(as.character(jsonlite::toJSON(corpo, auto_unbox = TRUE, null = "null", na = "null")), type = "text/plain") |>
          httr2::req_timeout(60) |> httr2::req_perform() |> httr2::resp_body_json(simplifyVector = FALSE, check_type = FALSE)
        if (!isTRUE(r$ok)) stop("planilha: ", .ou(r$erro, "erro ao gravar"))
        r$revisao
      }))
  }
  if (nzchar(id) && nzchar(Sys.getenv("COMERHOJE_GSA_JSON_B64")) && requireNamespace("googlesheets4", quietly = TRUE)) {
    arq <- tempfile(fileext = ".json"); writeBin(jsonlite::base64_dec(Sys.getenv("COMERHOJE_GSA_JSON_B64")), arq)
    googlesheets4::gs4_auth(path = arq, scopes = "https://www.googleapis.com/auth/spreadsheets"); unlink(arq)
    return(list(
      ler = function() { df <- googlesheets4::read_sheet(id, sheet = "estoque", col_types = "c")
        list(revisao = NA, linhas = lapply(seq_len(nrow(df)), function(i) as.list(df[i, , drop = FALSE]))) },
      gravar = function(linhas, revisao) { df <- do.call(rbind, lapply(linhas, function(l) as.data.frame(lapply(l[ABA_CAMPOS], function(v) if (is.null(v)) NA else v))))
        googlesheets4::range_write(id, df, sheet = "estoque", range = "A1", reformat = FALSE); NA }))
  }
  if (nzchar(id)) {
    return(list(
      ler = function() {
        u <- sprintf("https://docs.google.com/spreadsheets/d/%s/gviz/tq?tqx=out:csv&sheet=estoque", utils::URLencode(id, reserved = TRUE))
        df <- utils::read.csv(url(u, method = "libcurl"), colClasses = "character", check.names = FALSE, encoding = "UTF-8")
        list(revisao = NA, linhas = lapply(seq_len(nrow(df)), function(i) as.list(df[i, , drop = FALSE])))
      },
      gravar = NULL))
  }
  NULL
}

#' Sync the stock with the Google Sheet
#'
#' Reads the sheet, merges it three ways with the local stock ([mesclar_3vias()]), applies the rows
#' that came from the sheet as ordinary operations, writes the result back (when the connection can
#' write) and records the new sync base. The connection is chosen from environment variables: an
#' Apps Script web app of the sheet itself (`COMERHOJE_PLANILHA_SCRIPT` and
#' `COMERHOJE_PLANILHA_TOKEN`, read and write), a link-shared sheet (`COMERHOJE_PLANILHA_ID`, read
#' only) or a service account (`COMERHOJE_GSA_JSON_B64`, with googlesheets4).
#'
#' @param store A store created by [repo_sqlite()] or [repo_memoria()].
#' @param cliente A connection: a list with the functions `ler()` and, optionally,
#'   `gravar(linhas, revisao)`. Defaults to the one configured by the environment; `NULL` when none is.
#' @param agora Timestamp of this sync (ISO, UTC).
#' @return A list with `ok`, `recebidos`, `enviados`, `conflitos` and `mensagem` (for the interface).
#' @examples
#' st <- repo_memoria()
#' planilha <- list(ler = function() list(revisao = 1, linhas = list(
#'   list(id = "p1", item = "Pinhão", quantidade = "500", validade = "30/06/2026"))),
#'   gravar = function(linhas, revisao) revisao + 1)
#' sincronizar_planilha(st, planilha)$mensagem
#' @export
sincronizar_planilha <- function(store, cliente = .planilha_cliente(), agora = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")) {
  if (is.null(cliente)) return(list(ok = FALSE, mensagem = "Planilha n\u00e3o configurada no servidor."))
  remoto_raw <- cliente$ler()
  remoto <- lapply(remoto_raw$linhas, .normalizar_linha)
  remoto <- Filter(function(r) !is.null(r$item) && nzchar(r$item), remoto)
  E <- store$estado()
  local <- lapply(E$lotes, linha_de_lote)
  acoes <- mesclar_3vias(local, remoto, store$sync_base("estoque"), SYNC_CAMPOS)
  por_id <- stats::setNames(remoto, vapply(remoto, `[[`, "", "id"))
  n_rec <- 0L
  for (id in c(acoes$pull, acoes$conflito_remoto)) {
    x <- por_id[[id]]
    ing <- if (!is.null(x$ingrediente_id) && nzchar(x$ingrediente_id)) x$ingrediente_id else casar_ingrediente(store, x$item)
    if (is.null(ing) || is.na(ing)) next
    op <- if (identical(x$excluido, 1L)) list(id = .uuid(), op = "lote.excluir", args = list(id = id), t = agora)
      else list(id = .uuid(), op = "lote.salvar", t = agora, args = list(lote = list(id = id, ingrediente_id = ing, descricao = x$item,
        quantidade = .ou(x$quantidade, 0), local = .ou(x$local, "geladeira"), validade = if (nzchar(x$validade)) x$validade else NULL,
        aberto_em = if (nzchar(x$aberto_em)) x$aberto_em else NULL, preco_total = x$preco_total, origem = "planilha",
        validade_origem = if (nzchar(x$validade)) "usuario" else "estimada", data_compra = format(hoje_br()))))
    tryCatch({ aplicar_op_unica(store, op); n_rec <- n_rec + 1L }, error = function(e) NULL)
  }
  for (id in acoes$excluir_local) aplicar_op_unica(store, list(id = .uuid(), op = "lote.excluir", args = list(id = id), t = agora))
  final <- lapply(store$estado()$lotes, linha_de_lote)
  if (!is.null(cliente$gravar)) cliente$gravar(final, remoto_raw$revisao)
  store$sync_base_gravar("estoque", lapply(final, function(l) list(id = l$id, hash = fnv1a(.canonico(l, SYNC_CAMPOS)))))
  aplicar_op(store, list(id = .uuid(), op = "config.salvar", args = list(chave = "ultima_sync", valor = agora), t = agora))
  list(ok = TRUE, recebidos = n_rec, enviados = if (is.null(cliente$gravar)) 0L else length(acoes$push), conflitos = length(acoes$conflito_remoto),
       mensagem = sprintf("Planilha sincronizada: %d recebidos, %d enviados%s.", n_rec, if (is.null(cliente$gravar)) 0L else length(acoes$push),
                          if (length(acoes$conflito_remoto)) sprintf(", %d conflitos (valeu a planilha)", length(acoes$conflito_remoto)) else ""))
}

#' Match free text to an ingredient of the catalog
#'
#' Used for receipt lines, sheet rows and product names: exact match of the normalized text against
#' names, synonyms and learned terms, then the longest synonym contained in the text. Portuguese
#' particles are ignored ("MOLHO TOMATE" matches "molho de tomate").
#'
#' @param store A store; with [repo_sqlite()] the learned synonyms of the household are used too.
#' @param texto Free text.
#' @return An ingredient id, or `NULL`.
#' @examples
#' casar_ingrediente(repo_memoria(), "AIPIM DESC. KG")
#' casar_ingrediente(repo_memoria(), "bergamota")
#' @export
casar_ingrediente <- function(store, texto) {
  t <- sem_particulas(normalizar_termo(texto)); if (!nzchar(t)) return(NULL)
  if (!is.null(store[["con"]])) {
    r <- DBI::dbGetQuery(store[["con"]], "SELECT ingrediente_id, sinonimo_norm FROM ingrediente_sinonimos")
  } else {
    cat <- .catalogo()
    r <- do.call(rbind, lapply(cat$ingredientes, function(g) { s <- unique(normalizar_termo(c(g$nome, strsplit(.ou(g$sinonimos, ""), ";")[[1]])))
      data.frame(ingrediente_id = g$id, sinonimo_norm = s[nzchar(s)]) }))
  }
  r$sinonimo_norm <- sem_particulas(r$sinonimo_norm); r <- r[nzchar(r$sinonimo_norm), ]
  exato <- r$ingrediente_id[r$sinonimo_norm == t]
  if (length(exato)) return(exato[1])
  contem <- r[vapply(r$sinonimo_norm, function(s) grepl(paste0("(^| )", s, "( |$)"), t), logical(1)), ]
  if (nrow(contem)) return(contem$ingrediente_id[which.max(nchar(contem$sinonimo_norm))])
  NULL
}
