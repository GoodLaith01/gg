#!/bin/bash
# Installs OmniRoute v3.8.51 and starts it, so image requests can go to Gemini.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

OMNIROUTE_VERSION="3.8.51"

# OmniRoute 3.8.51 refuses to start on Node older than 22.22.2, so run it on Node 24.
export NVM_DIR="${NVM_DIR:-/opt/nvm}"
set +u
. "$NVM_DIR/nvm.sh"
nvm install 24 >/dev/null 2>&1
nvm use 24 >/dev/null
set -u

if [ "$(omniroute --version 2>/dev/null | tail -1)" != "$OMNIROUTE_VERSION" ]; then
  npm install -g "omniroute@${OMNIROUTE_VERSION}" >/dev/null 2>&1
fi

# Node's fetch ignores HTTPS_PROXY unless told to, and outbound traffic must go through it.
NODE_USE_ENV_PROXY=1 omniroute serve --no-open --daemon --no-tray >/dev/null 2>&1 || true

# Connect Gemini once a key is stored as the GEMINI_API_KEY environment secret.
if [ -n "${GEMINI_API_KEY:-}" ]; then
  omniroute setup --non-interactive \
    --password "${OMNIROUTE_SETUP_PASSWORD:-gg-omniroute-local}" \
    --add-provider --provider gemini --api-key "$GEMINI_API_KEY" \
    >/dev/null 2>&1 || true
fi

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export OMNIROUTE_BASE_URL="http://localhost:20128"' >> "$CLAUDE_ENV_FILE"
  echo "export PATH=\"$(dirname "$(command -v node)"):\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi
