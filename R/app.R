# Shiny target (delivery model DLV-10/11): the SAME front end as the HTML and Quarto targets
# (inst/app/www/comerhoje.{js,css}), with ShinyTransport: input$ch_msg <-> custom message 'ch-msg'.

.pasta_www <- function() system.file("app", "www", package = "comerHoje")

comerhoje_dependencias <- function() {
  list(
    htmltools::htmlDependency("comerhoje", utils::packageVersion("comerHoje"), src = .pasta_www(),
                              script = c("zxing/zxing-reader.js", "comerhoje.js"), stylesheet = "comerhoje.css", all_files = TRUE))
}

.capacidades <- function() {
  list(servidor = TRUE,
       visao = nzchar(Sys.getenv("COMERHOJE_VISAO_API_KEY")),
       nfce = TRUE,
       milp = requireNamespace("ompr", quietly = TRUE) && requireNamespace("ROI.plugin.glpk", quietly = TRUE),
       sync = "servidor",
       planilha = .planilha_descricao())
}

#' Shiny user interface of comerHoje
#'
#' Builds the UI as a function of the request, so every page load receives the ingredient catalog and
#' the appearance defaults inline. The page is the same single front end used by the Quarto and HTML
#' deliveries (built from `srcjs/` into `inst/app/www`), talking to the server through one input
#' (`input$ch_msg`) and one custom message (`ch-msg`).
#'
#' @param framework Visual framework of the Taiga design system: `"lumen"` (default) or `"neue"`.
#'   Each person can still switch it in Ajustes; the choice is kept on the device.
#' @return A function of `req` that returns an [htmltools::tagList()], suitable as the `ui` argument of
#'   [shiny::shinyApp()].
#' @seealso [comerhoje_server()], [comerhoje_app()], [run_app()].
#' @examples
#' ui <- comerhoje_ui("neue")
#' is.function(ui)
#' @export
comerhoje_ui <- function(framework = getOption("comerHoje.framework", "lumen")) {
  force(framework)
  function(req) {
    base <- sprintf("comerhoje-%s/", utils::packageVersion("comerHoje"))
    payload <- sprintf('{"catalogo":%s,"recursos":{"zxing":"%szxing/","ocr":"%socr/"},"aparencia":{"framework":"%s"}}',
                       .catalogo_json(), base, base, framework)
    payload <- gsub("<", "\\u003c", payload, fixed = TRUE)
    htmltools::tagList(
      htmltools::tags$head(
        htmltools::tags$meta(name = "viewport", content = "width=device-width, initial-scale=1, viewport-fit=cover"),
        htmltools::tags$meta(name = "theme-color", content = "#fbfbfd"),
        htmltools::tags$meta(name = "format-detection", content = "telephone=no"),
        htmltools::tags$meta(name = "apple-mobile-web-app-capable", content = "yes"),
        htmltools::tags$title("comerHoje: cozinha sem desperd\u00edcio"),
        htmltools::tags$style(htmltools::HTML("html,body{margin:0} #shiny-disconnected-overlay{display:none}"))),
      htmltools::tags$div(class = "ch", `data-mode` = "shiny", `data-framework` = framework, `data-theme` = "light",
                          `data-payload` = "ch-dados", `data-instancia` = "shiny"),
      htmltools::tags$script(htmltools::HTML(.tema_inicial())),
      htmltools::tags$script(type = "application/json", id = "ch-dados", htmltools::HTML(payload)),
      comerhoje_dependencias())
  }
}

.catalogo_json <- local({ cache <- NULL; function() {
  if (is.null(cache)) cache <<- paste(readLines(system.file("extdata", "catalogo.json", package = "comerHoje"), encoding = "UTF-8", warn = FALSE), collapse = "")
  cache } })
.tema_inicial <- function() paste(readLines(system.file("app", "tema-inicial.js", package = "comerHoje"), warn = FALSE), collapse = "\n")

#' Shiny server of comerHoje
#'
#' Opens the household's SQLite database (see [repo_sqlite()]), answers every message of the front end
#' with [ch_despachar()] and, when a Google Sheet is configured, syncs the stock with it every five
#' minutes while the session is open. Each operation is written at once, in a transaction, with its
#' id recorded, so a dropped session (iPhone locked, Wi-Fi to 4G) loses nothing and a re-sent
#' operation is not applied twice.
#'
#' @param caminho_db Path of the SQLite file. Defaults to the `COMERHOJE_DB` environment variable,
#'   or `comerhoje.db` in the working directory.
#' @return A function of `input`, `output` and `session`, suitable as the `server` argument of
#'   [shiny::shinyApp()].
#' @seealso [comerhoje_ui()], [ch_despachar()].
#' @export
comerhoje_server <- function(caminho_db = Sys.getenv("COMERHOJE_DB", "comerhoje.db")) {
  function(input, output, session) {
    session$allowReconnect(TRUE)                        # DLV-11: the client re-attaches after drops
    store <- repo_sqlite(caminho_db)
    session$onSessionEnded(function() store$fechar())
    shiny::addResourcePath(sprintf("comerhoje-%s", utils::packageVersion("comerHoje")), .pasta_www())
    responder <- function(x) session$sendCustomMessage("ch-msg", x)

    shiny::observeEvent(input$ch_msg, {
      msg <- tryCatch(jsonlite::fromJSON(input$ch_msg, simplifyVector = FALSE), error = function(e) NULL)
      if (is.null(msg)) return()
      r <- tryCatch(ch_despachar(store, msg), error = function(e) list(ok = FALSE, erro = conditionMessage(e)))
      responder(c(list(id = msg$id), r))
      if (isTRUE(r$mudou_planilha)) responder(list(tipo = "estado", estado = estado_para_cliente(store)))
    }, ignoreInit = TRUE)

    # automatic sync with the Google Sheet every 5 min while the session is open (if configured)
    if (.planilha_configurada()) {
      shiny::observe({
        shiny::invalidateLater(5 * 60 * 1000)
        res <- tryCatch(sincronizar_planilha(store), error = function(e) list(ok = FALSE, mensagem = conditionMessage(e)))
        responder(list(tipo = "sync", ok = isTRUE(res$ok), mensagem = res$mensagem))
        if (isTRUE(res$recebidos > 0)) responder(list(tipo = "estado", estado = estado_para_cliente(store)))
      })
    }
  }
}

#' Dispatch one message of the front-end protocol
#'
#' The pure core of the Shiny server: takes a store and a decoded message and returns the answer,
#' so the whole protocol can be tested without Shiny. Messages of type `"op"` are operations of the
#' shared contract, applied once with [aplicar_op_unica()]; other messages are queries:
#' `estado.carregar`, `plano.milp`, `sync.agora`, `nfce.consultar`, `visao.ler` and `produto.gtin`.
#'
#' @param store A store created by [repo_sqlite()] or [repo_memoria()].
#' @param msg A list with `id`, `tipo` (`"op"` or `"consulta"`), `op` and `args`; for operations,
#'   also `t` (ISO timestamp made on the device).
#' @return A list with `ok`, `resultado` and, for queries, `mudou_planilha` (TRUE when a sync brought
#'   rows from the sheet). Unknown queries raise an error.
#' @examples
#' st <- repo_memoria()
#' msg <- list(id = "u1", tipo = "op", op = "compras.salvar", t = "2026-11-11T12:00:00Z",
#'             args = list(item = list(id = "c1", descricao = "Pinhão")))
#' ch_despachar(st, msg)$resultado$aplicada
#' ch_despachar(st, msg)$resultado$aplicada
#' @export
ch_despachar <- function(store, msg) {
  if (identical(msg$tipo, "op")) {
    aplicada <- aplicar_op_unica(store, msg)
    return(list(ok = TRUE, resultado = list(aplicada = aplicada)))
  }
  a <- .ou(msg$args, list())
  resultado <- switch(msg$op,
    "estado.carregar" = list(estado = estado_para_cliente(store), capacidades = .capacidades()),
    "plano.milp" = planejar_servidor(store, a),
    "sync.agora" = sincronizar_planilha(store),
    "nfce.consultar" = nfce_sc_consultar(a$url),
    "visao.ler" = visao_ler(a$imagem, modo = .ou(a$modo, "rotulo"), hoje = .ou(a$hoje, format(hoje_br()))),
    "produto.gtin" = produto_por_gtin(store, a$gtin),
    stop("consulta desconhecida: ", msg$op))
  list(ok = TRUE, resultado = resultado, mudou_planilha = identical(msg$op, "sync.agora") && isTRUE(resultado$recebidos > 0))
}

#' Snapshot of the household state for the front end
#'
#' Reads the whole state from a store and converts the numeric and logical columns to the types the
#' browser store expects.
#'
#' @param store A store created by [repo_sqlite()] or [repo_memoria()].
#' @return A list with `lotes`, `movimentos`, `compras`, `plano`, `sobras`, `produtos`,
#'   `aprendidos`, `config` and `versao` (the number of movements).
#' @examples
#' names(estado_para_cliente(repo_memoria()))
#' @export
estado_para_cliente <- function(store) {
  E <- store$estado()
  num <- function(l) { for (k in c("quantidade", "quantidade_inicial", "preco_total", "valor_estimado", "porcoes")) if (!is.null(l[[k]])) l[[k]] <- as.numeric(l[[k]]); l }
  E$lotes <- lapply(E$lotes, num); E$movimentos <- lapply(E$movimentos, function(m) { m <- num(m); if (!is.null(m$a_tempo)) m$a_tempo <- as.logical(m$a_tempo); m })
  E$compras <- lapply(E$compras, num); E$sobras <- lapply(E$sobras, num)
  E$versao <- length(E$movimentos)
  E
}

#' Shiny app object of comerHoje
#'
#' Registers the static resources of the package and returns the app, ready for
#' [shiny::runApp()], `rsconnect::deployApp()` (through the top-level `app.R`) or a Docker image.
#'
#' @param caminho_db Path of the SQLite file (see [comerhoje_server()]).
#' @param framework Visual framework, `"lumen"` or `"neue"` (see [comerhoje_ui()]).
#' @return A `shiny.appobj`.
#' @seealso [run_app()] to start it locally.
#' @examples
#' \dontrun{
#' app <- comerhoje_app(caminho_db = tempfile(fileext = ".db"))
#' shiny::runApp(app)
#' }
#' @export
comerhoje_app <- function(caminho_db = Sys.getenv("COMERHOJE_DB", "comerhoje.db"), framework = getOption("comerHoje.framework", "lumen")) {
  shiny::addResourcePath(sprintf("comerhoje-%s", utils::packageVersion("comerHoje")), .pasta_www())
  shiny::shinyApp(ui = comerhoje_ui(framework), server = comerhoje_server(caminho_db))
}

#' Start comerHoje locally
#'
#' Convenience wrapper around [comerhoje_app()] and [shiny::runApp()]. To open it on an iPhone in
#' the same Wi-Fi network, use `host = "0.0.0.0"` and visit the computer's address.
#'
#' @param ... Passed to [comerhoje_app()] (`caminho_db`, `framework`).
#' @param port TCP port.
#' @param host Interface to listen on; `"127.0.0.1"` keeps the app private to this computer.
#' @param launch.browser Open a browser window?
#' @return Called for its side effect; returns when the app stops.
#' @examples
#' \dontrun{
#' run_app(caminho_db = "~/comerhoje.db", framework = "neue")
#' }
#' @export
run_app <- function(..., port = 8080, host = "127.0.0.1", launch.browser = interactive()) {
  shiny::runApp(comerhoje_app(...), port = port, host = host, launch.browser = launch.browser)
}
