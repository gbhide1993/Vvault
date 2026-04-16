# Vvault Windows Installer
# Run as Administrator from the Vvault folder:
#   powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"
$VvaultDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Vvault Installer" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Check Docker ──────────────────────────────────────
Write-Host "[1/6] Checking Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    Write-Host "      OK: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "ERROR: Docker Desktop is not installed or not running." -ForegroundColor Red
    Write-Host "       Download Docker Desktop from https://www.docker.com/products/docker-desktop" -ForegroundColor Red
    Write-Host "       Install it, start it, then re-run this script." -ForegroundColor Red
    exit 1
}

# ── 2. Check license file ────────────────────────────────
Write-Host "[2/6] Checking license file..." -ForegroundColor Yellow
$licenseFiles = Get-ChildItem -Path $VvaultDir -Filter "*.vvault-license" -ErrorAction SilentlyContinue
if ($licenseFiles.Count -eq 0) {
    Write-Host ""
    Write-Host "WARNING: No .vvault-license file found in:" -ForegroundColor Yellow
    Write-Host "         $VvaultDir" -ForegroundColor Yellow
    Write-Host "         Vvault will start but features may be limited." -ForegroundColor Yellow
    Write-Host "         Place your .vvault-license file here and restart." -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "      OK: License file found — $($licenseFiles[0].Name)" -ForegroundColor Green
}

# ── 3. Set up .env ───────────────────────────────────────
Write-Host "[3/6] Setting up environment..." -ForegroundColor Yellow
$envFile = Join-Path $VvaultDir ".env"
$envExample = Join-Path $VvaultDir ".env.example"

if (-not (Test-Path $envFile)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
        Write-Host "      Created .env from .env.example" -ForegroundColor Green

        # Generate a secure JWT secret
        $jwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
        (Get-Content $envFile) -replace "JWT_SECRET=.*", "JWT_SECRET=$jwtSecret" | Set-Content $envFile

        Write-Host "      Generated JWT_SECRET automatically" -ForegroundColor Green
        Write-Host ""
        Write-Host "  IMPORTANT: Open .env and set a strong DB_PASSWORD before continuing." -ForegroundColor Yellow
        $confirm = Read-Host "  Press Enter once you have updated .env, or type 'skip' to continue anyway"
    } else {
        Write-Host "      WARNING: .env.example not found. Creating minimal .env..." -ForegroundColor Yellow
        $jwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
        @"
DB_PASSWORD=changeme
JWT_SECRET=$jwtSecret
"@ | Set-Content $envFile
        Write-Host "      IMPORTANT: Update DB_PASSWORD in .env before first run." -ForegroundColor Yellow
    }
} else {
    Write-Host "      OK: .env already exists" -ForegroundColor Green
}

# ── 4. Load Docker images (air-gapped) ──────────────────
Write-Host "[4/6] Loading Docker images..." -ForegroundColor Yellow
$imagesDir = Join-Path $VvaultDir "images"

if (Test-Path $imagesDir) {
    $tarFiles = Get-ChildItem -Path $imagesDir -Filter "*.tar" -ErrorAction SilentlyContinue
    if ($tarFiles.Count -gt 0) {
        foreach ($tar in $tarFiles) {
            Write-Host "      Loading $($tar.Name)..." -ForegroundColor Gray
            docker load -i $tar.FullName
            if ($LASTEXITCODE -ne 0) {
                Write-Host "      WARNING: Failed to load $($tar.Name)" -ForegroundColor Yellow
            } else {
                Write-Host "      OK: $($tar.Name)" -ForegroundColor Green
            }
        }
    } else {
        Write-Host "      No .tar image files found in images\ — will pull from registry" -ForegroundColor Gray
    }
} else {
    Write-Host "      No images\ folder found — Docker will pull images on first start" -ForegroundColor Gray
}

# ── 5. Start Vvault ─────────────────────────────────────
Write-Host "[5/6] Starting Vvault..." -ForegroundColor Yellow
Set-Location $VvaultDir

docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: docker-compose up failed. Check the output above." -ForegroundColor Red
    exit 1
}

Write-Host "      OK: Containers started" -ForegroundColor Green

# ── 6. Wait for health ───────────────────────────────────
Write-Host "[6/6] Waiting for Vvault to be ready..." -ForegroundColor Yellow
$maxWait = 120
$waited = 0
$ready = $false

while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 5
    $waited += 5
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        Write-Host "      Waiting... ($waited/$maxWait s)" -ForegroundColor Gray
    }
}

Write-Host ""
if ($ready) {
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "  Vvault is ready!" -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Open your browser and go to:" -ForegroundColor Cyan
    Write-Host "  https://localhost:3443" -ForegroundColor White
    Write-Host ""
    Write-Host "  Default login: admin / admin" -ForegroundColor Yellow
    Write-Host "  You will be prompted to change the password on first login." -ForegroundColor Yellow
    Write-Host ""

    try { Start-Process "https://localhost:3443" } catch {}
} else {
    Write-Host "================================================" -ForegroundColor Yellow
    Write-Host "  Vvault started but health check timed out." -ForegroundColor Yellow
    Write-Host "================================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Ollama is downloading AI models — this takes a few minutes on first run." -ForegroundColor Gray
    Write-Host "  Try opening https://localhost:3443 in 2-3 minutes." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  To check status: docker-compose logs -f" -ForegroundColor Gray
}
