#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Setup custom robotframework-browser-recorder with Vaadin selector enhancements

.DESCRIPTION
    Creates a Python venv, installs robotframework-browser-recorder, 
    and patches it with custom Playwright injected scripts that have 
    improved selector generation for Vaadin tree tables.

.PARAMETER VenvName
    Name of the venv directory (default: .venv-recorder)

.PARAMETER SkipBuild
    Skip npm run build (useful if you've already built recently)

.EXAMPLE
    .\setup-recorder.ps1
    # Creates .venv-recorder with full setup

.EXAMPLE
    .\setup-recorder.ps1 -VenvName .venv-custom
    # Creates .venv-custom instead

.EXAMPLE
    .\setup-recorder.ps1 -SkipBuild
    # Assumes you already ran npm run build, just setup venv
#>

param(
    [string]$VenvName = ".venv-recorder",
    [switch]$SkipBuild = $false
)

$ErrorActionPreference = "Stop"

function Write-Success { Write-Host "✓ $args" -ForegroundColor Green }
function Write-Task { Write-Host "`n→ $args" -ForegroundColor Cyan }
function Write-Error-Custom { Write-Host "✗ $args" -ForegroundColor Red }

try {
    Write-Task "Custom recorder setup with Vaadin selector support"
    Write-Host "VenvName: $VenvName"
    
    # Check we're in playwright repo
    if (-not (Test-Path "packages\playwright-core\lib\generated\injectedScriptSource.js")) {
        throw "Not in Playwright monorepo root (packages\playwright-core\lib\generated\injectedScriptSource.js not found)"
    }
    
    # Step 1: Build (unless skipped)
    if (-not $SkipBuild) {
        Write-Task "Building Playwright monorepo..."
        npm run build 2>&1 | Select-Object -Last 20
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
        Write-Success "Build complete"
    } else {
        Write-Host "(Build skipped)"
    }
    
    # Step 2: Create venv
    Write-Task "Creating Python venv: $VenvName"
    if (Test-Path $VenvName) {
        Write-Host "(already exists, skipping venv creation)"
    } else {
        python -m venv $VenvName
        if ($LASTEXITCODE -ne 0) { throw "python -m venv failed" }
        Write-Success "venv created"
    }
    
    # Step 3: Upgrade pip
    Write-Task "Upgrading pip, setuptools, wheel..."
    & "$VenvName\Scripts\python.exe" -m pip install --upgrade pip setuptools wheel 2>&1 | Select-Object -Last 5
    if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed" }
    Write-Success "pip upgraded"
    
    # Step 4: Install robotframework-browser-recorder
    Write-Task "Installing robotframework-browser-recorder..."
    & "$VenvName\Scripts\pip.exe" install robotframework-browser-recorder 2>&1 | Select-Object -Last 10
    if ($LASTEXITCODE -ne 0) { throw "pip install robotframework-browser-recorder failed" }
    Write-Success "robotframework-browser-recorder installed"
    
    # Step 5: Patch injected scripts
    Write-Task "Patching injected scripts with Vaadin selector enhancements..."
    $srcFile = "packages\playwright-core\lib\generated\injectedScriptSource.js"
    $destFile = "$VenvName\Lib\site-packages\playwright\driver\package\lib\generated\injectedScriptSource.js"
    
    if (-not (Test-Path $srcFile)) {
        throw "Source injected script not found: $srcFile (did npm run build succeed?)"
    }
    
    Copy-Item -Path $srcFile -Destination $destFile -Force
    
    # Verify sizes match
    $srcSize = (Get-Item $srcFile).Length
    $destSize = (Get-Item $destFile).Length
    
    if ($srcSize -eq $destSize) {
        Write-Success "Patch successful! Files match ($srcSize bytes)"
    } else {
        throw "Patch size mismatch! Source: $srcSize, Dest: $destSize"
    }
    
    # Step 6: Verify installation
    Write-Task "Verifying Playwright installation..."
    & "$VenvName\Scripts\python.exe" -c "import playwright; print('Playwright version: ' + playwright.__version__)"
    if ($LASTEXITCODE -ne 0) { throw "Playwright verification failed" }
    
    & "$VenvName\Scripts\python.exe" -c "import robotframework_browser_recorder; print('Recorder installed: OK')"
    if ($LASTEXITCODE -ne 0) { throw "Recorder verification failed" }
    
    Write-Success "Verification complete"
    
    # Summary
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host "Setup complete! Ready to record with Vaadin selector support." -ForegroundColor Green
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host "  .\$VenvName\Scripts\Activate.ps1"
    Write-Host "  rfbrowser-record --url <your-vaadin-app-url>"
    Write-Host ""
    Write-Host "Or use the wrapper script:"
    Write-Host "  .\rfbrowser-record-custom.ps1 --url <your-vaadin-app-url>"
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  rfbrowser-record --url http://localhost:8080"
    Write-Host "  rfbrowser-record --url https://app.example.com --output my_test.robot"
    Write-Host "  rfbrowser-record --browser firefox --url http://localhost:8080"
    Write-Host ""
    
} catch {
    Write-Error-Custom $_
    exit 1
}
