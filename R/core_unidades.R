# Units: same contract as converterParaBase() in the JS core.
.catalogo <- local({ cache <- NULL; function() {
  if (is.null(cache)) cache <<- jsonlite::fromJSON(system.file("extdata", "catalogo.json", package = "comerHoje"), simplifyVector = FALSE)
  cache } })

#' Convert a quantity to the ingredient's base unit
#'
#' Uses the ingredient-specific conversions of the catalog first (for example, one "dente" of garlic),
#' then the generic mass, volume and count units. Qualitative units ("a gosto") convert to zero.
#'
#' @param qtd Quantity.
#' @param unidade Unit code of the catalog (for example `"kg"`, `"xicara"`, `"colher_sopa"`).
#' @param ingrediente_id Ingredient id of the catalog.
#' @param catalogo The catalog (defaults to the one shipped in the package).
#' @return The quantity in grams, millilitres or units. Errors when there is no conversion.
#' @examples
#' converter_para_base(1.5, "kg", "arroz_branco")
#' @export
converter_para_base <- function(qtd, unidade, ingrediente_id, catalogo = .catalogo()) {
  ing <- Filter(function(g) g$id == ingrediente_id, catalogo$ingredientes)[[1]]
  conv <- Filter(function(c) c$ingrediente_id == ingrediente_id && c$unidade == unidade, catalogo$conversoes)
  if (length(conv)) return(qtd * as.numeric(conv[[1]]$qtd_base))
  uni <- stats::setNames(catalogo$unidades, vapply(catalogo$unidades, `[[`, "", "codigo"))
  u <- uni[[unidade]]; b <- uni[[ing$unidade_base]]
  if (is.null(u)) stop("unidade desconhecida: ", unidade)
  if (u$tipo == "qualitativa") return(0)
  if (u$tipo == b$tipo) return(qtd * as.numeric(u$fator_base) / as.numeric(b$fator_base))
  stop(sprintf("sem convers\u00e3o de %s para %s (%s)", unidade, ing$unidade_base, ingrediente_id))
}
