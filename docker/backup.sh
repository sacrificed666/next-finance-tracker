#!/bin/sh
# Nightly database backups for the production stack (the `backup` service).
#
# Once a day at BACKUP_HOUR (container time, UTC unless TZ is set) it writes a
# compressed pg_dump to /backups/auto, checks that pg_restore can read it back, and
# deletes dumps older than BACKUP_KEEP_DAYS. It also takes one right away when today
# has none yet, so a fresh deploy is covered from the first minute.
#
# The dump is the database as stored: every financial record is still sealed with
# DATA_ENCRYPTION_KEY, so a copy is useless without that key — keep both, apart.
#
# BACKUP_ONCE=1 takes a single dump and exits (make prod-db-backup-now, tests).

set -eu

OUT=/backups/auto
HOUR="${BACKUP_HOUR:-3}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
PREFIX="${BACKUP_PREFIX:-prod}"

mkdir -p "$OUT"

log() {
  echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') $*"
}

dump() {
  stamp="$(date +%Y%m%d-%H%M%S)"
  file="$OUT/$PREFIX-$stamp.dump"
  tmp="$file.partial"
  if ! pg_dump --format=custom --compress=6 --no-owner --file="$tmp"; then
    rm -f "$tmp"
    log "FAILED: pg_dump exited with an error"
    return 1
  fi
  # A dump that cannot be listed cannot be restored; never keep one.
  if ! pg_restore --list "$tmp" > /dev/null; then
    rm -f "$tmp"
    log "FAILED: the dump could not be read back"
    return 1
  fi
  mv "$tmp" "$file"
  log "saved $file ($(du -h "$file" | cut -f1))"
  find "$OUT" -name "$PREFIX-*.dump" -type f -mtime "+$KEEP" -print -delete | while read -r old; do
    log "removed $old (older than $KEEP days)"
  done
}

took_today() {
  ls "$OUT/$PREFIX-$(date +%Y%m%d)"-*.dump > /dev/null 2>&1
}

seconds_until_next_run() {
  now_h=$(date +%H | sed 's/^0//')
  now_m=$(date +%M | sed 's/^0//')
  now_s=$(date +%S | sed 's/^0//')
  elapsed=$(( ${now_h:-0} * 3600 + ${now_m:-0} * 60 + ${now_s:-0} ))
  target=$(( HOUR * 3600 ))
  if [ "$elapsed" -lt "$target" ]; then
    echo $(( target - elapsed ))
  else
    echo $(( 86400 - elapsed + target ))
  fi
}

until pg_isready --quiet; do
  log "waiting for the database…"
  sleep 5
done

if [ "${BACKUP_ONCE:-0}" = "1" ]; then
  dump
  exit $?
fi

log "daily at ${HOUR}:00, keeping ${KEEP} days in $OUT"
took_today || dump || true

while :; do
  wait_s=$(seconds_until_next_run)
  log "next backup in $(( wait_s / 3600 ))h $(( wait_s % 3600 / 60 ))m"
  sleep "$wait_s"
  # A failed night is logged and retried the next night; the service keeps running.
  dump || true
done
