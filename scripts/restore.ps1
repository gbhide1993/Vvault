param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile
)

if (!(Test-Path $BackupFile)) {
    Write-Host "Error: Backup file not found: $BackupFile"
    exit 1
}

Write-Host "Restoring from: $BackupFile"
Write-Host "WARNING: This will overwrite all current Vvault data."
$confirm = Read-Host "Type YES to continue"

if ($confirm -ne "YES") {
    Write-Host "Restore cancelled."
    exit 0
}

docker exec -i vvault_db psql -U postgres vvault < $BackupFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "Restore complete."
} else {
    Write-Host "Restore failed - check the backup file is valid"
}
