fixture <- function(nome) jsonlite::fromJSON(test_path("..", "fixtures", nome), simplifyVector = FALSE)
na_se_null <- function(x) if (is.null(x)) NA else x
data_ou_na <- function(x) if (is.null(x)) as.Date(NA) else as.Date(x)
