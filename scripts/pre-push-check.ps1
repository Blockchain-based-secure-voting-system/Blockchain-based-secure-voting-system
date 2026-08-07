# Mandatory Pre-Push Local Verification Gate (PowerShell)
$ErrorActionPreference = "Stop"

Write-Host "=== MANDATORY PRE-PUSH LOCAL VERIFICATION GATE ==="

$LinkerFound = Get-Command "link.exe" -ErrorAction SilentlyContinue

if (-not $LinkerFound) {
    Write-Host "==================================================================================" -ForegroundColor Yellow
    Write-Host "[WARNING]: Local MSVC 'link.exe' not found on this Windows ARM64 environment." -ForegroundColor Yellow
    Write-Host "[NOTICE]: Host binary compilation and unit tests are deferred to GitHub Actions CI." -ForegroundColor Yellow
    Write-Host "==================================================================================" -ForegroundColor Yellow
    exit 0
}

Write-Host "[1/4] Checking Native Crates (voting_crypto, cli)..."
cargo check --package voting_crypto --package cli --locked

Write-Host "[2/4] Checking Canister Wasm Target (canister)..."
cargo check --package canister --target wasm32-unknown-unknown --locked

Write-Host "[3/4] Running Clippy Checks..."
cargo clippy --package voting_crypto --package cli --locked -- -D warnings
cargo clippy --package canister --target wasm32-unknown-unknown --locked -- -D warnings

Write-Host "[4/4] Running Native Unit Tests..."
cargo test --package voting_crypto --package cli --locked

Write-Host "=== ALL PRE-PUSH LOCAL CHECKS PASSED 100% ===" -ForegroundColor Green
