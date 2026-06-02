#!/usr/bin/env bash
#
# harden-firewall.sh — host firewall for the Hetzner production box.
#
# Closes everything except SSH + HTTP(S). Defense-in-depth against a stray
# `ports:` entry in docker-compose.yml re-exposing an internal service
# (e.g. Postgres on 5432) to the public internet.
#
# IMPORTANT — Docker + ufw caveat:
#   Docker writes its own iptables rules and normally BYPASSES ufw for
#   published ports. Binding a service to 127.0.0.1 in compose (as we do for
#   postgres/frontend) is therefore the primary control; this firewall is the
#   second layer. We still deny 5432/6379 explicitly so a future 0.0.0.0
#   publish is caught at the host level too. For full Docker/ufw integration
#   consider https://github.com/chaifeng/ufw-docker — out of scope here.
#
# Run as root on the server:  sudo bash infra/harden-firewall.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Must run as root (try: sudo bash $0)" >&2
  exit 1
fi

if ! command -v ufw &>/dev/null; then
  echo "Installing ufw..."
  apt-get update -qq && apt-get install -y -qq ufw
fi

# Default-deny inbound, allow all outbound.
ufw default deny incoming
ufw default allow outgoing

# Allow management + public web traffic only.
ufw allow 22/tcp    comment 'SSH'
ufw allow 80/tcp    comment 'HTTP'
ufw allow 443/tcp   comment 'HTTPS'

# Belt-and-suspenders: explicitly deny internal datastores from the public side.
# These should never be published; binding to 127.0.0.1 in compose is the real fix.
ufw deny 5432/tcp   comment 'Postgres — internal only'
ufw deny 6379/tcp   comment 'Redis — internal only'

ufw --force enable
ufw status verbose
