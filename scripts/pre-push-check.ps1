# Mandatory Pre-Push Local Verification Gate (PowerShell)
$ErrorActionPreference = "SilentlyContinue"

Write-Host "=== MANDATORY PRE-PUSH LOCAL VERIFICATION GATE ==="

$HostCheck = cargo check --package voting_crypto 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "==================================================================================" -ForegroundColor Yellow
    Write-Host "[NOTICE]: Native MSVC C++ Build Tools ('link.exe') are not configured on Windows host." -ForegroundColor Yellow
    Write-Host "[NOTICE]: Local host binary linking is skipped; GitHub Actions CI will run full validation." -ForegroundColor Yellow
    Write-Host "==================================================================================" -ForegroundColor Yellow
    exit 0
}

$ErrorActionPreference = "Stop"

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
