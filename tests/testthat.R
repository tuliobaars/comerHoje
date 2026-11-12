# This file is part of the standard setup for testthat. It runs during R CMD check.
# The same tests/testthat/*.R also run in webR (tests/webr/run_all.R) with a small shim.
library(testthat)
library(comerHoje)

test_check("comerHoje")
