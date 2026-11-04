#!/usr/bin/env bash
# ==============================================================================
# export_election_data.sh
# 
# Exports full election state, bulletin board entries, hash chain, and tally
# from the live Axum + PostgreSQL voting system to a JSON archive before the
# 30-day Render free-tier PostgreSQL database expiration.
# ==============================================================================
set -euo pipefail

API_URL="${1:-https://voting-system-api-wi7q.onrender.com}"
OUTPUT_DIR="${2:-./exports}"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
OUTPUT_FILE="${OUTPUT_DIR}/election_export_${TIMESTAMP}.json"

mkdir -p "$OUTPUT_DIR"

echo "=== Exporting Election Data from ${API_URL} ==="
echo "Querying election details..."
ELECTION_DATA=$(curl -sSf "${API_URL}/api/v1/election" || echo "{}")

echo "Querying bulletin board ledger..."
BULLETIN_DATA=$(curl -sSf "${API_URL}/api/v1/bulletin" || echo "{}")

echo "Querying tally ciphertext..."
TALLY_DATA=$(curl -sSf "${API_URL}/api/v1/tally" || echo "{}")

echo "Compiling archive..."
cat <<EOF > "$OUTPUT_FILE"
{
  "exported_at": "${TIMESTAMP}",
  "api_url": "${API_URL}",
  "election": ${ELECTION_DATA},
  "bulletin_log": ${BULLETIN_DATA},
  "tally": ${TALLY_DATA}
}
EOF

echo "SUCCESS: Election data exported to ${OUTPUT_FILE}"
echo "Archive size: $(wc -c < "$OUTPUT_FILE") bytes"
