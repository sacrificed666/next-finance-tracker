#!/bin/bash
set -euo pipefail

mode="${1:-check}"
mkdir -p /work
cd /src
tar --exclude=./node_modules --exclude=./.next --exclude=./.git --exclude=./backups \
  --exclude='./.env' --exclude='./.env.local' --exclude=./test-results --exclude=./playwright-report \
  --exclude=./e2e/visual.spec.ts-snapshots -cf - . | tar -C /work -xf -
cd /work

npm ci --no-audit --no-fund --cache /cache/npm --prefer-offline > /tmp/npm.log 2>&1 || { tail -n 30 /tmp/npm.log; exit 1; }

export NEXT_TELEMETRY_DISABLED=1
export AUTH_SECRET="$(openssl rand -base64 32)"
export DATA_ENCRYPTION_KEY="$(openssl rand -base64 32)"
export DATABASE_URL="${DATABASE_URL:-postgresql://finance:finance@finance-visual-db:5432/finance_tracker}"
export AUTH_URL=http://localhost:3000
export AUTH_TRUST_HOST=true
export REMINDERS=off

npx next build > /tmp/build.log 2>&1 || { tail -n 40 /tmp/build.log; exit 1; }
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
(cd .next/standalone && PORT=3000 HOSTNAME=127.0.0.1 nohup node server.js > /tmp/server.log 2>&1 &)
for _ in $(seq 1 60); do curl -sf http://localhost:3000/login > /dev/null && break; sleep 1; done

if [ "$mode" = "update" ]; then
  npx playwright test e2e/visual.spec.ts --reporter=list --update-snapshots=all
else
  npx playwright test e2e/visual.spec.ts --reporter=list
fi
