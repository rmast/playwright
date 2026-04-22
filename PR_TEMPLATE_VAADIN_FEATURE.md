# Pull Request: Vaadin Tree Table Context-Aware Selector Generation

## Summary

Improves Playwright's codegen selector quality for complex table structures (Vaadin tree tables, data grids) by intelligently using row context instead of brittle `nth()` indices.

## Problem

Standard codegen produces fragile locators for table elements:

```
button.item-selectie >> nth=1
```

This breaks when:
- Table row order changes
- Hidden rows temporarily appear (e.g., during loading)
- Multiple similar components in different rows

## Solution

Generate row-context-aware selectors that combine row identification + element selector:

```
tr >> has-text="b21020" >> button.item-selectie
```

### Key Features

1. **Smart row ID extraction** — automatically finds meaningful identifiers (ID or short text from first cell)
2. **Semantic combined selectors** — row + element target instead of nth fallback
3. **Vaadin-specific optimizations** — handles deeply nested layouts, tree spacers, and class prefixes
4. **Low-risk scoring** — row-context candidates score between CSS ID and nth (not nth-first)

## Changes

### packages/injected/src/selectorGenerator.ts

- New score constants: `kTableRowContextScore` (650), `kTableRowTextContextScore` (700)
- Helper functions:
  - `isElementInTableRow()` — detect if element is in a row
  - `getTableRowAncestor()` — find parent row
  - `extractRowIdentifier()` — extract row ID/text intelligently
  - `buildTableRowContextCandidates()` — generate row+element selectors
  - `buildSimpleSelector()` — build target element selector
- Integration in `generateSelectorFor()` to include row-context candidates

### tests/library/selector-generator-vaadin-tables.spec.ts (new)

- 6 comprehensive test cases covering:
  - Buttons with IDs in rows with IDs
  - Buttons without unique IDs (row text context)
  - Duplicate IDs resolved via row context
  - Deeply nested Vaadin structures
  - Visible text/caption handling
  - Regression checks

### VAADIN_TREETABLE_FEATURE.md (documentation)

Detailed feature explanation, examples, test coverage, and future enhancements.

## Testing

### Run Vaadin tree table tests

```bash
npm test -- tests/library/selector-generator-vaadin-tables.spec.ts
```

### Regression check

```bash
npm test -- tests/library/selector-generator.spec.ts
```

### Manual testing example

```javascript
// In Playwright Inspector or codegen:
// Click a button inside a Vaadin tree table row

// Expected improvement:
// Before: button.v-nativebutton >> nth=2
// After:  tr >> has-text="activity-code" >> button.v-nativebutton
```

## Breaking Changes

None. This is a **codegen-only improvement** that does not change:
- Test execution behavior
- Locator APIs
- Selector parsing or matching
- Runtime library behavior

## Compatibility

- **Base:** feat/visible-only branch (Playwright 1.58.0-next+)
- **Scope:** Codegen/selector generation (browser codegen tool, inspector)
- **Browsers:** All browsers (feature-neutral code)

## Examples

### Before & After

#### Example 1: Simple Row with ID Button

**HTML:**
```html
<tr><td id="b21020">b21020</td><td><button class="item-selectie" id="b21020">☐</button></td></tr>
```

**Before:** `button.item-selectie >> nth=0`  
**After:** `tr >> has-text="b21020" >> button.item-selectie`

#### Example 2: Multiple Rows, Multiple Buttons

**HTML:**
```html
<tr><td>Row 1 ID<td><button class="action">Select</button></tr>
<tr><td>Row 2 ID<td><button class="action">Select</button></tr>
```

**Before (ambiguous):**
- Row 1 button: `button.action >> nth=0`
- Row 2 button: `button.action >> nth=1`

**After (self-documenting):**
- Row 1 button: `tr >> has-text="Row 1 ID" >> button.action`
- Row 2 button: `tr >> has-text="Row 2 ID" >> button.action`

## Reviewers

- Consider codegen and selector generation expertise
- Check injected script changes for performance implications
- Verify test coverage for various table structures

## Future Work

- Multi-column row identification
- ARIA grid (`role="row"` / `role="cell"`) formal support
- Tree depth nesting awareness
- Configurable scoring preferences
