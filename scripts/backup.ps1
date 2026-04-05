$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = "backups"
$backupFile = "$backupDir\vvault_backup_$timestamp.sql"

if (!(Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

Write-Host "Starting Vvault backup..."

docker exec vvault_db pg_dump -U postgres vvault > $backupFile

if ($LASTEXITCODE -eq 0) {
    $size = (Get-Item $backupFile).Length / 1KB
    Write-Host "Backup complete: $backupFile ($([math]::Round($size, 1)) KB)"
} else {
    Write-Host "Backup failed - check Docker is running and vvault_db container exists"
    Remove-Item $backupFile -ErrorAction SilentlyContinue
}
