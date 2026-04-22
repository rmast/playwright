# Vaadin Tree Table Context-Aware Selector Generation

## Problem

Playwright's standard codegen produces brittle locators for complex table structures (especially Vaadin tree tables) by falling back to `nth()` indices when elements have duplicate or missing IDs:

```html
<tr>
  <td id="b21020">b21020</td>
  <td>Lichtgevoeligheid</td>
  <td><button class="item-selectie" id="b21020">☐</button></td>
</tr>
```

**Generated before:** `button.item-selectie >> nth=1`  
**Problem:** Fragile; breaks if table order changes, or if hidden rows appear.

## Solution

This feature branch enables **context-aware, row-based selector generation** that:

1. **Detects table row context** — checks if element is inside `<tr>` or `[role="row"]`
2. **Extracts row identifiers** — intelligently finds ID or text from first cell (prefers codes like "b21020" over long descriptions)
3. **Builds composite locators** — combines row context + element selector instead of nth

**Generated after:** `tr >> has-text="b21020" >> button.item-selectie`  
**Benefit:** More stable, self-documenting, and resistant to table reordering.

## Implementation Details

### New Score Constants

```typescript
const kTableRowContextScore = 650;      // Row ID or structural anchor
const kTableRowTextContextScore = 700;  // Row text context (has-text)
```

These score between CSS IDs (500) and nth fallback (10000), giving row-context selectors natural precedence.

### Helper Functions Added

- **`isElementInTableRow(element)`** — Quick check if element is nested in a table row
- **`getTableRowAncestor(element)`** — Find the nearest `<tr>` or `[role="row"]` parent
- **`extractRowIdentifier(row)`** — Extract meaningful row ID/text (strategies: row.id → first cell ID → first cell short text)
- **`buildTableRowContextCandidates()`** — Generate row+element composite selectors
- **`buildSimpleSelector(element)`** — Build single-level element selector for combining with row context

### Integration Points

Modified `generateSelectorFor()` to include row-context candidates:

```typescript
// Add row-context candidates for elements within table rows (Vaadin, data grids, etc.)
if (!options.isRecursive && isElementInTableRow(targetElement)) {
  for (const candidate of buildTableRowContextCandidates(injectedScript, targetElement))
    candidates.push({ candidate, isTextCandidate: true });
}
```

Row-context selectors are added to the candidate pool **before** pure nth fallback, so they naturally win during score-based selection.

## Test Coverage

File: `tests/library/selector-generator-vaadin-tables.spec.ts`

Covers:
- Buttons with IDs in rows with IDs
- Buttons without unique IDs (using row text context)
- Duplicate IDs resolved via row context
- Deeply nested Vaadin structures (treespacer + layouts)
- Buttons with visible text/captions within rows
- Proper avoidance of pure nth when row context available

## Vaadin-Specific Examples

### Example 1: Checkbox in Activity Row

```html
<tr class="v-table-row">
  <td class="v-table-cell-content">
    <div class="v-label" id="b21020">b21020</div>
    <div class="v-label">Lichtgevoeligheid</div>
  </td>
  <td>
    <button class="v-nativebutton item-selectie" id="b21020">☐</button>
  </td>
</tr>
```

**Before:** `button.item-selectie >> nth=0`  
**After:** `tr >> has-text="b21020" >> button.item-selectie`

### Example 2: Multiple Button Types in Same Row

```html
<tr>
  <td><span class="v-label">e1358a</span></td>
  <td><button class="itje">i</button></td>
  <td><button class="item-selectie">VA</button></td>
</tr>
```

**Before (both buttons failing):**
- Info button: `button.itje >> nth=0` (ambiguous across rows)
- Select button: `button.item-selectie >> nth=0` (ambiguous across rows)

**After:**
- Info button: `tr >> has-text="e1358a" >> button.itje`
- Select button: `tr >> has-text="e1358a" >> button.item-selectie`

## Compatibility

- **Base version:** feat/visible-only (commit 842ee675...)
- **Playwright 1.58.0-next** and later
- **Non-breaking:** Only improves selector quality; does not change APIs or runtime behavior
- **Cross-browser:** Works with all browsers (codegen-only feature)

## Future Enhancements

Potential improvements (not in this PR):
1. **Multi-column cell grouping** — combine multiple cell labels for more unique row identification
2. **ARIA grid support** — formal `role="row"` / `role="cell"` attribute handling
3. **Tree depth awareness** — detect parent row context for nested tree items
4. **Configurable scoring** — allow users to tune row-context vs. nth preferences

## Testing

Run the test suite:

```bash
npm test -- tests/library/selector-generator-vaadin-tables.spec.ts
```

Or run selector-generator tests to ensure no regressions:

```bash
npm test -- tests/library/selector-generator.spec.ts
```

## Files Modified

1. **packages/injected/src/selectorGenerator.ts**
   - New score constants
   - Row-context helper functions
   - Integration in generateSelectorFor()

2. **tests/library/selector-generator-vaadin-tables.spec.ts** (new)
   - 6 comprehensive test cases
   - Vaadin-specific HTML structures
   - Regression checks for nth avoidance

---

**Status:** Feature branch ready for review and testing  
**Frame:** Branch `feat/vaadin-treetable-codegen` based on `feat/visible-only`
