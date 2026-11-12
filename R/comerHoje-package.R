#' comerHoje: a waste-minimizing kitchen for Brazilian households
#'
#' Records every package with its own expiry date (read on the device from a photo of the label),
#' warns about what expires first, suggests meals that use those items and mirrors the stock and the
#' shopping list in a Google Sheet owned by the household.
#'
#' One front end (`srcjs/`), three deliveries:
#'
#' - the Shiny app, with the household's data in SQLite: [run_app()], [comerhoje_app()];
#' - a Quarto document with the app embedded: [export_quarto()], [quarto_block()];
#' - a standalone HTML file that works offline: [export_html()].
#'
#' Photos: [limpar_metadados()] removes GPS and other metadata without recompressing.
#'
#' @keywords internal
"_PACKAGE"

utils::globalVariables(c("x", "u", "b", "r", "s", "l", "i"))   # ompr (non-standard evaluation)
