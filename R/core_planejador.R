# Planejador guloso FEFO (primeiro o que vence antes): porta de planejarGuloso() do JS. É o plano
# "no aparelho" e o fallback do MILP no servidor. Fixture: tests/fixtures/golden_planner.json.

#' Plan meals greedily, first-expiring first
#'
#' For each meal slot, chooses the recipe that best covers its ingredients with what is in stock,
#' rewarding the lots that expire soonest, and lists what must be bought. This is the plan computed
#' on the device, and the server's fallback when the MILP solver is not installed.
#'
#' @param lotes A list of lots, each a list with `id`, `ingrediente`, `qtd` (base unit) and
#'   `validade_efetiva` (AAAA-MM-DD).
#' @param receitas A list of recipes, each a list with `id` and `ingredientes` (a list of lists with
#'   `id` and `qtd`, in base units).
#' @param slots A list of meal slots, each a list with `id` and `data`.
#' @param peso_urgencia Weight of the urgency of the lots used.
#' @param cobertura_min Minimum share of a recipe that must be covered by the stock.
#' @param sem_repetir A recipe is not repeated within this many slots.
#' @return A list with `plano` (one entry per slot), `compras` (quantities to buy, by ingredient) and
#'   `metodo` (`"guloso"`).
#' @examples
#' lotes <- list(list(id = "L1", ingrediente = "nhoque", qtd = 500, validade_efetiva = "2026-06-03"))
#' receitas <- list(list(id = "nhoque_ao_sugo", ingredientes = list(list(id = "nhoque", qtd = 250))))
#' slots <- list(list(id = "s1", data = "2026-06-01"), list(id = "s2", data = "2026-06-02"))
#' planejar_guloso(lotes, receitas, slots, sem_repetir = 0)$plano[[1]]$receita
#' @export
planejar_guloso <- function(lotes, receitas, slots, peso_urgencia = 5, cobertura_min = 0.5, sem_repetir = 2) {
  estoque <- lotes
  plano <- list(); compras <- list()
  urg <- function(d) if (d < 0) 0 else 1 / (1 + d)
  for (si in seq_along(slots)) {
    d_slot <- as.Date(slots[[si]]$data); melhor <- NULL
    recentes <- vapply(utils::tail(plano, sem_repetir), function(p) if (is.null(p$receita)) "" else p$receita, "")
    for (r in receitas) {
      if (r$id %in% recentes) next
      cobertura <- 0; u <- 0; uso <- list()
      for (ing in r$ingredientes) {
        falta <- ing$qtd
        idx <- which(vapply(estoque, function(l) l$ingrediente == ing$id && l$qtd > 0 && !is.na(l$validade_efetiva) &&
                               as.Date(l$validade_efetiva) >= d_slot, logical(1)))
        idx <- idx[order(vapply(estoque[idx], `[[`, "", "validade_efetiva"))]
        for (k in idx) {
          if (falta <= 0) break
          q <- min(falta, estoque[[k]]$qtd); falta <- falta - q
          uso[[length(uso) + 1]] <- list(k = k, lote = estoque[[k]]$id, q = q)
          u <- u + (q / ing$qtd) * urg(as.integer(as.Date(estoque[[k]]$validade_efetiva) - d_slot))
        }
        cobertura <- cobertura + (ing$qtd - falta) / ing$qtd
      }
      cobertura <- cobertura / length(r$ingredientes)
      score <- cobertura + peso_urgencia * u
      if (cobertura >= cobertura_min && (is.null(melhor) || score > melhor$score + 1e-9))
        melhor <- list(r = r, score = score, uso = uso, cobertura = cobertura)
    }
    if (is.null(melhor)) { plano[[si]] <- list(slot = slots[[si]]$id, receita = NULL); next }
    for (x in melhor$uso) estoque[[x$k]]$qtd <- estoque[[x$k]]$qtd - x$q
    for (ing in melhor$r$ingredientes) {
      usado <- sum(vapply(melhor$uso, function(x) if (estoque[[x$k]]$ingrediente == ing$id) x$q else 0, 0))
      if (ing$qtd - usado > 1e-9) compras[[ing$id]] <- (if (is.null(compras[[ing$id]])) 0 else compras[[ing$id]]) + (ing$qtd - usado)
    }
    plano[[si]] <- list(slot = slots[[si]]$id, receita = melhor$r$id, score = round(melhor$score, 3),
                        cobertura = round(melhor$cobertura, 2), uso = lapply(melhor$uso, function(x) list(lote = x$lote, q = x$q)))
  }
  list(plano = plano, compras = compras, metodo = "guloso")
}
