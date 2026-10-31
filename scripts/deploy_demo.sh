#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# ICP Zero-Knowledge Voting — Automated Public Demo Deployment Script
# Deploys the Rust backend canister to the ICP Playground (20-minute TTL)
# and builds + deploys the React/Vite/WASM frontend to Vercel.
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=== [1/7] Preflight Checks ==="
for tool in dfx node npm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR: Required tool '$tool' is not installed or not in PATH." >&2
    exit 1
  fi
done

echo "  dfx:  $(dfx --version)"
echo "  node: $(node --version)"
echo "  npm:  $(npm --version)"

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "ERROR: VERCEL_TOKEN environment variable is not set." >&2
  echo "       To deploy to Vercel non-interactively, export VERCEL_TOKEN=<your_token> and re-run ./scripts/deploy_demo.sh." >&2
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1 && ! npx --yes vercel --version >/dev/null 2>&1; then
  echo "ERROR: Vercel CLI ('vercel') is not available." >&2
  exit 1
fi

echo "=== [2/7] Deploying Backend Canister to ICP Playground (20-Minute TTL) ==="
DEPLOY_EPOCH="$(date -u +%s)"
DEPLOY_TIME_UTC="$(date -u -d "@${DEPLOY_EPOCH}" "+%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -r "${DEPLOY_EPOCH}" "+%Y-%m-%dT%H:%M:%SZ")"
EXPIRY_EPOCH="$((DEPLOY_EPOCH + 1200))"
EXPIRY_TIME_UTC="$(date -u -d "@${EXPIRY_EPOCH}" "+%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -r "${EXPIRY_EPOCH}" "+%Y-%m-%dT%H:%M:%SZ")"

cargo build --package canister --target wasm32-unknown-unknown --locked --release
dfx deploy canister --playground

# Restore tracked TypeScript declaration wrapper if dfx generate wrote index.js/index.d.ts
rm -f frontend/src/declarations/canister/index.js frontend/src/declarations/canister/index.d.ts
git checkout -- frontend/src/declarations/canister/index.ts 2>/dev/null || true

CANISTER_ID="$(dfx canister --playground id canister | tr -d '[:space:]')"
if [[ ! "$CANISTER_ID" =~ ^[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{3}$ ]]; then
  echo "ERROR: Extracted Canister ID '$CANISTER_ID' is not a valid ICP Principal format." >&2
  exit 1
fi
echo "  Verified Playground Canister ID: ${CANISTER_ID}"

echo "=== [3/7] Smoke-Testing Playground Backend Canister ==="
DETAILS_OUT="$(dfx canister --playground call canister get_election_details)"
echo "$DETAILS_OUT"
if ! echo "$DETAILS_OUT" | grep -q "phase = variant"; then
  echo "ERROR: Playground canister get_election_details query did not return expected ElectionDetails record." >&2
  exit 1
fi

echo "=== [4/7] Building Production Frontend with Build-Time Environment Variables ==="
export VITE_CANISTER_ID="${CANISTER_ID}"
export VITE_CANISTER_ID_CANISTER="${CANISTER_ID}"
export VITE_IC_HOST="https://icp-api.io"

(
  cd "$ROOT_DIR/frontend"
  npm run build
)

echo "=== [5/7] Verifying Zero Test-Bypass Code in Production Bundle (frontend/dist/) ==="
if grep -rnE "test_auth|ENABLE_E2E_TEST_BYPASS|E2E Automated Test Election|22be268019741f2fafe7cb402b489d701026dfa7ce9e585fdfdb4efea1211e40" "$ROOT_DIR/frontend/dist/"; then
  echo "ERROR: Test-bypass markers found in production frontend/dist/!" >&2
  exit 1
fi
echo "  PASS: Zero test-bypass markers in frontend/dist/."

echo "=== [6/7] Deploying Production Frontend to Vercel ==="
VERCEL_OUT="$(
  cd "$ROOT_DIR/frontend"
  npx --yes vercel deploy --prod --yes --token "$VERCEL_TOKEN" \
    --build-env VITE_CANISTER_ID="${CANISTER_ID}" \
    --build-env VITE_CANISTER_ID_CANISTER="${CANISTER_ID}" \
    --build-env VITE_IC_HOST="https://icp-api.io"
)"
PROD_URL="$(echo "$VERCEL_OUT" | grep -Eo 'https://[a-zA-Z0-9._-]+(\.vercel\.app)' | tail -n 1)"

if [[ -z "$PROD_URL" ]]; then
  echo "ERROR: Could not extract Vercel production URL from output." >&2
  exit 1
fi

echo "=== [7/7] Smoke-Testing Vercel Production URL & Headers ==="
HTTP_HEADERS="$(curl -sI "${PROD_URL}")"
echo "$HTTP_HEADERS"
echo "$HTTP_HEADERS" | grep -iq "HTTP/.* 200"
echo "$HTTP_HEADERS" | grep -iq "content-security-policy:.*wasm-unsafe-eval"
echo "$HTTP_HEADERS" | grep -iq "x-content-type-options: nosniff"

echo ""
echo "=============================================================================="
echo "  PUBLIC DEMO DEPLOYMENT COMPLETE"
echo "=============================================================================="
echo "  Playground Canister ID : ${CANISTER_ID}"
echo "  IC Mainnet Gateway Host: https://icp-api.io"
echo "  Production Frontend URL: ${PROD_URL}"
echo "  Deployed At (UTC)      : ${DEPLOY_TIME_UTC}"
echo "  Playground Expiry (UTC): ${EXPIRY_TIME_UTC} (~20 minutes from deploy)"
echo "=============================================================================="
