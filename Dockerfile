# comerHoje: Shiny + SQLite. Stage 1 builds the front end (incl. the on-device reader, ~30 MB of models);
# stage 2 is R with only what the app uses.   docker build -t comerhoje . && docker run -p 8080:8080 -v comerhoje-dados:/data --env-file .env comerhoje
FROM node:22-bookworm-slim AS frontend
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY DESCRIPTION ./
COPY srcjs srcjs
COPY tools/build.mjs tools/build.mjs
COPY tools/lib tools/lib
COPY inst inst
RUN node tools/build.mjs

FROM rocker/r-ver:4.6.0
ARG MILP=false
RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-dev libcurl4-openssl-dev libssl-dev \
      $( [ "$MILP" = "true" ] && echo libglpk-dev ) && rm -rf /var/lib/apt/lists/*
RUN install2.r --error --skipinstalled shiny htmltools jsonlite DBI RSQLite httr2 pkgload \
 && if [ "$MILP" = "true" ]; then install2.r --error ompr ompr.roi ROI.plugin.glpk; fi
WORKDIR /app
COPY DESCRIPTION NAMESPACE LICENSE app.R ./
COPY R R
COPY --from=frontend /src/inst inst
ENV COMERHOJE_DB=/data/comerhoje.db COMERHOJE_TZ=America/Sao_Paulo TZ=America/Sao_Paulo
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s CMD R -q -e 'quit(status = !identical(httr2::resp_status(httr2::req_perform(httr2::request("http://127.0.0.1:8080"))), 200L))' || exit 1
CMD ["R", "-q", "-e", "shiny::runApp('/app', host = '0.0.0.0', port = 8080, launch.browser = FALSE)"]
