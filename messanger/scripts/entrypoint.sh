#!/usr/bin/env sh
set -eu

node /app/scripts/validate-env.mjs --mode=runtime
exec node /app/server.js
