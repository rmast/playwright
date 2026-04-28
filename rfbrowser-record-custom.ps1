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

# Keep recorder runtimes in sync with local selector-generator build.
$src = Resolve-Path ".\packages\playwright-core\lib\generated\injectedScriptSource.js"
$targets = @(
	".\.venv-recorder\Lib\site-packages\Browser\wrapper\node_modules\playwright-core\lib\generated\injectedScriptSource.js",
	".\.venv-recorder\Lib\site-packages\playwright\driver\package\lib\generated\injectedScriptSource.js"
)
foreach ($target in $targets) {
	if (Test-Path $target) {
		Copy-Item -Path $src -Destination $target -Force
	}
}

# Run rfbrowser-record with custom Playwright
& rfbrowser-record @args

