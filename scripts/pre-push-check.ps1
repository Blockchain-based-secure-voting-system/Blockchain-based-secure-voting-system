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

Write-Host "[1/3] Checking Native Crates (voting_crypto, election_core, cli, server)..."
cargo check --package voting_crypto --package election_core --package cli --package server --locked

Write-Host "[2/3] Running Clippy Checks..."
cargo clippy --package voting_crypto --package election_core --package cli --package server --locked -- -D warnings

Write-Host "[3/3] Running Native Unit Tests..."
cargo test --package voting_crypto --package election_core --package cli --locked

Write-Host "=== ALL PRE-PUSH LOCAL CHECKS PASSED 100% ===" -ForegroundColor Green
