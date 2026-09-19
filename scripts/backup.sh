#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
BACKUP_DIR="${1:?Usage: ./scripts/backup.sh ./backups/unique-name}"
if [ -e "$BACKUP_DIR" ]; then echo "Use a new backup directory."; exit 1; fi
mkdir -p "$BACKUP_DIR"
docker compose exec -T postgres pg_dump -Fc -U beshball beshball > "$BACKUP_DIR/postgres.dump"
node scripts/storage-backup.mjs backup "$BACKUP_DIR/objects"
sha256sum "$BACKUP_DIR/postgres.dump" > "$BACKUP_DIR/postgres.dump.sha256"
echo "Database and object backup complete: $BACKUP_DIR"
