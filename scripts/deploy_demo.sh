#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Zero-Knowledge Voting — Automated Deployment Script (Render + Vercel)
# Deploys the Rust Axum + PostgreSQL backend to Render (via Blueprint or Docker)
# and builds + deploys the React/Vite/WASM frontend to Vercel.
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=== [1/6] Preflight Tooling Checks ==="
for tool in node npm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR: Required tool '$tool' is not installed or not in PATH." >&2
    exit 1
  fi
done

echo "  node: $(node --version)"
echo "  npm:  $(npm --version)"

API_URL="${VITE_API_URL:-}"
if [[ -z "$API_URL" ]]; then
  echo "INFO: VITE_API_URL is not set. Defaulting to Render service URL pattern or local backend."
  echo "      Example: export VITE_API_URL=\"https://voting-system-api.onrender.com\""
  API_URL="https://voting-system-api.onrender.com"
fi
echo "  Target API URL: ${API_URL}"

echo "=== [2/6] Building Production Frontend with WASM Crypto ==="
(
  cd "$ROOT_DIR/frontend"
  npm ci
  VITE_API_URL="${API_URL}" npm run build
)

echo "=== [3/6] Verifying Zero Test-Bypass Code in Production Bundle (frontend/dist/) ==="
if grep -rnE "test_auth|ENABLE_E2E_TEST_BYPASS|E2E Automated Test Election|22be268019741f2fafe7cb402b489d701026dfa7ce9e585fdfdb4efea1211e40" "$ROOT_DIR/frontend/dist/"; then
  echo "ERROR: Test-bypass markers found in production frontend/dist/!" >&2
  exit 1
fi
echo "  PASS: Zero test-bypass markers in frontend/dist/."

echo "=== [4/6] Verifying WASM Integrity ==="
sha256sum "$ROOT_DIR/frontend/dist/assets/"*.wasm "$ROOT_DIR/frontend/src/crypto/pkg/voting_crypto_wasm_bg.wasm"

echo "=== [5/6] Deploying Frontend to Vercel ==="
if [[ -n "${VERCEL_TOKEN:-}" ]]; then
  echo "Deploying via Vercel CLI with VERCEL_TOKEN..."
  VERCEL_OUT="$(
    cd "$ROOT_DIR/frontend"
    npx --yes vercel deploy --prod --yes --token "$VERCEL_TOKEN" \
      --build-env VITE_API_URL="${API_URL}"
  )"
  PROD_URL="$(echo "$VERCEL_OUT" | grep -Eo 'https://[a-zA-Z0-9._-]+(\.vercel\.app)' | tail -n 1)"
  echo "  Production URL: ${PROD_URL}"
else
  echo "NOTE: VERCEL_TOKEN is not set. You can deploy interactively by running:"
  echo "      cd frontend && vercel --prod"
  echo "      or connect your GitHub repository directly to Vercel (Root Directory: frontend)."
fi

echo "=== [6/6] Render Backend Deployment Instructions ==="
echo "The backend is defined via render.yaml Blueprint at the repository root."
echo "To deploy or update Render:"
echo "  1. Go to https://dashboard.render.com/blueprints"
echo "  2. Connect repository 'Blockchain-based-secure-voting-system'"
echo "  3. Render will provision:"
echo "     - Web Service: voting-system-api (Docker build of ./Dockerfile)"
echo "     - Managed PostgreSQL: voting-system-db (PostgreSQL 16)"
echo ""
echo "=============================================================================="
echo "  DEPLOYMENT PREPARATION COMPLETE"
echo "=============================================================================="
