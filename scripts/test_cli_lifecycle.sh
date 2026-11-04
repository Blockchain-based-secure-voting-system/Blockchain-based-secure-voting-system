#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

echo "=== 1. Starting Real Axum Server + PostgreSQL ==="
PGPASSWORD=postgres psql -U postgres -h localhost -d voting_test -c "TRUNCATE TABLE bulletin_log, voter_sessions, voter_credentials, auth_rate_limits, elections CASCADE;" >/dev/null 2>&1 || true

DATABASE_URL="postgres://postgres:postgres@localhost:5432/voting_test" ADMIN_TOKEN="admin_token" PORT=8080 ./target/debug/server > /tmp/server_cli.log 2>&1 &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true" EXIT

for i in $(seq 1 20); do
  if curl -s http://127.0.0.1:8080/healthz | grep -q "200"; then
    echo "Server ready on http://127.0.0.1:8080"
    break
  fi
  sleep 1
done

CLI="./target/debug/cli"

echo -e "\n=== 2. Admin Auth Tests (Requirement 4) ==="
# Missing token -> 401
curl -s -i -X POST http://127.0.0.1:8080/api/v1/admin/election \
  -H "Content-Type: application/json" \
  -d '{"title":"T","trustee_pk_hex":"04","start_time":null,"end_time":null}' | head -n 1

# Wrong token -> 401
curl -s -i -X POST http://127.0.0.1:8080/api/v1/admin/election \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer wrong_admin_token" \
  -d '{"title":"T","trustee_pk_hex":"04","start_time":null,"end_time":null}' | head -n 1

echo -e "\n=== 3. Keygen (3-of-5 Shamir Threshold Ceremony) ==="
KEYGEN_OUT=$($CLI keygen-threshold --threshold 3 --total-shares 5)
echo "$KEYGEN_OUT"

MASTER_PK=$(echo "$KEYGEN_OUT" | grep "Master Public Key:" | awk '{print $4}')
SHARE1=$(echo "$KEYGEN_OUT" | grep "^Share 1:" | sed 's/Share 1: //')
SHARE2=$(echo "$KEYGEN_OUT" | grep "^Share 2:" | sed 's/Share 2: //')
SHARE3=$(echo "$KEYGEN_OUT" | grep "^Share 3:" | sed 's/Share 3: //')

echo -e "\n=== 4. Admin Initializes Election in Setup Phase ==="
$CLI create-election --admin-token admin_token --title "2026 Municipal ZK Referendum" --trustee-pk "$MASTER_PK"

echo -e "\n=== 5. Admin Issues Credentials for Voters ==="
CREDS_OUT=$($CLI issue-credentials --admin-token admin_token --count 3)
echo "$CREDS_OUT"

CRED1=$(echo "$CREDS_OUT" | grep "\[1\]" | awk '{print $2}')
CRED2=$(echo "$CREDS_OUT" | grep "\[2\]" | awk '{print $2}')
CRED3=$(echo "$CREDS_OUT" | grep "\[3\]" | awk '{print $2}')

echo -e "\n=== 6. Admin Transitions to Voting Phase ==="
$CLI open-voting --admin-token admin_token

echo -e "\n=== 7. Voters Cast Encrypted Ballots ==="
echo "Voter 1 casting YES (1)..."
$CLI cast-vote --credential-code "$CRED1" --vote 1
echo "Voter 2 casting NO (0)..."
$CLI cast-vote --credential-code "$CRED2" --vote 0
echo "Voter 3 casting YES (1)..."
$CLI cast-vote --credential-code "$CRED3" --vote 1

echo -e "\n=== 8. Admin Closes Voting Phase ==="
$CLI close-voting --admin-token admin_token

echo -e "\n=== 9. Trustees Decrypt Tally with 3-of-5 Shares and Finalize Chaum-Pedersen Proof ==="
$CLI tally-decrypt-threshold-and-prove --admin-token admin_token --shares "$SHARE1" --shares "$SHARE2" --shares "$SHARE3"

echo -e "\n=== 10. Query Final Status ==="
$CLI status

echo -e "\n=== 11. Run Full Public Bulletin Board Audit & Verification Tool ==="
$CLI verify
