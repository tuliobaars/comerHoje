# Weekly plan on the server: MILP (ompr + GLPK) when installed; otherwise the same greedy planner as the device.
# Maximises the value of what is used before it expires and penalises purchases (docs/ARCHITECTURE.md §9).

.receitas_base <- function(pessoas, catalogo = .catalogo()) {
  basicos <- vapply(catalogo$ingredientes, function(g) g$basico == "1", logical(1)); names(basicos) <- vapply(catalogo$ingredientes, `[[`, "", "id")
  rs <- Filter(function(r) r$tipo %in% c("prato_unico", "mistura"), catalogo$receitas)
  out <- lapply(rs, function(r) {
    ings <- Filter(function(l) l$opcional != "1" && !isTRUE(basicos[[l$ingrediente_id]]), r$ingredientes)
    ings <- lapply(ings, function(l) list(id = l$ingrediente_id, qtd = tryCatch(converter_para_base(as.numeric(l$quantidade), l$unidade, l$ingrediente_id, catalogo), error = function(e) 0) * pessoas / as.numeric(r$porcoes)))
    list(id = r$id, ingredientes = Filter(function(l) l$qtd > 0, ings))
  })
  Filter(function(r) length(r$ingredientes) > 0, out)
}

.lotes_plano <- function(store, catalogo = .catalogo()) {
  ing <- stats::setNames(catalogo$ingredientes, vapply(catalogo$ingredientes, `[[`, "", "id"))
  L <- Filter(function(l) identical(l$status, "ativo") && !isTRUE(as.integer(.ou(l$excluido, 0)) == 1L) && as.numeric(l$quantidade) > 0, store$estado()$lotes)
  L <- lapply(L, function(l) { g <- ing[[l$ingrediente_id]]
    list(id = l$id, ingrediente = l$ingrediente_id, qtd = as.numeric(l$quantidade), basico = g$basico == "1",
         validade_efetiva = validade_efetiva(l, list(validade_padrao_dias = as.integer(g$validade_padrao_dias), aberto_dias = suppressWarnings(as.integer(g$aberto_dias)))),
         valor = if (!is.null(l$preco_total) && !is.na(l$preco_total) && as.numeric(.ou(l$quantidade_inicial, 0)) > 0) as.numeric(l$preco_total) / as.numeric(l$quantidade_inicial) else NA) })
  Filter(function(l) !l$basico && !is.na(l$validade_efetiva) && as.Date(l$validade_efetiva) >= hoje_br(), L)
}

#' Weekly plan computed on the server
#'
#' Builds the recipes for the number of people and the usable lots of the store, then solves the plan
#' with [planejar_milp()] when ompr, ompr.roi and ROI.plugin.glpk are installed, or with
#' [planejar_guloso()] otherwise.
#'
#' @param store A store created by [repo_sqlite()] or [repo_memoria()].
#' @param args A list with `pessoas` (default 2) and `slots` (a list of lists with `id` and `data`).
#' @return A plan as returned by [planejar_guloso()] or [planejar_milp()].
#' @examples
#' slots <- list(list(id = "s1", data = "2026-06-01"))
#' planejar_servidor(repo_memoria(), list(pessoas = 2, slots = slots))$metodo
#' @export
planejar_servidor <- function(store, args) {
  pessoas <- as.numeric(.ou(args$pessoas, 2)); slots <- args$slots
  lotes <- .lotes_plano(store); receitas <- .receitas_base(pessoas)
  if (requireNamespace("ompr", quietly = TRUE) && requireNamespace("ompr.roi", quietly = TRUE) && requireNamespace("ROI.plugin.glpk", quietly = TRUE)) {
    r <- tryCatch(planejar_milp(lotes, receitas, slots), error = function(e) NULL)
    if (!is.null(r)) return(r)
  }
  planejar_guloso(lotes, receitas, slots)
}

#' Weekly plan as a mixed-integer program
#'
#' Chooses at most one recipe per slot, decides how much of each lot is used in each slot and what
#' must be bought, maximizing the value of what is used before it expires minus `lambda` times the cost
#' of the purchases. Requires ompr, ompr.roi and ROI.plugin.glpk (suggested packages).
#'
#' @inheritParams planejar_guloso
#' @param lambda Weight of the purchases in the objective.
#' @param tempo_max_s Time limit of the solver, in seconds.
#' @return A list with `metodo` (`"milp"`), `plano` and `compras`.
#' @examples
#' \dontrun{
#' lotes <- list(list(id = "L1", ingrediente = "nhoque", qtd = 500,
#'                    validade_efetiva = "2026-06-03", valor = 0.03))
#' receitas <- list(list(id = "nhoque_ao_sugo", ingredientes = list(list(id = "nhoque", qtd = 250))))
#' planejar_milp(lotes, receitas, list(list(id = "s1", data = "2026-06-01")))
#' }
#' @export
planejar_milp <- function(lotes, receitas, slots, lambda = 0.5, tempo_max_s = 10) {
  R <- length(receitas); S <- length(slots); L <- length(lotes)
  ings <- unique(c(unlist(lapply(receitas, function(r) vapply(r$ingredientes, `[[`, "", "id"))), vapply(lotes, `[[`, "", "ingrediente")))
  I <- length(ings)
  n <- matrix(0, R, I); for (r in seq_len(R)) for (x in receitas[[r]]$ingredientes) n[r, match(x$id, ings)] <- x$qtd
  il <- vapply(lotes, function(l) match(l$ingrediente, ings), 0L)
  q <- vapply(lotes, `[[`, 0, "qtd")
  v <- vapply(lotes, function(l) if (is.na(l$valor)) 1 / max(l$qtd, 1) else l$valor, 0)
  dslot <- as.Date(vapply(slots, `[[`, "", "data"))
  w <- outer(seq_len(L), seq_len(S), Vectorize(function(l, s) { d <- as.integer(as.Date(lotes[[l]]$validade_efetiva) - dslot[s]); if (d < 0) 0 else 1 / (1 + d) }))
  custo <- vapply(seq_len(I), function(i) { k <- which(il == i); if (length(k)) stats::median(v[k]) else 0.01 }, 0)
  m <- ompr::MIPModel() |>
    ompr::add_variable(x[r, s], r = 1:R, s = 1:S, type = "binary") |>
    ompr::add_variable(u[l, s], l = 1:L, s = 1:S, type = "continuous", lb = 0) |>
    ompr::add_variable(b[i, s], i = 1:I, s = 1:S, type = "continuous", lb = 0) |>
    ompr::set_objective(ompr::sum_over(w[l, s] * v[l] * u[l, s], l = 1:L, s = 1:S) - lambda * ompr::sum_over(custo[i] * b[i, s], i = 1:I, s = 1:S), sense = "max") |>
    ompr::add_constraint(ompr::sum_over(x[r, s], r = 1:R) <= 1, s = 1:S) |>
    ompr::add_constraint(ompr::sum_over(n[r, i] * x[r, s], r = 1:R) == ompr::sum_over(u[l, s], l = which(il == i)) + b[i, s], i = which(vapply(seq_len(I), function(i) any(il == i), TRUE)), s = 1:S) |>
    ompr::add_constraint(ompr::sum_over(u[l, s], s = 1:S) <= q[l], l = 1:L) |>
    ompr::add_constraint(u[l, s] == 0, l = 1:L, s = 1:S, w[l, s] == 0) |>
    ompr::add_constraint(x[r, s] + x[r, s + 1] <= 1, r = 1:R, s = seq_len(S - 1))
  res <- ompr::solve_model(m, ompr.roi::with_ROI(solver = "glpk", verbose = FALSE, control = list(tm_limit = tempo_max_s * 1000)))
  if (!ompr::solver_status(res) %in% c("success", "optimal")) stop("MILP sem solu\u00e7\u00e3o")
  sol <- ompr::get_solution(res, x[r, s]); sol <- sol[sol$value > 0.5, ]
  compras <- ompr::get_solution(res, b[i, s]); compras <- compras[compras$value > 1e-6, ]
  list(metodo = "milp",
       plano = lapply(seq_len(S), function(s) { r <- sol$r[sol$s == s]; list(slot = slots[[s]]$id, receita = if (length(r)) receitas[[r[1]]]$id else NULL) }),
       compras = as.list(tapply(compras$value, ings[compras$i], sum)))
}
