# DBI + RSQLite stand-in for webR (which has no RSQLite), backed by REAL SQLite: Node's built-in
# `node:sqlite`, reached through webr::eval_js() in the webR worker. It lets tests/testthat/test-repo_sqlite.R
# and the repo_sqlite() examples run here, and it enforces the RSQLite rules that bit us on real R:
#   - params given to a query without "?" -> error "Query does not require parameters." (even params = list())
#   - "?" without params, or a different number of params -> error
#   - every param an atomic vector, all of the same length (one execution per row); NULL is refused
#   - logical binds as 0/1, NA as NULL; a multi-statement string runs only the first, with a warning
#   - result columns typed like RSQLite: declared INTEGER -> integer, REAL -> double, TEXT -> character;
#     expressions by their values; an all-NULL column without a declared type -> logical
# Files live in the host's temp folder, so closing and reopening a database keeps the data (WAL included).
# Loaded by tests/webr/run_all.R and check_rd.R only when node:sqlite is available (Node >= 22.5).

.dbi_js <- '
(() => {
  if (globalThis.__chsql) return "ok";
  const gm = process.getBuiltinModule;
  const { DatabaseSync } = gm("node:sqlite"), fs = gm("node:fs"), os = gm("node:os"), path = gm("node:path");
  const pasta = path.join(os.tmpdir(), "comerhoje-webr-sqlite-" + process.pid);
  fs.rmSync(pasta, { recursive: true, force: true }); fs.mkdirSync(pasta, { recursive: true });
  const conexoes = new Map(); let prox = 1;
  const primeiraInstrucao = (sql) => {          // end of the first statement (outside quotes and comments)
    let q = null;
    for (let i = 0; i < sql.length; i++) {
      const c = sql[i];
      if (q) { if (c === q) q = null; continue; }
      if (c === "\\u0027" || c === "\\u0022") { q = c; continue; }
      if (c === "-" && sql[i + 1] === "-") { while (i < sql.length && sql[i] !== "\\n") i++; continue; }
      if (c === ";") return i;
    }
    return sql.length;
  };
  const interrogacoes = (sql) => { let n = 0, q = null;
    for (const c of sql) { if (q) { if (c === q) q = null; } else if (c === "\\u0027" || c === "\\u0022") q = c; else if (c === "?") n++; }
    return n; };
  globalThis.__chsql = {
    abrir(p) {
      const arq = p === ":memory:" || p === "" ? ":memory:" : path.join(pasta, encodeURIComponent(p));
      const id = prox++; conexoes.set(id, new DatabaseSync(arq)); return JSON.stringify({ id });
    },
    fechar(id) { const db = conexoes.get(id); if (db) { db.close(); conexoes.delete(id); } return "ok"; },
    rodar(id, sql, params, consulta) {
      const db = conexoes.get(id);
      if (!db) return JSON.stringify({ erro: "Invalid or closed connection" });
      try {
        const fim = primeiraInstrucao(sql), resto = sql.slice(fim + 1).trim();
        const primeira = sql.slice(0, fim);
        const n = interrogacoes(primeira);
        if (params !== null && n === 0) return JSON.stringify({ erro: "Query does not require parameters." });
        if (params === null && n > 0) return JSON.stringify({ erro: `Query requires ${n} params; 0 supplied.` });
        if (params !== null && params.length !== n) return JSON.stringify({ erro: `Query requires ${n} params; ${params.length} supplied.` });
        const st = db.prepare(primeira);
        const linhas = params === null ? 1 : (params.length ? params[0].length : 1);
        let colunas = null, dados = [], mudancas = 0;
        try { colunas = st.columns().map((c) => ({ nome: c.name, tipo: c.type })); } catch (e) { colunas = []; }
        for (let r = 0; r < linhas; r++) {
          const args = params === null ? [] : params.map((v) => v[r]);
          if (consulta) {
            const res = st.all(...args);
            if (!colunas.length && res.length) colunas = Object.keys(res[0]).map((nome) => ({ nome, tipo: "" }));  // older node: no columns()
            dados.push(...res.map((o) => colunas.map((c) => o[c.nome])));
          } else mudancas += Number(st.run(...args).changes);
        }
        return JSON.stringify({ colunas, dados, mudancas, aviso: resto ? "Ignoring remaining part of query: " + resto.slice(0, 40) : null });
      } catch (e) { return JSON.stringify({ erro: String(e.message || e) }); }
    },
  };
  return "ok";
})()'

.dbi_disponivel <- tryCatch(identical(webr::eval_js(.dbi_js), "ok"), error = function(e) FALSE)

.dbi_json_param <- function(v, k) {
  if (is.null(v)) stop(sprintf("Parameter %d does not have length 1.", k), call. = FALSE)
  if (is.factor(v)) v <- as.character(v)
  if (inherits(v, "Date")) v <- as.numeric(v)
  if (!is.atomic(v)) stop(sprintf("Parameter %d is not an atomic vector.", k), call. = FALSE)
  if (is.logical(v)) v <- as.integer(v)
  itens <- rep("null", length(v)); ok <- !is.na(v)
  if (is.character(v)) {
    e <- enc2utf8(v[ok])
    e <- gsub("\\", "\\\\", e, fixed = TRUE); e <- gsub("\"", "\\\"", e, fixed = TRUE)
    e <- gsub("\n", "\\n", e, fixed = TRUE); e <- gsub("\r", "\\r", e, fixed = TRUE); e <- gsub("\t", "\\t", e, fixed = TRUE)
    itens[ok] <- paste0("\"", e, "\"")
  } else itens[ok] <- sprintf("%.17g", as.numeric(v[ok]))
  paste0("[", paste(itens, collapse = ","), "]")
}

.dbi_rodar <- function(con, sql, params, consulta) {
  if (!isTRUE(con$aberta())) stop("Invalid or closed connection", call. = FALSE)
  pj <- "null"
  if (!is.null(params)) {
    params <- unname(as.list(params))
    comp <- vapply(params, length, 0L)
    if (length(params) && length(unique(comp)) > 1) stop("Parameter lengths differ.", call. = FALSE)
    pj <- paste0("[", paste(vapply(seq_along(params), function(k) .dbi_json_param(params[[k]], k), ""), collapse = ","), "]")
  }
  sql_js <- .dbi_json_param(sql, 0L)
  codigo <- sprintf("globalThis.__chsql.rodar(%d, %s[0], %s, %s)", con$id, sql_js, pj, if (consulta) "true" else "false")
  r <- .json_parse(webr::eval_js(codigo))
  if (!is.null(r$erro)) stop(r$erro, call. = FALSE)
  if (!is.null(r$aviso)) warning(r$aviso, call. = FALSE)
  if (!consulta) return(as.integer(r$mudancas))
  nomes <- vapply(r$colunas, function(c) c$nome, "")
  cols <- lapply(seq_along(nomes), function(j) {
    vals <- lapply(r$dados, function(l) l[[j]])
    nulo <- vapply(vals, is.null, TRUE)
    tipo <- toupper(if (is.null(r$colunas[[j]]$tipo)) "" else r$colunas[[j]]$tipo)
    naonulos <- vals[!nulo]
    classe <- if (grepl("INT", tipo)) "integer" else if (grepl("REAL|FLOA|DOUB", tipo)) "double"
      else if (grepl("CHAR|CLOB|TEXT", tipo)) "character"
      else if (!length(naonulos)) "logical"
      else if (is.character(naonulos[[1]])) "character"
      else if (all(vapply(naonulos, function(x) is.numeric(x) && x == round(x) && abs(x) < 2^31, TRUE))) "integer" else "double"
    saida <- vector(classe, length(vals)); saida[nulo] <- NA
    if (any(!nulo)) saida[!nulo] <- switch(classe, integer = as.integer(unlist(naonulos)), double = as.numeric(unlist(naonulos)),
                                           character = as.character(unlist(naonulos)), logical = as.logical(unlist(naonulos)))
    saida
  })
  names(cols) <- nomes
  structure(cols, class = "data.frame", row.names = .set_row_names(length(r$dados)))
}

.DBI_fake <- list(
  dbConnect = function(drv, dbname = "", ...) {
    r <- .json_parse(webr::eval_js(sprintf("globalThis.__chsql.abrir(%s[0])", .dbi_json_param(dbname, 0L))))
    estado <- new.env(); estado$aberta <- TRUE
    structure(list(id = r$id, caminho = dbname, aberta = function() estado$aberta, .estado = estado), class = "ch_sqlite_con")
  },
  dbDisconnect = function(conn, ...) {
    webr::eval_js(sprintf("globalThis.__chsql.fechar(%d)", conn$id)); conn$.estado$aberta <- FALSE; invisible(TRUE)
  },
  dbExecute = function(conn, statement, params = NULL, ...) .dbi_rodar(conn, statement, params, FALSE),
  dbGetQuery = function(conn, statement, params = NULL, ...) .dbi_rodar(conn, statement, params, TRUE),
  dbExistsTable = function(conn, name, ...)
    nrow(.dbi_rodar(conn, "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?", list(name), TRUE)) > 0,
  dbWithTransaction = function(conn, code, ...) {
    .dbi_rodar(conn, "BEGIN", NULL, FALSE)
    ok <- FALSE
    on.exit(if (!ok) try(.dbi_rodar(conn, "ROLLBACK", NULL, FALSE), silent = TRUE))
    r <- eval.parent(substitute(code))
    .dbi_rodar(conn, "COMMIT", NULL, FALSE); ok <- TRUE
    invisible(r)
  })
.RSQLite_fake <- list(SQLite = function(...) structure(list(), class = "ch_sqlite_driver"))
