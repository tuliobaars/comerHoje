# In-memory store (base R): tests, webR bench and a server without a disk. Same interface as repo_sqlite().

#' In-memory store
#'
#' A store with the same interface as [repo_sqlite()], in base R, for tests, the webR bench and
#' servers without a disk. Nothing survives the R session.
#'
#' @return A store: a list of functions (`lote`, `lote_gravar`, `mov_inserir`, `compra`,
#'   `compra_gravar`, `plano`, `plano_gravar`, `sobra`, `sobra_gravar`, `config_gravar`,
#'   `produto_gravar`, `aprender`, `apagar_tudo`, `op_aplicada`, `op_registrar`, `transacao`,
#'   `sync_base`, `sync_base_gravar`, `estado` and `fechar`).
#' @examples
#' st <- repo_memoria()
#' length(st$estado()$lotes)
#' @export
repo_memoria <- function() {
  e <- new.env()
  e$lotes <- list(); e$movs <- list(); e$compras <- list(); e$plano <- NULL; e$sobras <- list()
  e$produtos <- list(); e$aprendidos <- list(); e$config <- list(); e$ops <- character(); e$base <- list()
  list(
    lote = function(id) e$lotes[[id]],
    lote_gravar = function(l) e$lotes[[l$id]] <- l,
    mov_inserir = function(m) e$movs[[length(e$movs) + 1]] <- m,
    compra = function(id) e$compras[[id]],
    compra_gravar = function(it) e$compras[[it$id]] <- it,
    plano = function() e$plano,
    plano_gravar = function(p) e$plano <- p,
    sobra = function(id) e$sobras[[id]],
    sobra_gravar = function(s) e$sobras[[s$id]] <- s,
    config_gravar = function(chave, valor) e$config[[chave]] <- valor,
    produto_gravar = function(gtin, ing, desc, qtd) e$produtos[[gtin]] <- list(ingrediente_id = ing, descricao = desc, qtd_embalagem = qtd),
    aprender = function(termo, ing) e$aprendidos[[termo]] <- ing,
    apagar_tudo = function() { e$lotes <- list(); e$movs <- list(); e$compras <- list(); e$plano <- NULL; e$sobras <- list() },
    op_aplicada = function(id) id %in% e$ops,
    op_registrar = function(id, op) e$ops <- c(e$ops, id),
    transacao = function(fn) {                       # rollback = restores a copy of the state
      copia <- as.list(e)
      tryCatch(fn(), error = function(err) { for (k in names(copia)) assign(k, copia[[k]], envir = e); stop(err) })
    },
    sync_base = function(aba) .ou(e$base[[aba]], list()),
    sync_base_gravar = function(aba, lista) e$base[[aba]] <- lista,
    estado = function() list(lotes = unname(e$lotes), movimentos = e$movs, compras = unname(e$compras), plano = e$plano,
                             sobras = unname(e$sobras), produtos = e$produtos, aprendidos = e$aprendidos, config = e$config),
    fechar = function() invisible(NULL))
}
