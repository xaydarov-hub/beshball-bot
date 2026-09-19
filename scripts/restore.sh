#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
BACKUP_DIR="${1:?Usage: ./scripts/restore.sh BACKUP_DIR NEW_DATABASE_NAME}"
RESTORE_DATABASE="${2:?Use a NEW database name, e.g. beshball_restored_20260907}"
if [[ ! "$RESTORE_DATABASE" =~ ^beshball_restored_[a-z0-9_]+$ ]]; then echo "Unsafe database name"; exit 1; fi
read -r -p "Create a new database and restore matching object keys (existing objects may be overwritten)? Type RESTORE: " answer
[ "$answer" = RESTORE ] || exit 1
sha256sum -c "$BACKUP_DIR/postgres.dump.sha256"
docker compose exec -T postgres createdb -U beshball "$RESTORE_DATABASE"
docker compose exec -T postgres pg_restore -U beshball --exit-on-error --single-transaction -d "$RESTORE_DATABASE" < "$BACKUP_DIR/postgres.dump"
node scripts/storage-backup.mjs restore "$BACKUP_DIR/objects"
echo "Restored to $RESTORE_DATABASE. Verify before changing DATABASE_URL. Existing database was retained."
