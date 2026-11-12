# Deploy to shinyapps.io. Run from the repository root AFTER `node tools/build.mjs` (the bundle takes the
# on-device reader in inst/app/www/ocr/, ~30 MB).
# IMPORTANT on shinyapps.io:
#  * the disk is ephemeral: SQLite is lost on restarts/redeploys. Configure the Google Sheet (Apps Script):
#    every change goes there and, on a cold start with an empty database, the first sync restores the stock.
#  * ONE instance only (Settings -> Advanced: Max processes per instance may be > 1, but "Instances" = 1
#    and scale-out off), because each instance would have its own SQLite.
#  * secrets in Settings -> Environment variables (COMERHOJE_PLANILHA_SCRIPT, COMERHOJE_PLANILHA_TOKEN,
#    COMERHOJE_VISAO_PROVEDOR, COMERHOJE_VISAO_API_KEY, COMERHOJE_VISAO_MODELO).
stopifnot(file.exists("inst/app/www/comerhoje.js"), dir.exists("inst/app/www/ocr"))
rsconnect::deployApp(
  appDir = ".", appName = Sys.getenv("COMERHOJE_APP_NOME", "comerhoje"),
  appFiles = c("app.R", "DESCRIPTION", "NAMESPACE", "LICENSE", "R", "inst"),
  envVars = c("COMERHOJE_DB", "COMERHOJE_TZ"), forceUpdate = TRUE)
