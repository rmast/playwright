from playwright_to_robot import PlaywrightToRobotConverter as C
c = C()
playwright_code = '''
page.get_by_text("Test Hugo 2", exact=True).click()
page.get_by_text("Test Hugo 2", exact=True).click()
page.get_by_role("cell", name="Test Hugo 2", exact=True).locator(".movable").dblclick()
page.get_by_role("cell", name="Test Hugo 2", exact=True).locator(".movable").click()
page.get_by_role("cell", name="Test Hugo 2", exact=True).locator(".movable").click()
page.locator("tr").filter(has_text="Test Hugo 2").locator("span.v-treetable-treespacer.v-treetable-node-closed").first.click()
page.locator("tr").filter(has_text="Test Hugo 2").locator("span.v-treetable-treespacer.v-treetable-node-open").click()
page.get_by_role("cell", name="Test Hugo 2", exact=True).locator(".movable").dblclick()
page.get_by_role("cell", name="Test Hugo 2", exact=True).locator(".movable").click()
page.get_by_role("cell", name="Test Hugo 2", exact=True).locator(".movable").dblclick()
page.get_by_role("cell", name="Test Hugo 2", exact=True).locator(".movable").click()
page.get_by_role("cell", name="Test Hugo 2", exact=True).locator(".movable").click()
page.get_by_role("cell", name="Test Hugo 2", exact=True).locator(".movable").click()
'''
print(c.convert(playwright_code))
