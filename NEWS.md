# comerHoje 2.0.2

Fixes from the second real check (macOS, R 4.6, `--as-cran`), which found 2 errors, 3 warnings and 4 notes.

* **Bug fix, SQLite store**: `repo_sqlite()` passed `params = list()` to queries without placeholders.
  RSQLite refuses that ("Query does not require parameters."), so `refeicao.marcar` (marking a planned
  meal as cooked) and `estado()` failed on real R. The in-memory store had hidden this.
* **SQLite tested for real without R**: `tests/webr/dbi_node_sqlite.R` stands in for DBI/RSQLite in webR,
  on real SQLite (Node's built-in `node:sqlite`). It enforces RSQLite's binding rules, and it reproduces
  the error above with the old code. `test-repo_sqlite.R` (53 checks) and the `repo_sqlite()` examples
  now run in `tools/verificar.py` too.
* **No binary files among the new test inputs**: the copy that reached the Mac had lost the 2.0.1 binary
  fixtures and every hidden file. The fake OCR files of the reader test are now bytes in
  `tests/fixtures/leitor_mini/ocr.json`. The example photo is produced by the new `foto_exemplo()` from
  bytes in the R code; `inst/extdata/exemplo_com_gps.jpg` is gone.
* **`tools/manifesto.json`** lists every file of the repository (size and SHA-256), plus the text of the
  hidden files. The preflight of `tools/verificar.py` (also `--preflight` alone) now does the following:
  * names any missing file;
  * puts back missing hidden files, and completes a `.Rbuildignore` that is a subset of the repository's.
    That subset is what let `node_modules/`, `srcjs/`, `docs/`... into the tarball;
  * removes stale roxygen pages (`man/linha_de_lote.Rd`);
  * resets file times in the future (a zip made in UTC and opened in Brasília).
* **`tools/simular_tarball.py`** applies R's own `R CMD build` rules to list what would go into the
  tarball. It flags non-standard top-level entries, hidden files, long paths, executables and future
  time stamps, and prints the `.Rbuildignore` lines to add. It is a suite of `verificar.py`.
* `test-catalogo.R`: the synonym-collision test is no longer "empty" when nothing collides.

# comerHoje 2.0.1

Packaging fixes after the first `R CMD check` on a real R installation (macOS, R 4.6). No change to the
app's behaviour, except the catalog-seed fix below.

* **Documentation**: every exported function has a complete help page (title, description, every
  argument, value, runnable examples). `man/` is generated from the roxygen comments and committed;
  `DESCRIPTION` declares `Roxygen: list(markdown = TRUE)`. No more "lost braces" in Rd.
* **Tests run under R CMD check**: added `tests/testthat.R`. New tests: `test-exportar.R` (the reader
  embedded in the standalone HTML, byte-identical to the node build) and `test-repo_sqlite.R` (SQLite
  reaches the same state as the in-memory store, survives close/reopen, keeps learned synonyms when the
  catalog is re-seeded; skipped without RSQLite).
* **Portable R code**: non-ASCII characters in R strings are written as `\uXXXX`
  (`tools/r_ascii.py`); comments keep their accents.
* **`inst/html` renamed to `inst/standalone`**: `inst/html` is reserved by R. The 40 MB HTML with the
  embedded reader is no longer shipped inside the package. `export_html(leitor = TRUE)` assembles it from
  the models the Shiny app already ships, and `node tools/build.mjs --html-ocr` writes it to `dist/`.
  Installed size went down from 74.6 MB to about 35 MB.
* **Bug fix, catalog seed**: `catalogo_semear()` used `INSERT OR REPLACE`. In SQLite that deletes the
  old row, and the `ON DELETE CASCADE` of `ingrediente_sinonimos` then dropped the synonyms learned by
  the household whenever the catalog changed. It now upserts (`ON CONFLICT ... DO UPDATE`).
* **Tooling**: `tools/verificar.py` runs a preflight first. It runs `npm ci --ignore-scripts` when
  `node_modules` is missing. It stops with the exact command when hidden files (`.Rbuildignore`,
  `.github/`...) or v1 leftovers (`R/db.R`, `R/solver.R`, `modules/`, `global.R`) are found. It prints
  the broken links. It also runs new suites: the R CMD check steps that need no installed package, in
  webR; `man/` in sync; ASCII. The Shiny bench fails in seconds, with the reason, instead of timing out.
* `Dockerfile`: copies `tools/lib/` (used by the build).

# comerHoje 2.0.0

Rework of the v1 prototype: one front end (`srcjs/`) built into three deliveries (Shiny, Quarto,
standalone HTML) with the Taiga design system (Lumen and Neue). Also: on-device expiry reading
(PaddleOCR), SQLite with idempotent operations and an outbox, the Google Sheet through the owner's Apps
Script, NFC-e from Santa Catarina, and the metadata remover. See `docs/ARCHITECTURE.md`.
