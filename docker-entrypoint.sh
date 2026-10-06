#!/bin/sh
# exec, so SIGTERM from Container Apps reaches node directly.
set -e
command="$1"
[ "$#" -gt 0 ] && shift
case "$command" in
  api) exec node --import tsx apps/api/src/main.ts "$@" ;;
  intake) exec node --import tsx apps/intake/src/main.ts "$@" ;;
  worker) exec node --import tsx apps/worker/src/main.ts "$@" ;;
  migrate) exec node --import tsx apps/cli/src/main.ts migrate "$@" ;;
  *) echo "Usage: api | intake | worker [--watch] | migrate" >&2; exit 2 ;;
esac
