#!/bin/bash
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_DIR="backups"
BACKUP_FILE="$BACKUP_DIR/vvault_backup_$TIMESTAMP.sql"

mkdir -p $BACKUP_DIR

echo "Starting Vvault backup..."

docker exec vvault_db pg_dump -U postgres vvault > $BACKUP_FILE

if [ $? -eq 0 ]; then
    SIZE=$(du -h $BACKUP_FILE | cut -f1)
    echo "Backup complete: $BACKUP_FILE ($SIZE)"
else
    echo "Backup failed - check Docker is running"
    rm -f $BACKUP_FILE
fi
