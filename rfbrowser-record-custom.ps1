# Custom rfbrowser-record wrapper using Playwright with Vaadin enhancements
# Usage: .\rfbrowser-record-custom.ps1 [arguments...]

# Activate the recorder venv
& ".\.venv-recorder\Scripts\Activate.ps1"

# Keep tracked converter source in sync with the installed recorder package.
$converterSrc = Resolve-Path ".\playwright_to_robot.py"
$converterTargets = @(
	".\.venv-recorder\Lib\site-packages\robotframework_browser_recorder\converter\playwright_to_robot.py"
)
foreach ($target in $converterTargets) {
	if (Test-Path $target) {
		Copy-Item -Path $converterSrc -Destination $target -Force
	}
}

# Keep tracked recorder source in sync (adds raw Playwright output artifact for diagnostics).
$recorderSrc = Resolve-Path ".\robotframework_browser_recorder_recorder.py"
$recorderTargets = @(
	".\.venv-recorder\Lib\site-packages\robotframework_browser_recorder\recorder.py"
)
foreach ($target in $recorderTargets) {
	if (Test-Path $target) {
		Copy-Item -Path $recorderSrc -Destination $target -Force
	}
}

# Keep recorder runtimes in sync with local generated Playwright sources.
# If recorder.ts was modified more recently than the compiled output, rebuild first.
$recorderTs = Resolve-Path ".\packages\injected\src\recorder\recorder.ts"
$compiledJs  = ".\packages\playwright-core\lib\generated\pollingRecorderSource.js"
if ((Test-Path $compiledJs) -and ((Get-Item $recorderTs).LastWriteTime -gt (Get-Item $compiledJs).LastWriteTime)) {
	Write-Host "recorder.ts is newer than compiled output — rebuilding..."
	node utils/build/build.js
}

$generatedFiles = @(
	"injectedScriptSource.js",
	"pollingRecorderSource.js"
)

foreach ($fileName in $generatedFiles) {
	$src = Resolve-Path ".\packages\playwright-core\lib\generated\$fileName"
	$targets = @(
		".\.venv-recorder\Lib\site-packages\Browser\wrapper\node_modules\playwright-core\lib\generated\$fileName",
		".\.venv-recorder\Lib\site-packages\playwright\driver\package\lib\generated\$fileName"
	)
	foreach ($target in $targets) {
		if (Test-Path $target) {
			Copy-Item -Path $src -Destination $target -Force
		}
	}
}

# Run rfbrowser-record with custom Playwright
& rfbrowser-record @args

