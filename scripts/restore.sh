#!/bin/bash
if [ -z "$1" ]; then
    echo "Usage: ./restore.sh backups/vvault_backup_2024-01-01_12-00-00.sql"
    exit 1
fi

if [ ! -f "$1" ]; then
    echo "Error: Backup file not found: $1"
    exit 1
fi

echo "Restoring from: $1"
echo "WARNING: This will overwrite all current Vvault data."
read -p "Type YES to continue: " confirm

if [ "$confirm" != "YES" ]; then
    echo "Restore cancelled."
    exit 0
fi

docker exec -i vvault_db psql -U postgres vvault < $1

if [ $? -eq 0 ]; then
    echo "Restore complete."
else
    echo "Restore failed - check the backup file is valid"
fi
