#!/bin/bash

# ============================================================
#  VVAULT — IMAGE CONTENTS VERIFICATION SCRIPT
#  Run this BEFORE pushing to GHCR
#  Confirms exactly what files are inside your Docker images
# ============================================================

GREEN='\033[0;92m'
CYAN='\033[0;96m'
YELLOW='\033[0;93m'
RED='\033[0;91m'
DIM='\033[0;90m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}  Vvault — Image Contents Verification${RESET}"
echo -e "${DIM}  Run this before every push to GHCR${RESET}"
echo ""

# ── BUILD LOCALLY FIRST ───────────────────────────────────────
echo -e "${CYAN}  [1/4]${RESET} Building backend image locally for inspection..."
docker build -f Dockerfile.backend.prod -t vvault-verify-backend:test . -q
echo -e "${GREEN}  ✓ Backend built${RESET}"
echo ""

# ── CHECK WHAT'S IN THE IMAGE ────────────────────────────────
echo -e "${CYAN}  [2/4]${RESET} Files inside backend image (/app directory):"
echo ""
docker run --rm vvault-verify-backend:test find /app -type f | sort
echo ""

# ── CHECK FOR SECRETS ─────────────────────────────────────────
echo -e "${CYAN}  [3/4]${RESET} Checking for sensitive files in backend image..."
echo ""

ISSUES=0

# Check for .env
if docker run --rm vvault-verify-backend:test test -f /app/.env 2>/dev/null; then
    echo -e "${RED}  ✗ CRITICAL: .env file found in image — contains secrets!${RESET}"
    ISSUES=$((ISSUES+1))
else
    echo -e "${GREEN}  ✓ .env not in image${RESET}"
fi

# Check for any .env variants
if docker run --rm vvault-verify-backend:test sh -c 'ls /app/.env* 2>/dev/null | grep -v .env.example' 2>/dev/null | grep -q '.'; then
    echo -e "${RED}  ✗ CRITICAL: .env variant files found in image!${RESET}"
    ISSUES=$((ISSUES+1))
else
    echo -e "${GREEN}  ✓ No .env variants in image${RESET}"
fi

# Check for private keys
if docker run --rm vvault-verify-backend:test sh -c 'find /app -name "*.key" -o -name "*.pem" -o -name "*.p12" 2>/dev/null' | grep -q '.'; then
    echo -e "${RED}  ✗ CRITICAL: Private key files found in image!${RESET}"
    ISSUES=$((ISSUES+1))
else
    echo -e "${GREEN}  ✓ No private keys in image${RESET}"
fi

# Check for license files
if docker run --rm vvault-verify-backend:test sh -c 'find /app -name "*.vvault-license" 2>/dev/null' | grep -q '.'; then
    echo -e "${YELLOW}  Warning: License files found in image${RESET}"
    ISSUES=$((ISSUES+1))
else
    echo -e "${GREEN}  ✓ No license files in image${RESET}"
fi

# Check for git directory
if docker run --rm vvault-verify-backend:test test -d /app/.git 2>/dev/null; then
    echo -e "${RED}  ✗ .git directory found in image — contains full repo history!${RESET}"
    ISSUES=$((ISSUES+1))
else
    echo -e "${GREEN}  ✓ No .git directory in image${RESET}"
fi

# Check for installer files
if docker run --rm vvault-verify-backend:test sh -c 'find /app -name "install*.bat" -o -name "install*.sh" 2>/dev/null' | grep -q '.'; then
    echo -e "${YELLOW}  Warning: Installer files found in image (not critical but unnecessary)${RESET}"
else
    echo -e "${GREEN}  ✓ No installer files in image${RESET}"
fi

# Check for __pycache__
if docker run --rm vvault-verify-backend:test sh -c 'find /app -name "__pycache__" 2>/dev/null' | grep -q '.'; then
    echo -e "${YELLOW}  Note: __pycache__ directories found (harmless but adds size)${RESET}"
else
    echo -e "${GREEN}  ✓ No __pycache__ directories${RESET}"
fi

echo ""

# ── CHECK IMAGE SIZE ──────────────────────────────────────────
echo -e "${CYAN}  [4/4]${RESET} Image size check:"
BACKEND_SIZE=$(docker image inspect vvault-verify-backend:test --format='{{.Size}}' | awk '{printf "%.0f MB", $1/1048576}')
echo -e "  Backend image size: ${CYAN}${BACKEND_SIZE}${RESET}"
echo -e "${DIM}  Expected: 300-500 MB (Python slim + dependencies)${RESET}"
echo ""

# ── SUMMARY ───────────────────────────────────────────────────
echo -e "${DIM}  ────────────────────────────────────${RESET}"
echo ""

if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}  ✓ All checks passed — safe to push to GHCR${RESET}"
    echo ""
    echo -e "${DIM}  Run: bash build-and-push.sh 1.0.0${RESET}"
else
    echo -e "${RED}  ✗ ${ISSUES} issue(s) found — DO NOT push until resolved${RESET}"
    echo ""
    echo -e "${DIM}  Fix issues above then run this script again.${RESET}"
    echo -e "${DIM}  Check your .dockerignore file is in the repo root.${RESET}"
fi

# ── CLEANUP ───────────────────────────────────────────────────
echo ""
echo -e "${DIM}  Cleaning up test image...${RESET}"
docker rmi vvault-verify-backend:test -f &>/dev/null
echo -e "${GREEN}  ✓ Done${RESET}"
echo ""
