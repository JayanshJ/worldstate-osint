#!/usr/bin/env bash
# WorldState Key Rotation Guide
# Run this whenever you suspect a key has been exposed.
set -euo pipefail

echo "=== WorldState Key Rotation ==="
echo ""

echo "1. JWT_SECRET_KEY"
echo "   Generate: openssl rand -hex 32"
echo "   Update .env: JWT_SECRET_KEY=<new>"
echo "   Warning: all active sessions will be immediately invalidated."
echo ""

echo "2. OPENAI_API_KEY"
echo "   Portal: https://platform.openai.com/api-keys"
echo "   Delete the old key, create a new one, update .env."
echo ""

echo "3. GOOGLE_API_KEY"
echo "   Portal: https://console.cloud.google.com/apis/credentials"
echo "   Revoke the old key, create a new one, update .env."
echo ""

echo "4. FINNHUB_API_KEY"
echo "   Portal: https://finnhub.io/dashboard"
echo "   Regenerate from account settings, update .env."
echo ""

echo "5. REDDIT_CLIENT_SECRET"
echo "   Portal: https://www.reddit.com/prefs/apps"
echo "   Regenerate secret for your app, update .env."
echo ""

echo "6. TWITTER_BEARER_TOKEN"
echo "   Portal: https://developer.twitter.com/en/portal/dashboard"
echo "   Regenerate Bearer Token, update .env."
echo ""

echo "7. POSTGRES_PASSWORD"
echo "   Update .env: POSTGRES_PASSWORD=<new>"
echo "   Then run:"
echo "     docker compose exec postgres psql -U worldstate -c \"ALTER USER worldstate WITH PASSWORD '<new>';\""
echo "   Then restart all services."
echo ""

echo "After updating .env:"
echo "  docker compose down && docker compose up -d"
echo ""

NEW_JWT=$(openssl rand -hex 32 2>/dev/null || echo "<run: openssl rand -hex 32>")
echo "Fresh JWT_SECRET_KEY for you: $NEW_JWT"
