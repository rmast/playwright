from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context()
    page = ctx.new_page()
    page.goto('https://ln-o2-svc-cbb-vhn.o-dc.ba.uwv.nl/cbbs/')
    page.fill('input[name=username]', 'sada1')
    page.fill('input[name=password]', 'welkom')
    page.click('css=input[type=submit],button[type=submit]')
    page.wait_for_load_state('networkidle', timeout=30000)
    page.goto('https://ln-o2-svc-cbb-vhn.o-dc.ba.uwv.nl/cbbs/ada/index.jsf')
    page.wait_for_load_state('networkidle', timeout=30000)

    # Click Rapporten menu and wait for load
    page.locator('[id="mainmenuform:mainmenu_rapportage"]').click()
    page.wait_for_load_state('networkidle', timeout=30000)
    page.wait_for_timeout(2000)

    print('URL after click:', page.url)
    print('Title:', page.title())

    # Check if field is now visible
    field = page.locator('[name="adaReportPage:functiesPerSbcCode"]')
    print('SBC field count:', field.count())
    print('SBC field visible:', field.first.is_visible() if field.count() > 0 else 'N/A')

    # All inputs on the page
    print('--- All named inputs ---')
    inputs = page.query_selector_all('input[name],select[name],textarea[name]')
    for el in inputs[:30]:
        print(f'  name={el.get_attribute("name")} type={el.get_attribute("type")} visible={el.is_visible()}')

    # Look for ADA-related elements
    print('--- Elements with adaReportPage ---')
    ada_els = page.query_selector_all('[id*=adaReportPage],[name*=adaReportPage]')
    for el in ada_els[:20]:
        print(f'  tag={el.evaluate("e=>e.tagName")} id={el.get_attribute("id")} visible={el.is_visible()}')

    browser.close()
