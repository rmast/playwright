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

    page.hover('[id="mainmenuform:mainmenu_functie"]')
    page.locator('[id="mainmenuform:mainmenu_functie_nieuw"]').click()
    page.wait_for_load_state('networkidle', timeout=30000)

    print('URL:', page.url)
    print('Title:', page.title())

    # All visible inputs and textareas with labels
    print('--- Visible inputs/textareas ---')
    els = page.query_selector_all('input:not([type=hidden]),textarea')
    for el in els[:30]:
        label = ''
        el_id = el.get_attribute('id') or ''
        if el_id:
            lbl = page.query_selector(f'label[for="{el_id}"]')
            if lbl:
                label = lbl.inner_text().strip()
        aria = el.get_attribute('aria-label') or ''
        print(f'  tag={el.evaluate("e=>e.tagName")} id={el_id} name={el.get_attribute("name")} type={el.get_attribute("type")} visible={el.is_visible()} label={label or aria}')

    # All visible buttons
    print('--- Buttons ---')
    btns = page.query_selector_all('input[type=submit],button')
    for b in btns[:10]:
        if b.is_visible():
            print(f'  id={b.get_attribute("id")} text={b.inner_text()[:50].strip()} value={b.get_attribute("value")}')

    browser.close()
