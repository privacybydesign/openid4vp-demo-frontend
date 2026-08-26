#!/bin/sh
set -e

# --- Public config: safe to inline into the client bundle at build time. ------
# These get the VITE_ prefix so Vite bakes them into the static assets. Only
# export when the source var is set: `export VITE_X=$UNSET` in sh puts an empty
# string into the environment, which Vite would bake in over the code default.
[ -n "$API_URL" ] && export VITE_API_URL=$API_URL
[ -n "$DCAPI_API_URL" ] && export VITE_DCAPI_API_URL=$DCAPI_API_URL
[ -n "$VERAMO_ISSUER_API_URL" ] && export VITE_VERAMO_ISSUER_API_URL=$VERAMO_ISSUER_API_URL
[ -n "$IRMA_SERVER_URL" ] && export VITE_IRMA_SERVER_URL=$IRMA_SERVER_URL
[ -n "$UNIVERSAL_LINK_HOST" ] && export VITE_UNIVERSAL_LINK_HOST=$UNIVERSAL_LINK_HOST

# --- Build the static SPA, then serve it behind the BFF proxy. ----------------
# The admin tokens (VERAMO_ADMIN_TOKEN, VERAMO_ISSUER_ADMIN_TOKEN) are NOT
# exported with a VITE_ prefix, so they never reach the browser. server.js reads
# them (and the upstream URLs/names) from the plain server-side env passed in by
# docker-compose.yml.
npm run build
exec npm start
