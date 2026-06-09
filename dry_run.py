import sys
sys.path.insert(0, r'C:\Users\rma123\source\repos\playwright\.venv-recorder\Lib\site-packages')
from robotframework_browser_recorder.converter.playwright_to_robot import PlaywrightToRobotConverter

c = PlaywrightToRobotConverter()

playwright_code = '''
def run(playwright):
    browser = playwright.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()
    page.goto("https://ln-o2-svc-cbb-vhn.o-dc.ba.uwv.nl/cbbs/")
    page.locator("input[name=\\"password\\"]").fill("welkom")
    page.locator("input[name=\\"password\\"]").press("Enter")
    page.goto("https://ln-o2-svc-cbb-vhn.o-dc.ba.uwv.nl/cbbs/functie/algemeen.jsf")
    page.get_by_role("group").click()
    page.get_by_role("textbox", name="Opleidingseisen").click()
    page.get_by_role("textbox", name="Opleidingseisen").fill("Functie I - 1")
    page.get_by_role("textbox", name="Ervaring").click()
    page.get_by_role("textbox", name="Ervaring").fill("Functie I - 1")
    page.get_by_role("button", name="Opslaan, volgende tabblad").click()
    page.get_by_role("textbox", name="Proces").fill("Functie I - 1")
    page.get_by_role("button", name="Opslaan, volgende tabblad").click()
'''

result = c.convert(playwright_code, har_path='recorded_test.har')
print(result)
