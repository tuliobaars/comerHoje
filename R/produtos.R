# GTIN (barcode) -> ingredient: local cache (produtos, learned from scans) -> Open Food Facts.
#' Identify a product by its barcode
#'
#' Looks the GTIN up in the household's product cache and, if it is not there, in Open Food Facts
#' (when httr2 is installed), matching the product name to the catalog with [casar_ingrediente()].
#'
#' @param store A store created by [repo_sqlite()] or [repo_memoria()].
#' @param gtin A valid GTIN/EAN code.
#' @return A list with `ingrediente_id`, `descricao` and `fonte`; an empty list when not found.
#' @examples
#' \dontrun{
#' produto_por_gtin(repo_memoria(), "7891000100103")
#' }
#' @export
produto_por_gtin <- function(store, gtin) {
  if (!ean_valido(gtin)) stop("c\u00f3digo inv\u00e1lido")
  if (!is.null(store[["con"]])) {
    r <- DBI::dbGetQuery(store[["con"]], "SELECT ingrediente_id, descricao, fonte FROM produtos WHERE gtin = ?", params = list(gtin))
    if (nrow(r) && !is.na(r$ingrediente_id[1])) return(as.list(r[1, ]))
  }
  if (!requireNamespace("httr2", quietly = TRUE)) return(list())
  j <- tryCatch(httr2::request(sprintf("https://world.openfoodfacts.org/api/v2/product/%s.json", gtin)) |>
    httr2::req_url_query(fields = "product_name,product_name_pt,brands,quantity") |>
    httr2::req_user_agent("comerHoje - github.com (contato: comerhoje@example.org)") |> httr2::req_timeout(8) |>
    httr2::req_perform() |> httr2::resp_body_json(simplifyVector = FALSE), error = function(e) NULL)
  if (is.null(j) || !identical(as.integer(j$status), 1L)) return(list())
  nome <- .ou(j$product$product_name_pt, .ou(j$product$product_name, ""))
  ing <- casar_ingrediente(store, nome)
  if (!is.null(store[["con"]]) && !is.null(ing)) DBI::dbExecute(store[["con"]],
    "INSERT OR REPLACE INTO produtos (gtin, ingrediente_id, descricao, marca, fonte, atualizado_em) VALUES (?, ?, ?, ?, 'openfoodfacts', ?)",
    params = list(gtin, ing, nome, .ou(j$product$brands, NA), format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")))
  list(ingrediente_id = ing, descricao = nome, fonte = "Open Food Facts")
}
