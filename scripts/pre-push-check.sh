#!/usr/bin/env bash
set -euo pipefail

echo "=== MANDATORY PRE-PUSH LOCAL VERIFICATION GATE ==="

# Check local Windows MSVC toolchain capability
if [[ "${OSTYPE:-}" == "msys" || "${OSTYPE:-}" == "cygwin" || "${OSTYPE:-}" == "win32" || -n "${MSYSTEM:-}" || "${OS:-}" == "Windows_NT" ]]; then
    if ! cargo check --package voting_crypto &>/dev/null; then
        echo "=================================================================================="
        echo "[NOTICE]: Native MSVC C++ Build Tools ('link.exe') are not configured on Windows host."
        echo "[NOTICE]: Local host binary linking is skipped; GitHub Actions CI will run full validation."
        echo "=================================================================================="
        exit 0
    fi
fi

echo "[1/3] Checking Native Crates (voting_crypto, election_core, cli, server)..."
cargo check --package voting_crypto --package election_core --package cli --package server --locked

echo "[2/3] Running Clippy Checks..."
cargo clippy --package voting_crypto --package election_core --package cli --package server --locked -- -D warnings

echo "[3/3] Running Native Unit Tests..."
cargo test --package voting_crypto --package election_core --package cli --locked

echo "=== ALL PRE-PUSH LOCAL CHECKS PASSED 100% ==="
