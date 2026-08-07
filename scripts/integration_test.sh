#!/usr/bin/env bash
set -euo pipefail

echo "=== Starting ICP Canister Live Replica Integration Test Suite ==="

CANISTER_ID=$(dfx canister id canister)
echo "Target Canister Principal ID: ${CANISTER_ID}"

# 1. Generate n-of-m Threshold Keypair (3-of-5)
echo "[1/7] Generating 3-of-5 Threshold Trustee Keys..."
KEYGEN_OUT=$(cargo run -q -p cli -- keygen-threshold --threshold 3 --total-shares 5)
echo "$KEYGEN_OUT"

MASTER_PK=$(echo "$KEYGEN_OUT" | grep "Master Public Key" | awk '{print $4}')
SHARE_1=$(echo "$KEYGEN_OUT" | grep "Trustee Share #1" | awk '{print $4}')
SHARE_3=$(echo "$KEYGEN_OUT" | grep "Trustee Share #3" | awk '{print $4}')
SHARE_5=$(echo "$KEYGEN_OUT" | grep "Trustee Share #5" | awk '{print $4}')

echo "Extracted Master PK: ${MASTER_PK}"
echo "Extracted Trustee Share 1: ${SHARE_1}"
echo "Extracted Trustee Share 3: ${SHARE_3}"
echo "Extracted Trustee Share 5: ${SHARE_5}"

# 2. Create Election
echo "[2/7] Initializing Election on Canister..."
cargo run -q -p cli -- create-election --canister-id "${CANISTER_ID}" --title "Live Replica Integration Test Election" --trustee-pk "${MASTER_PK}"

# 3. Register Voters
echo "[3/7] Registering Eligible Voters..."
cargo run -q -p cli -- register-voters --canister-id "${CANISTER_ID}" --voters "anonymous,2vxsx-fae"

# 4. Open Voting Phase
echo "[4/7] Opening Voting Phase..."
cargo run -q -p cli -- open-voting --canister-id "${CANISTER_ID}"

# 5. Cast Vote & Verify Range Proof + Nullifier Replay Guard
echo "[5/7] Casting Encrypted Ballot with ZK Range Proof..."
cargo run -q -p cli -- cast-vote --canister-id "${CANISTER_ID}" --trustee-pk "${MASTER_PK}" --voter-secret "secret_voter_1" --election-id "int_test_2026" --vote 1

echo "Testing Double-Vote Prevention (Nullifier Replay Rejection)..."
if cargo run -q -p cli -- cast-vote --canister-id "${CANISTER_ID}" --trustee-pk "${MASTER_PK}" --voter-secret "secret_voter_1" --election-id "int_test_2026" --vote 1 2>&1 | grep -q "Double-vote detected"; then
    echo "SUCCESS: Replayed nullifier ballot correctly REJECTED by canister!"
else
    echo "ERROR: Replayed nullifier ballot was NOT rejected!"
    exit 1
fi

# 6. Close Voting & Tally Decryption via 3 Threshold Shares
echo "[6/7] Closing Voting & Submitting Decryption Proof via Threshold Shares..."
cargo run -q -p cli -- close-voting --canister-id "${CANISTER_ID}"
cargo run -q -p cli -- tally-decrypt-threshold-and-prove --canister-id "${CANISTER_ID}" --shares "${SHARE_1},${SHARE_3},${SHARE_5}"

# Check election status pre-upgrade
STATUS_PRE=$(cargo run -q -p cli -- status --canister-id "${CANISTER_ID}")
echo "Pre-Upgrade Canister Status:"
echo "$STATUS_PRE"

# 7. Canister Upgrade & Stable Memory State Survival Test
echo "[7/7] Upgrading Canister Code to Test Stable Memory Hooks..."
dfx canister install canister --mode upgrade

STATUS_POST=$(cargo run -q -p cli -- status --canister-id "${CANISTER_ID}")
echo "Post-Upgrade Canister Status:"
echo "$STATUS_POST"

if echo "$STATUS_POST" | grep -q "Complete" && echo "$STATUS_POST" | grep -q "true"; then
    echo "=========================================================================="
    echo "LIVE REPLICA INTEGRATION TEST SUITE PASSED 100% (STATE SURVIVED UPGRADE)"
    echo "=========================================================================="
else
    echo "ERROR: Election state corrupted or lost during canister upgrade!"
    exit 1
fi
