# Deployment entry point (shinyapps.io, Posit Connect, Docker): the package from this folder.
#   shinyapps.io: rsconnect::deployApp(appFiles = ...) (see docs/ARCHITECTURE.md §17). Set COMERHOJE_DB
#   and, ideally, the Google Sheet: the disk there is ephemeral and the sheet restores the stock.
pkgload::load_all(".", export_all = FALSE, helpers = FALSE, attach_testthat = FALSE, quiet = TRUE)
options(comerHoje.framework = Sys.getenv("COMERHOJE_FRAMEWORK", "lumen"))
comerHoje::comerhoje_app(caminho_db = Sys.getenv("COMERHOJE_DB", "comerhoje.db"))
