import re
from playwright.sync_api import Playwright, sync_playwright, expect


def run(playwright: Playwright) -> None:
    browser = playwright.chromium.launch(headless=False)
    context = browser.new_context(service_workers="block")
    context.route_from_har("C:\\Users\\rma123\\source\\repos\\playwright\\recorded_test.har", url="https://ln-o2-svc-cbb-vhn.o-dc.ba.uwv.nl/**")
    page = context.new_page()
    page.goto("https://ln-o2-svc-cbb-vhn.o-dc.ba.uwv.nl/cbbs/")
    page.locator("input[type=\"text\"][name=\"username\"]").fill("sada1")
    page.locator("input[name=\"password\"]").fill("welkom")
    page.locator("#mainmenuform\:mainmenu_functie").hover()
    page.locator("#mainmenuform\:mainmenu_functie_nieuw").click()
    page.locator("input[name=\"functieAlgemeenPage:functienummerFieldInput\"]").fill("2531")
    page.locator("input[name=\"functieAlgemeenPage:functienummerFieldInput1\"]").fill("0206")
    page.locator("input[name=\"functieAlgemeenPage:FunctienaamFieldInput\"]").fill("Compleet-a")
    page.locator("input[name=\"functieAlgemeenPage:ArbeidsplaatsenFieldInput\"]").fill("1")
    page.locator("input[name=\"functieAlgemeenPage:sbcCodeFieldInput\"]").fill("444030")
    page.locator("#functieAlgemeenPage\:nextButton").click()
    page.get_by_role("button", name="Login").click()
    page.goto("https://ln-o2-svc-cbb-vhn.o-dc.ba.uwv.nl/cbbs/functie/algemeen.jsf")
    page.get_by_role("textbox", name="Opleidingseisen").click()
    page.get_by_role("textbox", name="Opleidingseisen").fill("Functie I - 1")
    page.get_by_role("button", name="Opslaan, volgende tabblad »").click()
    page.get_by_role("textbox", name="Proces").click()
    page.get_by_role("textbox", name="Proces").fill("Functie I - 1")
    page.get_by_role("button", name="Opslaan, volgende tabblad »").click()
    page.locator("id=functieTakenPage:Omschrijving1").fill("Functie I - 1")
    page.locator("[id=\"functieTakenPage:Percentage1\"]").fill("100")
    page.get_by_role("button", name="Opslaan, volgende tabblad »").click()
    page.locator("id=functieArbeidspatroonPage:dagelijksFieldInput").fill("9")
    page.locator("id=functieArbeidspatroonPage:dagFieldInput").check()
    page.locator("id=functieArbeidspatroonPage:dagelijksFieldInput").fill("9")
    page.locator("id=functieArbeidspatroonPage:dagFieldInput1").check()
    page.locator("id=functieArbeidspatroonPage:dagdeelFieldInput").check()
    page.locator("id=functieArbeidspatroonPage:dagdeelFieldInput1").check()
    page.get_by_role("button", name="Opslaan, volgende tabblad »").click()
    page.locator("id=functieLoonGegevensPage:UrenPerWeekFTFieldInput").fill("40")
    page.get_by_role("textbox", name="Uren per week (contract)").fill("40")
    page.get_by_role("button", name="Opslaan, volgende tabblad »").click()
    page.close()

    # ---------------------
    context.close()
    browser.close()


with sync_playwright() as playwright:
    run(playwright)
