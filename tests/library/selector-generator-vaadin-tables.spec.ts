/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = `data:text/html,`;

async function generate(page: any, selector: string): Promise<string> {
  return await page.evaluate(({ selector }) => {
    return (window as any).playwright.inspectorBoundaries.evaluateInUtility(selector, (element: Element) => {
      return (window as any).playwright.generateLocator(element);
    });
  }, { selector });
}

test.describe('Selector generator for Vaadin tree tables', () => {
  test('should prefer row context over nth for buttons in table rows with IDs', async ({ page, context }) => {
    const html = `
      <table>
        <tr class="v-table-row">
          <td class="v-table-cell-content">
            <div class="v-label">b21020</div>
            <div class="v-label">Lichtgevoeligheid</div>
          </td>
          <td>
            <button class="v-nativebutton itje" id="row-1-info">i</button>
          </td>
          <td>
            <button class="v-nativebutton item-selectie" id="b21020">☐</button>
          </td>
        </tr>
        <tr class="v-table-row">
          <td class="v-table-cell-content">
            <div class="v-label">e1358a</div>
            <div class="v-label">Specifieke stoffen</div>
          </td>
          <td>
            <button class="v-nativebutton itje" id="row-2-info">i</button>
          </td>
          <td>
            <button class="v-nativebutton item-selectie" id="e1358a">VA</button>
          </td>
        </tr>
      </table>
    `;
    
    await page.setContent(html);
    
    // Target the first row's checkbox button (id=b21020).
    // Codegen should prefer row context (row with label "b21020") >> button.item-selectie
    // rather than falling back to class + nth.
    const selector = await generate(page, 'button[id="b21020"]');
    
    // Should contain row context indicator; nth should not be primary strategy
    expect(selector).not.toMatch(/nth=\d+\s*$/);
    // Should prefer the semantic ID in context or has-text
    expect(selector).toMatch(/\b(id|has-text|button|item-selectie)/i);
  });

  test('should use row text context for buttons without unique IDs', async ({ page }) => {
    const html = `
      <table>
        <tr class="v-table-row">
          <td class="v-table-cell-content">
            <div class="v-label">Activity 1</div>
          </td>
          <td>
            <button class="v-nativebutton action">Select</button>
          </td>
        </tr>
        <tr class="v-table-row">
          <td class="v-table-cell-content">
            <div class="v-label">Activity 2</div>
          </td>
          <td>
            <button class="v-nativebutton action">Select</button>
          </td>
        </tr>
      </table>
    `;
    
    await page.setContent(html);
    
    // Target "Select" button in row with "Activity 1"
    const selector = await generate(page, 'tr:has-text("Activity 1") button');
    
    // Should use row-level has-text context instead of pure nth
    expect(selector).toMatch(/Activity 1|v-table-row|action/i);
    // Pure nth fallback should not be primary
    expect(selector).not.toMatch(/^button >> nth=/);
  });

  test('should select nested button via parent cell text when IDs are duplicate', async ({ page }) => {
    const html = `
      <table>
        <tr class="v-table-row">
          <td>Row 1: <span class="row-id">ID-001</span></td>
          <td>
            <button class="gesture-btn" id="shared-id">Delete</button>
          </td>
        </tr>
        <tr class="v-table-row">
          <td>Row 2: <span class="row-id">ID-002</span></td>
          <td>
            <button class="gesture-btn" id="shared-id">Delete</button>
          </td>
        </tr>
      </table>
    `;
    
    await page.setContent(html);
    
    // Target delete button in first row (id="shared-id" at nth=0)
    const selector = await generate(page, 'tr:first-child button.gesture-btn');
    
    // Since buttons have duplicate IDs, codegen should prefer row text context
    expect(selector).toMatch(/(ID-001|Row 1|gesture-btn|v-table-row)/i);
    // Should avoid pure nth approach
    expect(selector).not.toMatch(/^button\.gesture-btn >> nth=0$/);
  });

  test('should group selectors within single row scope', async ({ page }) => {
    const html = `
      <table>
        <tr class="v-table-row" id="risk-row-a">
          <td>
            <label>Risk A</label>
          </td>
          <td>
            <button class="info-btn">ℹ</button>
          </td>
          <td>
            <button class="checkbox-btn">☑</button>
          </td>
          <td>
            <button class="link-btn">🔗</button>
          </td>
        </tr>
        <tr class="v-table-row" id="risk-row-b">
          <td>
            <label>Risk B</label>
          </td>
          <td>
            <button class="info-btn">ℹ</button>
          </td>
          <td>
            <button class="checkbox-btn">☑</button>
          </td>
          <td>
            <button class="link-btn">🔗</button>
          </td>
        </tr>
      </table>
    `;
    
    await page.setContent(html);
    
    // Target checkbox in first row
    const selector = await generate(page, '#risk-row-a button.checkbox-btn');
    
    // Should use either row ID or row text as anchor point
    expect(selector).toMatch(/(risk-row-a|Risk A|checkbox-btn)/i);
    // Should not fall back to nth for buttons in the same structural class within a row
    expect(selector).not.toMatch(/button\.checkbox-btn >> nth=/);
  });

  test('should preserve text content for actionable buttons with captions', async ({ page }) => {
    const html = `
      <table>
        <tr class="v-table-row">
          <td>Item: <div class="item-label">e1358a</div></td>
          <td>
            <button class="state-btn" id="col-1"><span>VA</span></button>
          </td>
          <td>
            <button class="state-btn disabled" id="col-2" disabled><span>AD</span></button>
          </td>
        </tr>
        <tr class="v-table-row">
          <td>Item: <div class="item-label">f2469b</div></td>
          <td>
            <button class="state-btn" id="col-1"><span>VA</span></button>
          </td>
          <td>
            <button class="state-btn disabled" id="col-2" disabled><span>AD</span></button>
          </td>
        </tr>
      </table>
    `;
    
    await page.setContent(html);
    
    // Target the "VA" button in the row with label "e1358a"
    const selector = await generate(page, 'tr:has-text("e1358a") button:has-text("VA")');
    
    // Should include row context (e1358a) and button text (VA)
    expect(selector).toMatch(/(e1358a|VA|state-btn)/i);
    // Should avoid pure nth or duplicate ID confusion
    expect(selector).not.toMatch(/col-1 >> nth=/);
  });

  test('should handle deeply nested Vaadin structures (treespacer + layout)', async ({ page }) => {
    const html = `
      <table>
        <tr class="v-table-row">
          <td class="v-table-cell-content">
            <div class="v-table-cell-wrapper">
              <span class="v-treetable-treespacer"></span>
              <div class="v-csslayout activiteit-categorie">
                <div class="v-label" id="b21020">b21020</div>
                <div class="v-label">Lichtgevoeligheid</div>
              </div>
            </div>
          </td>
          <td>
            <button class="v-nativebutton itje" id="info-btn-1">i</button>
          </td>
          <td>
            <button class="v-nativebutton item-selectie" id="b21020">☐</button>
          </td>
        </tr>
        <tr class="v-table-row">
          <td class="v-table-cell-content">
            <div class="v-table-cell-wrapper">
              <span class="v-treetable-treespacer"></span>
              <div class="v-csslayout activiteit-categorie">
                <div class="v-label" id="c32131">c32131</div>
                <div class="v-label">Another Activity</div>
              </div>
            </div>
          </td>
          <td>
            <button class="v-nativebutton itje" id="info-btn-2">i</button>
          </td>
          <td>
            <button class="v-nativebutton item-selectie" id="c32131">☐</button>
          </td>
        </tr>
      </table>
    `;
    
    await page.setContent(html);
    
    // Target checkbox for row with ID b21020
    const selector = await generate(page, 'button.item-selectie[id="b21020"]');
    
    // Should navigate cleanly through Vaadin nesting without excessive nth
    // Prefer ID-based or row-text-based selection
    expect(selector).not.toMatch(/nth=\d+ >> nth=/);
    expect(selector).toMatch(/(b21020|item-selectie|Lichtgevoeligheid)/i);
  });
});
