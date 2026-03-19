#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$ROOT/.env"

# ── Colour helpers ─────────────────────────────────────────────────────────────
bold='\033[1m'; cyan='\033[1;36m'; green='\033[1;32m'; yellow='\033[1;33m'; red='\033[1;31m'; reset='\033[0m'
info()    { echo -e "${cyan}[worldstate]${reset} $*"; }
success() { echo -e "${green}[worldstate]${reset} $*"; }
warn()    { echo -e "${yellow}[worldstate]${reset} $*"; }
err()     { echo -e "${red}[worldstate]${reset} $*" >&2; }

echo -e "\n${bold}${cyan}  ██╗    ██╗ ██████╗ ██████╗ ██╗     ██████╗ ███████╗████████╗ █████╗ ████████╗███████╗${reset}"
echo -e "${bold}${cyan}  ██║    ██║██╔═══██╗██╔══██╗██║     ██╔══██╗██╔════╝╚══██╔══╝██╔══██╗╚══██╔══╝██╔════╝${reset}"
echo -e "${bold}${cyan}  ██║ █╗ ██║██║   ██║██████╔╝██║     ██║  ██║███████╗   ██║   ███████║   ██║   █████╗  ${reset}"
echo -e "${bold}${cyan}  ██║███╗██║██║   ██║██╔══██╗██║     ██║  ██║╚════██║   ██║   ██╔══██║   ██║   ██╔══╝  ${reset}"
echo -e "${bold}${cyan}  ╚███╔███╔╝╚██████╔╝██║  ██║███████╗██████╔╝███████║   ██║   ██║  ██║   ██║   ███████╗${reset}"
echo -e "${bold}${cyan}   ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝   ╚══════╝${reset}\n"

# ── Check Docker ───────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  err "Docker is not installed. Install Docker Desktop from https://docker.com and try again."
  exit 1
fi
if ! docker info &>/dev/null; then
  err "Docker is not running. Start Docker Desktop and try again."
  exit 1
fi

# ── Create .env if missing ─────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  warn ".env not found — let's create it."
  echo ""

  read -rp "  OpenAI API key (sk-...): " OPENAI_API_KEY
  [[ -z "$OPENAI_API_KEY" ]] && { err "OpenAI API key is required."; exit 1; }

  read -rp "  Google Gemini API key  [enter to skip]: " GOOGLE_API_KEY
  read -rp "  Finnhub API key        [enter to skip]: " FINNHUB_API_KEY
  read -rp "  Reddit client ID       [enter to skip]: " REDDIT_CLIENT_ID
  read -rp "  Reddit client secret   [enter to skip]: " REDDIT_CLIENT_SECRET

  JWT_SECRET_KEY=$(openssl rand -hex 32)
  REDIS_PASSWORD=$(openssl rand -hex 16)
  success "Secrets auto-generated ✓"

  cat > "$ENV_FILE" <<EOF
# App
ENVIRONMENT=production
LOG_LEVEL=INFO

# Auth — auto-generated, do not share
JWT_SECRET_KEY=${JWT_SECRET_KEY}

# AI (required)
OPENAI_API_KEY=${OPENAI_API_KEY}
GOOGLE_API_KEY=${GOOGLE_API_KEY}

# Financial data (optional)
FINNHUB_API_KEY=${FINNHUB_API_KEY}

# Reddit (optional)
REDDIT_CLIENT_ID=${REDDIT_CLIENT_ID}
REDDIT_CLIENT_SECRET=${REDDIT_CLIENT_SECRET}
REDDIT_USER_AGENT=WorldState/1.0

# Postgres
POSTGRES_USER=worldstate
POSTGRES_PASSWORD=worldstate_secret
POSTGRES_DB=worldstate
~
# Redis — auto-generated password
REDIS_PASSWORD=${REDIS_PASSWORD}
EOF

  success ".env created ✓"
  echo ""
fi

# ── Validate required keys are present ────────────────────────────────────────
source "$ENV_FILE" 2>/dev/null || true
if [[ -z "${JWT_SECRET_KEY:-}" ]]; then
  warn "JWT_SECRET_KEY missing from .env — generating one now..."
  JWT_SECRET_KEY=$(openssl rand -hex 32)
  echo "JWT_SECRET_KEY=${JWT_SECRET_KEY}" >> "$ENV_FILE"
  success "JWT_SECRET_KEY added to .env ✓"
fi
if [[ -z "${REDIS_PASSWORD:-}" ]]; then
  REDIS_PASSWORD=$(openssl rand -hex 16)
  echo "REDIS_PASSWORD=${REDIS_PASSWORD}" >> "$ENV_FILE"
  success "REDIS_PASSWORD added to .env ✓"
fi
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  err "OPENAI_API_KEY is missing from .env. Add it and re-run."
  exit 1
fi

# ── Handle stop signal cleanly ─────────────────────────────────────────────────
cleanup() {
  echo ""
  info "Shutting down all services..."
  docker compose -f "$ROOT/docker-compose.yml" --env-file "$ENV_FILE" down
  success "All services stopped. Bye!"
}
trap cleanup INT TERM

# ── Launch ─────────────────────────────────────────────────────────────────────
info "Starting all services (Postgres · Redis · API · workers · frontend)..."
info "First run takes ~5 min to build images. Subsequent starts take ~30s.\n"
echo -e "  ${bold}Dashboard:${reset}  http://localhost"
echo -e "  ${bold}API docs:${reset}   http://localhost/docs   (via nginx)"
echo -e "  ${bold}Health:${reset}     http://localhost/health\n"
echo -e "  Press ${bold}Ctrl+C${reset} to stop all services.\n"

docker compose -f "$ROOT/docker-compose.yml" --env-file "$ENV_FILE" up --build "$@"
