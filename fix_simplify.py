"""One-time script to fix the duplicated _simplify_selector body."""
import re

with open("playwright_to_robot.py", "r", encoding="utf-8") as f:
    src = f.read()

# Replace the entire _simplify_selector method body with the correct single version.
# We locate the method by its def line and replace everything up to the next method.
pattern = re.compile(
    r'(    def _simplify_selector\(self, selector: str\) -> str:.*?""".*?""")(.*?)(        selector = re\.sub)',
    re.DOTALL,
)

correct_body = '''
        import re

        if selector.startswith(("role=", "text=", "placeholder=", "data-testid=")):
            return selector

        if ">>" in selector:
            return selector

        match = re.match(r\'^\[([a-zA-Z-]+)=["\\'"]([^"\\'"]+)["\\'\"]\]$\', selector)
        if match:
            attr, value = match.groups()
            # If the value contains a colon, stripping the brackets would create
            # an invalid Playwright selector engine (e.g. name=form:field).
            # Keep the CSS attribute selector syntax intact.
            if ":" in value:
                return selector
            return f"{attr}={value}"

        '''

def replacer(m):
    return m.group(1) + correct_body + m.group(3)

new_src, count = pattern.subn(replacer, src)
if count:
    with open("playwright_to_robot.py", "w", encoding="utf-8") as f:
        f.write(new_src)
    print(f"Fixed ({count} replacement(s))")
else:
    print("Pattern not found")
    # Fallback: show the actual lines around the problem
    for i, line in enumerate(src.splitlines()[497:540], start=498):
        print(f"{i}: {line}")
