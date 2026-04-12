#!/bin/bash

# ============================================================
#  VVAULT — BUILD AND PUSH TO GHCR
#  Run this every time you release an update
#
#  First time setup:
#    echo YOUR_GHCR_TOKEN | docker login ghcr.io -u gbhide1993 --password-stdin
#
#  Usage:
#    bash build-and-push.sh           → push :latest only
#    bash build-and-push.sh 1.1.0     → push :1.1.0 and :latest
# ============================================================

set -e

# ── CONFIG ───────────────────────────────────────────────────
GITHUB_USER="gbhide1993"
REGISTRY="ghcr.io"
BACKEND_IMAGE="${REGISTRY}/${GITHUB_USER}/vvault-backend"
FRONTEND_IMAGE="${REGISTRY}/${GITHUB_USER}/vvault-frontend"
VERSION=${1:-""}

# Dockerfiles
BACKEND_DOCKERFILE="Dockerfile.backend.prod"
FRONTEND_DOCKERFILE="frontend/Dockerfile"

# Colors
GREEN='\033[0;92m'
CYAN='\033[0;96m'
YELLOW='\033[0;93m'
RED='\033[0;91m'
DIM='\033[0;90m'
RESET='\033[0m'

clear
echo ""
echo -e "${CYAN}  Vvault — Build & Push to GHCR${RESET}"
echo -e "${DIM}  ────────────────────────────────────${RESET}"
echo ""

# ── VERSION ──────────────────────────────────────────────────
if [ -n "$VERSION" ]; then
    echo -e "  Version: ${CYAN}${VERSION}${RESET} (+ latest)"
else
    echo -e "  Version: ${CYAN}latest${RESET} only"
    echo -e "${DIM}  Tip: Pass a version to tag a release: bash build-and-push.sh 1.1.0${RESET}"
fi
echo ""

# ── PRE-CHECKS ───────────────────────────────────────────────
echo -e "${CYAN}  Checking prerequisites...${RESET}"

if ! docker info &>/dev/null; then
    echo -e "${RED}  ✗ Docker not running. Start Docker Desktop first.${RESET}"
    exit 1
fi
echo -e "${GREEN}  ✓ Docker running${RESET}"

if [ ! -f "$BACKEND_DOCKERFILE" ]; then
    echo -e "${RED}  ✗ $BACKEND_DOCKERFILE not found in current directory.${RESET}"
    echo -e "${DIM}  Run this script from your Vvault repo root.${RESET}"
    exit 1
fi
echo -e "${GREEN}  ✓ Backend Dockerfile found${RESET}"

if [ ! -f "$FRONTEND_DOCKERFILE" ]; then
    echo -e "${RED}  ✗ $FRONTEND_DOCKERFILE not found.${RESET}"
    exit 1
fi
echo -e "${GREEN}  ✓ Frontend Dockerfile found${RESET}"

echo ""

# ── BUILD BACKEND ─────────────────────────────────────────────
echo -e "${CYAN}  [1/4] Building backend image...${RESET}"
echo -e "${DIM}  This takes 2-4 minutes on first build (layer caching speeds up later)${RESET}"
echo ""

if [ -n "$VERSION" ]; then
    docker build \
        --platform linux/amd64 \
        -f "$BACKEND_DOCKERFILE" \
        -t "${BACKEND_IMAGE}:latest" \
        -t "${BACKEND_IMAGE}:${VERSION}" \
        --label "org.opencontainers.image.source=https://github.com/${GITHUB_USER}/vvault" \
        --label "org.opencontainers.image.description=Vvault Backend" \
        --label "org.opencontainers.image.version=${VERSION}" \
        --label "org.opencontainers.image.licenses=Proprietary" \
        .
else
    docker build \
        --platform linux/amd64 \
        -f "$BACKEND_DOCKERFILE" \
        -t "${BACKEND_IMAGE}:latest" \
        --label "org.opencontainers.image.source=https://github.com/${GITHUB_USER}/vvault" \
        --label "org.opencontainers.image.description=Vvault Backend" \
        --label "org.opencontainers.image.licenses=Proprietary" \
        .
fi

echo ""
echo -e "${GREEN}  ✓ Backend built${RESET}"

# ── BUILD FRONTEND ────────────────────────────────────────────
echo ""
echo -e "${CYAN}  [2/4] Building frontend image...${RESET}"
echo ""

if [ -n "$VERSION" ]; then
    docker build \
        --platform linux/amd64 \
        -f "$FRONTEND_DOCKERFILE" \
        -t "${FRONTEND_IMAGE}:latest" \
        -t "${FRONTEND_IMAGE}:${VERSION}" \
        --label "org.opencontainers.image.source=https://github.com/${GITHUB_USER}/vvault" \
        --label "org.opencontainers.image.description=Vvault Frontend" \
        --label "org.opencontainers.image.version=${VERSION}" \
        --label "org.opencontainers.image.licenses=Proprietary" \
        ./frontend
else
    docker build \
        --platform linux/amd64 \
        -f "$FRONTEND_DOCKERFILE" \
        -t "${FRONTEND_IMAGE}:latest" \
        --label "org.opencontainers.image.source=https://github.com/${GITHUB_USER}/vvault" \
        --label "org.opencontainers.image.description=Vvault Frontend" \
        --label "org.opencontainers.image.licenses=Proprietary" \
        ./frontend
fi

echo ""
echo -e "${GREEN}  ✓ Frontend built${RESET}"

# ── PUSH BACKEND ──────────────────────────────────────────────
echo ""
echo -e "${CYAN}  [3/4] Pushing backend to GHCR...${RESET}"
echo ""

docker push "${BACKEND_IMAGE}:latest"
[ -n "$VERSION" ] && docker push "${BACKEND_IMAGE}:${VERSION}"

echo ""
echo -e "${GREEN}  ✓ Backend pushed${RESET}"

# ── PUSH FRONTEND ─────────────────────────────────────────────
echo ""
echo -e "${CYAN}  [4/4] Pushing frontend to GHCR...${RESET}"
echo ""

docker push "${FRONTEND_IMAGE}:latest"
[ -n "$VERSION" ] && docker push "${FRONTEND_IMAGE}:${VERSION}"

echo ""
echo -e "${GREEN}  ✓ Frontend pushed${RESET}"

# ── DONE ─────────────────────────────────────────────────────
echo ""
echo -e "${DIM}  ────────────────────────────────────${RESET}"
echo ""
echo -e "${GREEN}  ✓ Release complete!${RESET}"
echo ""
echo -e "  Images live at:"
echo -e "${CYAN}  ${BACKEND_IMAGE}:latest${RESET}"
echo -e "${CYAN}  ${FRONTEND_IMAGE}:latest${RESET}"
if [ -n "$VERSION" ]; then
    echo -e "${CYAN}  ${BACKEND_IMAGE}:${VERSION}${RESET}"
    echo -e "${CYAN}  ${FRONTEND_IMAGE}:${VERSION}${RESET}"
fi
echo ""
echo -e "${DIM}  Customers update with:${RESET}"
echo -e "${CYAN}  docker-compose pull && docker-compose up -d${RESET}"
echo ""
if [ -n "$VERSION" ]; then
    echo -e "${YELLOW}  Checklist:${RESET}"
    echo -e "${DIM}  □ git tag v${VERSION} && git push --tags${RESET}"
    echo -e "${DIM}  □ Update CHANGELOG.md${RESET}"
    echo -e "${DIM}  □ Email customers if breaking changes${RESET}"
    echo ""
fi