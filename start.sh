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

  read -rp "  Google (Gemini) API key [leave blank to skip]: " GOOGLE_API_KEY

  cat > "$ENV_FILE" <<EOF
OPENAI_API_KEY=${OPENAI_API_KEY}
GOOGLE_API_KEY=${GOOGLE_API_KEY}

# Postgres
POSTGRES_USER=worldstate
POSTGRES_PASSWORD=worldstate_secret
POSTGRES_DB=worldstate

# Environment
ENVIRONMENT=development
EOF

  success ".env created at $ENV_FILE"
  echo ""
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
info "Starting all services (Postgres, Redis, API, workers, frontend)..."
info "This may take a minute on first run while images build.\n"

docker compose -f "$ROOT/docker-compose.yml" --env-file "$ENV_FILE" up --build "$@"
