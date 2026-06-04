"""Browser interaction recorder using Playwright codegen.

Custom workspace copy:
- keeps behavior aligned with upstream recorder
- additionally writes raw Playwright code beside Robot output for diagnostics
"""

import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from robotframework_browser_recorder.converter.playwright_to_robot import PlaywrightToRobotConverter


class BrowserRecorder:
    """Record browser interactions and convert to Robot Framework tests."""

    def __init__(
        self,
        browser: str = "chromium",
        output_file: Optional[str] = None,
        test_name: Optional[str] = None,
        url: Optional[str] = None,
    ):
        self.browser = browser
        self.output_file = output_file or "recorded_test.robot"
        self.test_name = test_name or "Recorded Test"
        self.url = url
        self.converter = PlaywrightToRobotConverter()

    def record(self) -> str:
        """Start recording browser interactions and save Robot output."""
        with tempfile.NamedTemporaryFile(mode="w+", suffix=".py", delete=False) as tmp_file:
            tmp_path = tmp_file.name

        output_path = Path(self.output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # HAR is saved alongside the robot output so each session gets its own
        # fresh file. The converter reads it automatically — no manual export needed.
        auto_har_path = output_path.with_suffix(".har")

        try:
            cmd = [
                "playwright",
                "codegen",
                "--target",
                "python",
                "-b",
                self.browser,
                "-o",
                tmp_path,
                "--save-har",
                str(auto_har_path),
            ]

            if self.url:
                # Restrict HAR capture to the target origin to keep the file small
                # and avoid noise from CDN/analytics traffic.
                from urllib.parse import urlparse
                origin = "{uri.scheme}://{uri.netloc}/**".format(uri=urlparse(self.url))
                cmd += ["--save-har-glob", origin]
                cmd.append(self.url)

            print(f"Starting Playwright codegen with command: {' '.join(cmd)}")
            print(f"Recording to temporary file: {tmp_path}")
            print(f"Network traffic will be saved to: {auto_har_path}")
            print("\nPerform your browser interactions in the opened browser window.")
            print("Close the browser window when you're done recording.\n")

            subprocess.run(cmd, check=True)

            with open(tmp_path, "r", encoding="utf-8") as f:
                playwright_code = f.read()

            if not playwright_code.strip():
                raise ValueError("No code was recorded. Please perform some interactions.")

            # Resolve HAR path: explicit env var overrides auto-recorded HAR.
            har_path = self._detect_har_path(output_path)
            if har_path:
                print(f"Using HAR (env override) for fallback conversion hints: {har_path}")
            elif auto_har_path.exists() and auto_har_path.stat().st_size > 0:
                har_path = auto_har_path
                print(f"Using auto-recorded HAR for fallback conversion hints: {har_path}")

            robot_test = self.converter.convert(
                playwright_code=playwright_code,
                test_name=self.test_name,
                har_path=str(har_path) if har_path else None,
            )

            with open(output_path, "w", encoding="utf-8") as f:
                f.write(robot_test)

            raw_path = output_path.with_suffix(".playwright.py")
            with open(raw_path, "w", encoding="utf-8") as f:
                f.write(playwright_code)

            print(f"\nRecording complete! Robot Framework test saved to: {output_path}")
            print(f"Raw Playwright code saved to: {raw_path}")
            if har_path:
                print(f"HAR saved to: {har_path}")
            return str(output_path)

        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    def _detect_har_path(self, output_path: Path) -> Optional[Path]:
        # Only use a HAR when explicitly provided via env var to prevent stale
        # sessions polluting recordings with old form values.
        env_path = os.environ.get("RFBROWSER_RECORD_HAR", "").strip()
        if env_path:
            p = Path(env_path)
            if p.exists():
                return p
        return None
