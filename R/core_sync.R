# Sincronização de 3 vias (local x planilha x base da última sincronização) e hash FNV-1a 32 bits
# idêntico ao do JS (ComerHojeCore.fnv1a): detecta "esta linha mudou desde a última sincronização".

#' FNV-1a 32-bit hash of a string
#'
#' Computed over the UTF-8 bytes with exact double arithmetic, identical to the JavaScript core. Used
#' to detect which rows changed since the last sync with the Google Sheet.
#'
#' @param x A single string.
#' @return The hash as 8 hexadecimal characters.
#' @examples
#' fnv1a("comerHoje")
#' @export
fnv1a <- function(x) {
  h <- 2166136261
  for (b in as.integer(charToRaw(enc2utf8(x)))) {
    baixo <- h %% 256
    h <- h - baixo + bitwXor(as.integer(baixo), b)
    h <- ((h %% 256) * 16777216 + h * 403) %% 4294967296     # h * 16777619 mod 2^32, sem perder precisão
  }
  sprintf("%04x%04x", as.integer(h %/% 65536), as.integer(h %% 65536))
}

.canonico <- function(linha, campos) paste(vapply(campos, function(c) {
  v <- linha[[c]]; if (is.null(v) || length(v) == 0 || is.na(v)) "" else .txt_js(v)
}, ""), collapse = "\u001f")
# número como o JS escreveria (String(482) = "482", String(14.89) = "14.89")
.txt_js <- function(v) if (is.numeric(v)) { if (v == round(v)) format(v, scientific = FALSE) else format(v, digits = 15) } else as.character(v)

#' Three-way merge of the stock with the Google Sheet
#'
#' Compares each row of the local stock and of the sheet with the hash recorded at the last sync, to
#' tell who changed it: a person editing the sheet does not update any timestamp, so a two-way
#' "latest wins" merge would lose edits.
#'
#' @param local,remoto Lists of rows (named lists with an `id`) from the app and from the sheet.
#' @param base A list of the rows recorded at the last sync, each a list with `id` and `hash`.
#' @param campos Names of the fields that take part in the hash.
#' @return A named list of id vectors, one per action: `nada`, `push`, `pull`, `conflito_remoto`
#'   (both changed: the sheet wins), `excluir_local` and `esquecer`.
#' @examples
#' a <- list(id = "L1", item = "Leite", quantidade = 1)
#' b <- list(id = "L1", item = "Leite", quantidade = 2)
#' base <- list(list(id = "L1", hash = fnv1a(paste("Leite", 1, sep = intToUtf8(31)))))
#' mesclar_3vias(list(a), list(b), base, c("item", "quantidade"))$pull
#' @export
mesclar_3vias <- function(local, remoto, base, campos) {
  hl <- vapply(local, function(l) fnv1a(.canonico(l, campos)), ""); names(hl) <- vapply(local, `[[`, "", "id")
  hr <- vapply(remoto, function(l) fnv1a(.canonico(l, campos)), ""); names(hr) <- vapply(remoto, `[[`, "", "id")
  hb <- if (length(base)) stats::setNames(vapply(base, `[[`, "", "hash"), vapply(base, `[[`, "", "id")) else character()
  ids <- unique(c(names(hb), names(hl), names(hr)))
  acao <- vapply(ids, function(id) {
    b <- hb[id]; l <- hl[id]; r <- hr[id]
    tb <- !is.na(b); tl <- !is.na(l); tr <- !is.na(r)
    if (!tb) return(if (tl && !tr) "push" else if (!tl && tr) "pull" else if (l == r) "nada" else "conflito_remoto")
    if (tl && tr) return(if (l == b && r == b) "nada" else if (l != b && r == b) "push" else if (l == b && r != b) "pull" else if (l == r) "nada" else "conflito_remoto")
    if (tl) return(if (l == b) "excluir_local" else "push")
    if (tr) return("pull")
    "esquecer"
  }, "")
  niveis <- c("nada", "push", "pull", "conflito_remoto", "excluir_local", "esquecer")
  lapply(stats::setNames(niveis, niveis), function(n) unname(ids[acao == n]))
}
