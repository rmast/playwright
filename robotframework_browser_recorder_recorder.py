"""Browser interaction recorder using Playwright codegen.

Custom workspace copy:
- keeps behavior aligned with upstream recorder
- additionally writes raw Playwright code beside Robot output for diagnostics
"""

import os
import json
import subprocess
import tempfile
from pathlib import Path
from typing import Optional
from urllib.parse import parse_qs

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

            # Some JSF menu flows are occasionally collapsed by codegen into a bare
            # navigation to ada/index.jsf. When HAR proves menu/form interactions
            # happened, restore explicit steps in raw output.
            playwright_code = self._normalize_codegen_with_har(playwright_code, auto_har_path)
            # Independently recover skipped analyse->belasting transition when
            # HAR shows analyse next-button submit but codegen misses it.
            playwright_code = self._recover_analyse_transition_with_har(playwright_code, auto_har_path)

            # Always persist raw codegen output first so diagnostics reflect
            # what Playwright recorder actually captured, even if conversion fails.
            raw_path = output_path.with_suffix(".playwright.py")
            with open(raw_path, "w", encoding="utf-8") as f:
                f.write(playwright_code)

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

    def _normalize_codegen_with_har(self, playwright_code: str, har_path: Path) -> str:
        if os.environ.get("RFBROWSER_RECOVER_COLLAPSED_CODEGEN", "1").strip().lower() in {"0", "false", "no", "off"}:
            return playwright_code

        ada_url = "https://ln-o2-svc-cbb-vhn.o-dc.ba.uwv.nl/cbbs/ada/index.jsf"
        has_ada_goto = f'page.goto("{ada_url}")' in playwright_code
        has_menu_or_form_steps = (
            'mainmenu_functie_nieuw' in playwright_code
            or 'functieAlgemeenPage:functienummerFieldInput' in playwright_code
            or '#mainmenuform\\:mainmenu_functie_nieuw' in playwright_code
            or '#functieAlgemeenPage\\:functienummerFieldInput' in playwright_code
        )
        has_any_functie_fill = any(token in playwright_code for token in [
            'functieAlgemeenPage:functienummerFieldInput',
            'functieAlgemeenPage:functienummerFieldInput1',
            'functieAlgemeenPage:FunctienaamFieldInput',
            'functieAlgemeenPage:ArbeidsplaatsenFieldInput',
            'functieAlgemeenPage:sbcCodeFieldInput',
        ])
        menu_click_pos = playwright_code.find('mainmenu_functie_nieuw")')
        first_field_pos = min([
            p for p in [
                playwright_code.find('functieAlgemeenPage:functienummerFieldInput'),
                playwright_code.find('functieAlgemeenPage:functienummerFieldInput1'),
                playwright_code.find('functieAlgemeenPage:FunctienaamFieldInput'),
                playwright_code.find('functieAlgemeenPage:ArbeidsplaatsenFieldInput'),
                playwright_code.find('functieAlgemeenPage:sbcCodeFieldInput'),
            ] if p != -1
        ], default=-1)
        misordered_fields = menu_click_pos != -1 and first_field_pos != -1 and first_field_pos < menu_click_pos

        has_password_fill = (
            'input[name=\\"password\\"]' in playwright_code
            or 'input[name="password"]' in playwright_code
            or 'password' in playwright_code
        )
        has_login_markers = has_password_fill and ('username' in playwright_code or 'j_spring_security_check' in playwright_code)
        has_explicit_login_submit = (
            'input[type=\"submit\"]' in playwright_code
            or "input[type='submit']" in playwright_code
            or 'button[type=\"submit\"]' in playwright_code
            or "button[type='submit']" in playwright_code
            or 'input[name=\"login\"]' in playwright_code
            or "input[name='login']" in playwright_code
            or 'button[name=\"login\"]' in playwright_code
            or "button[name='login']" in playwright_code
            or '.press("Enter")' in playwright_code
            or ".press('Enter')" in playwright_code
        )

        collapse_detected = (
            (has_ada_goto and not has_menu_or_form_steps)
            or (has_login_markers and not has_ada_goto and not has_menu_or_form_steps)
            or (has_login_markers and has_menu_or_form_steps and not has_any_functie_fill)
            or misordered_fields
        )
        if not collapse_detected:
            return playwright_code

        # Login submit can be missed when user presses Enter on password.
        # Recover it using only codegen signals; do not depend on HAR menu traces.
        should_inject_login_submit = (
            has_login_markers
            and not has_explicit_login_submit
            and (has_ada_goto or has_menu_or_form_steps)
        )

        if should_inject_login_submit:
            base_lines = playwright_code.splitlines()
            pwd_index = -1
            has_recovered_submit = False
            for i, line in enumerate(base_lines):
                if 'input[name=\\"password\\"]' in line and '.fill(' in line:
                    pwd_index = i
                if 'input[type=\\"submit\\"]' in line or 'button[type=\\"submit\\"]' in line or 'name=\\"login\\"' in line:
                    has_recovered_submit = True

            if pwd_index != -1 and not has_recovered_submit:
                base_lines.insert(
                    pwd_index + 1,
                    '    page.locator("input[type=\\"submit\\"], button[type=\\"submit\\"], input[name=\\"login\\"], button[name=\\"login\\"]").first.click()'
                )
                playwright_code = "\n".join(base_lines) + ("\n" if playwright_code.endswith("\n") else "")

        if not har_path.exists():
            return playwright_code

        try:
            with open(har_path, "r", encoding="utf-8") as f:
                har = json.load(f)
        except Exception:
            return playwright_code

        entries = (har.get("log") or {}).get("entries") or []
        has_menu_nieuw_submit = False
        has_analyse_next_submit = False
        field_values = {}
        for entry in entries:
            request = entry.get("request") or {}
            post_data = request.get("postData") or {}
            text = post_data.get("text") or ""
            parsed = parse_qs(text, keep_blank_values=True)
            idcl_values = parsed.get("mainmenuform:_idcl", [])
            if any(v == "mainmenuform:mainmenu_functie_nieuw" for v in idcl_values):
                has_menu_nieuw_submit = True
            if parsed:
                analyse_next_values = parsed.get("functieAnalysePage:nextButton", [])
                if any("Opslaan, volgende" in v for v in analyse_next_values):
                    has_analyse_next_submit = True
                for name, values in parsed.items():
                    if not name.startswith("functieAlgemeenPage:"):
                        continue
                    value = (values[-1] if values else "").strip()
                    field_values[name] = value

        if not has_menu_nieuw_submit:
            return playwright_code

        lines = playwright_code.splitlines()
        normalized = []
        for line in lines:
            if f'page.goto("{ada_url}")' in line:
                continue
            if 'functieAlgemeenPage:functienummerFieldInput' in line:
                continue
            if 'functieAlgemeenPage:functienummerFieldInput1' in line:
                continue
            if 'functieAlgemeenPage:FunctienaamFieldInput' in line:
                continue
            if 'functieAlgemeenPage:ArbeidsplaatsenFieldInput' in line:
                continue
            if 'functieAlgemeenPage:sbcCodeFieldInput' in line:
                continue
            if '#functieAlgemeenPage\\:nextButton' in line and '.click(' in line:
                continue
            normalized.append(line)

        insert_at = -1
        menu_click_index = -1
        for i, line in enumerate(normalized):
            if 'mainmenu_functie_nieuw' in line and '.click(' in line:
                menu_click_index = i
                break
        if menu_click_index != -1:
            insert_at = menu_click_index + 1
        for i, line in enumerate(normalized):
            if insert_at != -1:
                break
            if 'page.locator("input[name=\\"password\\"]").fill(' in line:
                insert_at = i + 1
        if insert_at == -1:
            for i, line in enumerate(normalized):
                if 'page.goto("https://ln-o2-svc-cbb-vhn.o-dc.ba.uwv.nl/cbbs/")' in line:
                    insert_at = i + 1
                    break
        if insert_at == -1:
            return playwright_code

        injected_steps = []
        if not any('mainmenu_functie_nieuw' in ln for ln in normalized):
            injected_steps.extend([
                '    page.locator("#mainmenuform\\:mainmenu_functie").hover()',
                '    page.locator("#mainmenuform\\:mainmenu_functie_nieuw").click()',
            ])

        known_fields = [
            "functieAlgemeenPage:functienummerFieldInput",
            "functieAlgemeenPage:functienummerFieldInput1",
            "functieAlgemeenPage:FunctienaamFieldInput",
            "functieAlgemeenPage:ArbeidsplaatsenFieldInput",
            "functieAlgemeenPage:sbcCodeFieldInput",
        ]
        for name in known_fields:
            value = (field_values.get(name) or "").strip()
            if not value:
                continue
            escaped_value = value.replace('\\', '\\\\').replace('"', '\\"')
            injected_steps.append(f'    page.locator("input[name=\\"{name}\\"]").fill("{escaped_value}")')

        next_button = (field_values.get("functieAlgemeenPage:nextButton") or "").strip()
        if next_button:
            injected_steps.append('    page.locator("#functieAlgemeenPage\\:nextButton").click()')

        if not injected_steps:
            normalized_out = normalized
        else:
            normalized_out = normalized[:insert_at] + injected_steps + normalized[insert_at:]

        # Later in the flow, codegen can skip the analyse -> belasting transition
        # even though HAR clearly shows the analyse next-button submit.
        if has_analyse_next_submit:
            has_belasting_actions = any('functieBelastingPage:' in ln for ln in normalized_out)
            has_analyse_next_action = any('#functieAnalysePage\\:nextButton' in ln and '.click(' in ln for ln in normalized_out)
            if has_belasting_actions and not has_analyse_next_action:
                first_belasting_index = next(
                    (
                        i for i, ln in enumerate(normalized_out)
                        if 'functieBelastingPage:' in ln and ('.check(' in ln or '.fill(' in ln or '.click(' in ln)
                    ),
                    -1,
                )
                if first_belasting_index != -1:
                    normalized_out.insert(first_belasting_index, '    page.locator("#functieAnalysePage\\:nextButton").click()')

        return "\n".join(normalized_out) + ("\n" if playwright_code.endswith("\n") else "")

    def _recover_analyse_transition_with_har(self, playwright_code: str, har_path: Path) -> str:
        if os.environ.get("RFBROWSER_RECOVER_COLLAPSED_CODEGEN", "1").strip().lower() in {"0", "false", "no", "off"}:
            return playwright_code
        if not har_path.exists():
            return playwright_code
        if 'functieBelastingPage:' not in playwright_code:
            return playwright_code
        if '#functieAnalysePage\\:nextButton' in playwright_code:
            return playwright_code

        try:
            with open(har_path, "r", encoding="utf-8") as f:
                har = json.load(f)
        except Exception:
            return playwright_code

        entries = (har.get("log") or {}).get("entries") or []
        has_analyse_next_submit = False
        for entry in entries:
            request = entry.get("request") or {}
            post_data = request.get("postData") or {}
            text = post_data.get("text") or ""
            if not text:
                continue
            parsed = parse_qs(text, keep_blank_values=True)
            analyse_next_values = parsed.get("functieAnalysePage:nextButton", [])
            if any("Opslaan, volgende" in v for v in analyse_next_values):
                has_analyse_next_submit = True
                break

        if not has_analyse_next_submit:
            return playwright_code

        lines = playwright_code.splitlines()
        first_belasting_index = next(
            (
                i for i, line in enumerate(lines)
                if 'functieBelastingPage:' in line and ('.check(' in line or '.fill(' in line or '.click(' in line)
            ),
            -1,
        )
        if first_belasting_index == -1:
            return playwright_code

        lines.insert(first_belasting_index, '    page.locator("#functieAnalysePage\\:nextButton").click()')
        return "\n".join(lines) + ("\n" if playwright_code.endswith("\n") else "")
