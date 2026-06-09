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

    # Navigate via Functie → Zoeken menu
    page.locator('[id="mainmenuform:mainmenu_functie_zoeken"]').click()
    page.wait_for_load_state('networkidle', timeout=30000)
    print('URL after Functie>Zoeken:', page.url)

    # Show all inputs on the search page
    print('--- Inputs on zoeken page ---')
    els = page.query_selector_all('input:not([type=hidden]),select,textarea')
    for el in els[:20]:
        print(f'  tag={el.evaluate("e=>e.tagName")} id={el.get_attribute("id")} name={el.get_attribute("name")} type={el.get_attribute("type")} visible={el.is_visible()}')

    # Show buttons
    print('--- Buttons ---')
    btns = page.query_selector_all('input[type=submit],button[type=submit],button,input[type=button]')
    for b in btns[:10]:
        print(f'  tag={b.evaluate("e=>e.tagName")} id={b.get_attribute("id")} name={b.get_attribute("name")} value={b.get_attribute("value")} text={b.inner_text()[:40].strip()}')

    browser.close()
