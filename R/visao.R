# Cloud vision (opt-in; accepted by the owner). Used only when the device is unsure (or always/never,
# per Ajustes). The server receives a RE-ENCODED copy without metadata (made by the browser) and strips
# it again (limpar_metadados_raw). The photo is not stored; nothing is logged besides the counts.
#   COMERHOJE_VISAO_PROVEDOR = anthropic | openai
#   COMERHOJE_VISAO_API_KEY  = secret key
#   COMERHOJE_VISAO_MODELO   = a multimodal model of the provider (required; e.g. the one in your plan)

.PROMPT_ROTULO <- paste(
  "Voc\u00ea l\u00ea r\u00f3tulos de alimentos brasileiros. Na foto, encontre a DATA DE VALIDADE (pode aparecer como VAL, VAL.,",
  "VALIDADE, VENC, CONSUMIR AT\u00c9; formatos como 19/01/2027, 29 06 2027, 190327 ou 03/2027 = \u00faltimo dia do m\u00eas).",
  "N\u00e3o confunda com fabrica\u00e7\u00e3o (FAB), lote (L, LOTE) nem data de pesagem. Datas no Brasil s\u00e3o dia/m\u00eas/ano.",
  "Responda SOMENTE um JSON: {\"validade\": \"AAAA-MM-DD\" ou null, \"fabricacao\": \"AAAA-MM-DD\" ou null,",
  "\"trecho\": \"texto exato impresso perto da validade\", \"produto\": \"nome do produto em portugu\u00eas\" ou null,",
  "\"quantidade\": n\u00famero ou null, \"unidade\": \"g\"|\"ml\"|\"un\" ou null, \"confianca\": n\u00famero de 0 a 1}.",
  "Se n\u00e3o conseguir ler a validade com seguran\u00e7a, use null. Hoje \u00e9 %s.")
.PROMPT_GELADEIRA <- paste(
  "Voc\u00ea faz o invent\u00e1rio de uma geladeira brasileira. Liste os alimentos vis\u00edveis (ignore panelas e utens\u00edlios,",
  "a n\u00e3o ser que pare\u00e7am conter comida pronta: ent\u00e3o use tipo recipiente_com_comida_provavel).",
  "Responda SOMENTE um JSON: {\"itens\": [{\"nome\": \"nome em portugu\u00eas\", \"marca\": texto ou null,",
  "\"quantidade_estimada\": n\u00famero ou null, \"unidade\": \"g\"|\"ml\"|\"un\" ou null,",
  "\"tipo\": \"alimento\"|\"recipiente_com_comida_provavel\", \"confianca\": 0 a 1, \"evidencia\": \"onde est\u00e1\"}]}.")

#' Read a label or fridge photo with a cloud vision model
#'
#' Opt-in and used only when the on-device reader is unsure (or as configured in Ajustes). The image
#' is stripped of metadata again on the server ([limpar_metadados_raw()]), is not stored, and the
#' answer is checked by [visao_validar()]. Configured by the environment variables
#' `COMERHOJE_VISAO_PROVEDOR` (`anthropic` or `openai`), `COMERHOJE_VISAO_API_KEY` and
#' `COMERHOJE_VISAO_MODELO`.
#'
#' @param imagem_b64 The JPEG image, base64-encoded.
#' @param modo `"rotulo"` (expiry date of a label), `"balanca"` (scale label) or `"geladeira"`
#'   (inventory of a fridge photo).
#' @param hoje Today's date (AAAA-MM-DD), given to the model and used for validation.
#' @return For labels, a list with `validade`, `fabricacao`, `trecho`, `produto`, `quantidade`,
#'   `unidade` and `confianca`; for fridges, a list with `itens`.
#' @examples
#' \dontrun{
#' Sys.setenv(COMERHOJE_VISAO_API_KEY = "...", COMERHOJE_VISAO_MODELO = "...")
#' f <- foto_exemplo()
#' visao_ler(jsonlite::base64_enc(readBin(f, "raw", file.info(f)$size)))
#' }
#' @export
visao_ler <- function(imagem_b64, modo = c("rotulo", "balanca", "geladeira"), hoje = format(hoje_br())) {
  modo <- match.arg(modo)
  provedor <- Sys.getenv("COMERHOJE_VISAO_PROVEDOR", "anthropic"); chave <- Sys.getenv("COMERHOJE_VISAO_API_KEY")
  modelo <- Sys.getenv("COMERHOJE_VISAO_MODELO")
  if (!nzchar(chave)) stop("IA na nuvem n\u00e3o configurada no servidor")
  if (!nzchar(modelo)) stop("defina COMERHOJE_VISAO_MODELO (um modelo multimodal do provedor)")
  if (!requireNamespace("httr2", quietly = TRUE)) stop("instale o pacote httr2")
  bytes <- limpar_metadados_raw(jsonlite::base64_dec(imagem_b64))            # defence in depth
  img <- jsonlite::base64_enc(bytes)
  prompt <- if (modo == "geladeira") .PROMPT_GELADEIRA else sprintf(.PROMPT_ROTULO, hoje)
  texto <- switch(provedor,
    anthropic = {
      corpo <- list(model = modelo, max_tokens = 900, messages = list(list(role = "user", content = list(
        list(type = "image", source = list(type = "base64", media_type = "image/jpeg", data = img)),
        list(type = "text", text = prompt)))))
      r <- httr2::request("https://api.anthropic.com/v1/messages") |>
        httr2::req_headers(`x-api-key` = chave, `anthropic-version` = "2023-06-01") |>
        httr2::req_body_json(corpo, auto_unbox = TRUE) |> httr2::req_timeout(60) |> httr2::req_retry(max_tries = 2) |>
        httr2::req_perform() |> httr2::resp_body_json(simplifyVector = FALSE)
      paste(vapply(Filter(function(b) identical(b$type, "text"), r$content), `[[`, "", "text"), collapse = "\n")
    },
    openai = {
      corpo <- list(model = modelo, response_format = list(type = "json_object"), messages = list(list(role = "user", content = list(
        list(type = "text", text = prompt), list(type = "image_url", image_url = list(url = paste0("data:image/jpeg;base64,", img)))))))
      r <- httr2::request("https://api.openai.com/v1/chat/completions") |> httr2::req_auth_bearer_token(chave) |>
        httr2::req_body_json(corpo, auto_unbox = TRUE) |> httr2::req_timeout(60) |> httr2::req_retry(max_tries = 2) |>
        httr2::req_perform() |> httr2::resp_body_json(simplifyVector = FALSE)
      r$choices[[1]]$message$content
    },
    stop("provedor desconhecido: ", provedor))
  visao_validar(texto, modo, hoje)
}

#' Validate the answer of a vision model
#'
#' Extracts the JSON, discards implausible dates, caps the confidence at 0.9 and checks the quoted
#' snippet with our own date parser: a model can invent a date, the parser cannot.
#'
#' @param texto Text of the model's answer.
#' @param modo `"rotulo"`, `"balanca"` or `"geladeira"`.
#' @param hoje Today's date (AAAA-MM-DD).
#' @return See [visao_ler()].
#' @examples
#' visao_validar('{"validade": "2027-01-19", "trecho": "VAL 19/01/2027", "confianca": 0.95}',
#'               hoje = "2026-06-01")$confianca
#' @export
visao_validar <- function(texto, modo = "rotulo", hoje = format(hoje_br())) {
  j <- sub("(?s)^.*?(\\{.*\\}).*$", "\\1", texto, perl = TRUE)
  r <- if (grepl("^\\s*\\{", j)) tryCatch(jsonlite::fromJSON(j, simplifyVector = FALSE), error = function(e) NULL) else NULL
  if (is.null(r)) stop("a IA n\u00e3o devolveu JSON v\u00e1lido")
  if (modo == "geladeira") return(list(itens = Filter(function(i) !is.null(i$nome), .ou(r$itens, list()))))
  d <- suppressWarnings(as.Date(.ou(r$validade, NA_character_), format = "%Y-%m-%d"))
  dias <- if (is.na(d)) NA else as.integer(d - as.Date(hoje))
  if (!is.na(dias) && (dias < -365 || dias > 5 * 365)) d <- as.Date(NA)
  conf <- min(0.9, as.numeric(.ou(r$confianca, 0.7)))
  if (!is.na(d) && !is.null(r$trecho)) {
    p <- extrair_datas(r$trecho, hoje)
    conf <- if (!is.na(p$validade) && p$validade == d) min(0.9, conf + 0.1) else min(conf, 0.6)   # snippet confirms or not
  }
  list(validade = if (is.na(d)) NULL else format(d), fabricacao = r$fabricacao, trecho = r$trecho, produto = r$produto,
       quantidade = r$quantidade, unidade = r$unidade, confianca = round(conf, 2))
}
