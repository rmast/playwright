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

import { escapeForAttributeSelector, escapeForTextSelector, escapeRegExp, quoteCSSAttributeValue } from '@isomorphic/stringUtils';

import { beginDOMCaches, closestCrossShadow, endDOMCaches, isElementVisible, isInsideScope, parentElementOrShadowHost } from './domUtils';
import { beginAriaCaches, endAriaCaches, getAriaRole, getElementAccessibleName } from './roleUtils';
import { elementText, getElementLabels } from './selectorUtils';

import type { InjectedScript } from './injectedScript';

type SelectorToken = {
  engine: string;
  selector: string;
  score: number;  // Lower is better.
};

type Cache = {
  allowText: Map<Element, SelectorToken[] | null>;
  disallowText: Map<Element, SelectorToken[] | null>;
};

const kTextScoreRange = 10;
const kExactPenalty = kTextScoreRange / 2;

const kTestIdScore = 1;        // testIdAttributeName
const kOtherTestIdScore = 2;   // other data-test* attributes

const kIframeByAttributeScore = 10;

const kBeginPenalizedScore = 50;
const kRoleWithNameScore = 100;
const kPlaceholderScore = 120;
const kLabelScore = 140;
const kAltTextScore = 160;
const kTextScore = 180;
const kTitleScore = 200;
const kTextScoreRegex = 250;
const kPlaceholderScoreExact = kPlaceholderScore + kExactPenalty;
const kLabelScoreExact = kLabelScore + kExactPenalty;
const kRoleWithNameScoreExact = kRoleWithNameScore + kExactPenalty;
const kAltTextScoreExact = kAltTextScore + kExactPenalty;
const kTextScoreExact = kTextScore + kExactPenalty;
const kTitleScoreExact = kTitleScore + kExactPenalty;
const kEndPenalizedScore = 300;

const kCSSIdScore = 500;
const kCSSClassScore = 505;
const kRoleWithoutNameScore = 510;
const kCSSInputTypeNameScore = 520;
const kCSSTagNameScore = 530;

// Row-context selectors (table row + cell content) score better than nth but worse than CSS ID.
// This enables semantic selection in tree tables and data grids.
const kTableRowContextScore = 650;
const kTableRowTextContextScore = 700;
const kMenubarContextScore = 60;
const kMenubarTextContextScore = 70;
const kMenubarTargetScore = 80;

const kNthScore = 10000;
const kCSSFallbackScore = 10000000;

const kScoreThresholdForTextExpect = 1000;

export type GenerateSelectorOptions = {
  testIdAttributeName: string;
  omitInternalEngines?: boolean;
  root?: Element | Document;
  forTextExpect?: boolean;
  multiple?: boolean;
};

export function generateSelector(injectedScript: InjectedScript, targetElement: Element, options: GenerateSelectorOptions): { selector: string, selectors: string[], elements: Element[] } {
  injectedScript._evaluator.begin();
  const cache: Cache = { allowText: new Map(), disallowText: new Map() };
  beginAriaCaches();
  beginDOMCaches();
  try {
    let selectors: string[] = [];
    if (options.forTextExpect) {
      let targetTokens = cssFallback(injectedScript, targetElement.ownerDocument.documentElement, options);
      for (let element: Element | undefined = targetElement; element; element = parentElementOrShadowHost(element)) {
        const tokens = generateSelectorFor(cache, injectedScript, element, { ...options, noText: true });
        if (!tokens)
          continue;
        const score = combineScores(tokens);
        if (score <= kScoreThresholdForTextExpect) {
          targetTokens = tokens;
          break;
        }
      }
      selectors = [joinTokens(targetTokens)];
    } else {
      // Note: this matches InjectedScript.retarget().
      if (!targetElement.matches('input,textarea,select') && !(targetElement as any).isContentEditable) {
        const interactiveParent = closestCrossShadow(targetElement, 'button,select,input,[role=button],[role=checkbox],[role=radio],a,[role=link]', options.root);
        if (interactiveParent && isElementVisible(interactiveParent))
          targetElement = interactiveParent;
      }
      if (options.multiple) {
        const withText = generateSelectorFor(cache, injectedScript, targetElement, options);
        const withoutText = generateSelectorFor(cache, injectedScript, targetElement, { ...options, noText: true });
        let tokens = [withText, withoutText];

        // Clear cache to re-generate without css id.
        cache.allowText.clear();
        cache.disallowText.clear();

        if (withText && hasCSSIdToken(withText))
          tokens.push(generateSelectorFor(cache, injectedScript, targetElement, { ...options, noCSSId: true }));
        if (withoutText && hasCSSIdToken(withoutText))
          tokens.push(generateSelectorFor(cache, injectedScript, targetElement, { ...options, noText: true, noCSSId: true }));

        tokens = tokens.filter(Boolean);
        if (!tokens.length) {
          const css = cssFallback(injectedScript, targetElement, options);
          tokens.push(css);
          if (hasCSSIdToken(css))
            tokens.push(cssFallback(injectedScript, targetElement, { ...options, noCSSId: true }));
        }
        selectors = [...new Set(tokens.map(t => joinTokens(t!)))];
      } else {
        const targetTokens = generateSelectorFor(cache, injectedScript, targetElement, options) || cssFallback(injectedScript, targetElement, options);
        selectors = [joinTokens(targetTokens)];
      }
    }
    const selector = selectors[0];
    const parsedSelector = injectedScript.parseSelector(selector);
    return {
      selector,
      selectors,
      elements: injectedScript.querySelectorAll(parsedSelector, options.root ?? targetElement.ownerDocument)
    };
  } finally {
    endDOMCaches();
    endAriaCaches();
    injectedScript._evaluator.end();
  }
}

type InternalOptions = GenerateSelectorOptions & { noText?: boolean, noCSSId?: boolean, isRecursive?: boolean };

function generateSelectorFor(cache: Cache, injectedScript: InjectedScript, targetElement: Element, options: InternalOptions): SelectorToken[] | null {
  if (options.root && !isInsideScope(options.root, targetElement))
    throw new Error(`Target element must belong to the root's subtree`);

  if (targetElement === options.root)
    return [{ engine: 'css', selector: ':scope', score: 1 }];
  if (targetElement.ownerDocument.documentElement === targetElement)
    return [{ engine: 'css', selector: 'html', score: 1 }];

  let result: SelectorToken[] | null = null;
  const updateResult = (candidate: SelectorToken[]) => {
    if (!result || combineScores(candidate) < combineScores(result))
      result = candidate;
  };

  const candidates: { candidate: SelectorToken[], isTextCandidate: boolean }[] = [];
  if (!options.noText) {
    for (const candidate of buildTextCandidates(injectedScript, targetElement, !options.isRecursive))
      candidates.push({ candidate, isTextCandidate: true });
  }

  if (!options.isRecursive) {
    for (const candidate of buildMenubarContextCandidates(injectedScript, targetElement))
      candidates.push({ candidate, isTextCandidate: true });
  }
  
  // Add row-context candidates for elements within table rows (Vaadin, data grids, etc.)
  if (!options.isRecursive && isElementInTableRow(targetElement)) {
    for (const candidate of buildTableRowContextCandidates(injectedScript, targetElement))
      candidates.push({ candidate, isTextCandidate: true });
  }
  
  for (const token of buildNoTextCandidates(injectedScript, targetElement, options)) {
    if (options.omitInternalEngines && token.engine.startsWith('internal:'))
      continue;
    candidates.push({ candidate: [token], isTextCandidate: false });
  }
  candidates.sort((a, b) => combineScores(a.candidate) - combineScores(b.candidate));

  for (const { candidate, isTextCandidate } of candidates) {
    const elements = injectedScript.querySelectorAll(injectedScript.parseSelector(joinTokens(candidate)), options.root ?? targetElement.ownerDocument);
    if (!elements.includes(targetElement)) {
      // Somehow this selector just does not match the target. Oh well.
      continue;
    }

    if (elements.length === 1) {
      // Perfect strict match. All other candidates are strictly worse because they are sorted by score.
      updateResult(candidate);
      break;
    }

    const index = elements.indexOf(targetElement);
    if (index > 5) {
      // Do not generate locators with nth=6 or worse.
      continue;
    }
    updateResult([...candidate, { engine: 'nth', selector: String(index), score: kNthScore }]);

    if (options.isRecursive) {
      // Limit nesting to two levels: parent >>> target.
      continue;
    }

    // Skip nested selection for Vaadin popup menu items to avoid label-based parent locators.
    if (targetElement.closest('.v-menubar-popup')) {
      continue;
    }

    // Now try nested selectors: (best selector for parent) >>> (this candidate selector).
    for (let parent = parentElementOrShadowHost(targetElement); parent && parent !== options.root; parent = parentElementOrShadowHost(parent)) {
      const filtered = elements.filter(e => isInsideScope(parent, e) && e !== parent);
      const newIndex = filtered.indexOf(targetElement);
      if (filtered.length > 5 || newIndex === -1 || (newIndex === index && filtered.length > 1)) {
        // Filtering to this parent is not an improvement - do not generate selector for parent.
        continue;
      }

      const inParent = filtered.length === 1 ? candidate : [...candidate, { engine: 'nth', selector: String(newIndex), score: kNthScore }];
      const idealSelectorForParent = { engine: '', selector: '', score: 1 }; // Best theoretical score we could achieve for the parent.
      if (result && combineScores([idealSelectorForParent, ...inParent]) >= combineScores(result)) {
        // It is impossible to generate a better scoring selector through this parent.
        continue;
      }

      // Do not allow text in parent selector when using text in the target selector.
      const noText = !!options.noText || isTextCandidate;
      const cacheMap = noText ? cache.disallowText : cache.allowText;
      let parentTokens = cacheMap.get(parent);
      if (parentTokens === undefined) {
        parentTokens = generateSelectorFor(cache, injectedScript, parent, { ...options, isRecursive: true, noText }) || cssFallback(injectedScript, parent, options);
        cacheMap.set(parent, parentTokens);
      }
      if (!parentTokens)
        continue;

      updateResult([...parentTokens, ...inParent]);
    }
  }
  return result;
}

function buildNoTextCandidates(injectedScript: InjectedScript, element: Element, options: InternalOptions): SelectorToken[] {
  const candidates: SelectorToken[] = [];

  // CSS selectors are applicable to elements via locator() and iframes via frameLocator().
  {
    for (const attr of ['data-testid', 'data-test-id', 'data-test']) {
      if (attr !== options.testIdAttributeName && element.getAttribute(attr))
        candidates.push({ engine: 'css', selector: `[${attr}=${quoteCSSAttributeValue(element.getAttribute(attr)!)}]`, score: kOtherTestIdScore });
    }

    if (!options.noCSSId) {
      const idAttr = element.getAttribute('id');
      if (idAttr && !isGuidLike(idAttr))
        candidates.push({ engine: 'css', selector: makeSelectorForId(idAttr), score: kCSSIdScore });
    }

    const classCandidates = buildClassSelectorCandidates(element);
    for (let i = 0; i < classCandidates.length; i++)
      candidates.push({ engine: 'css', selector: classCandidates[i], score: kCSSClassScore + i });

    candidates.push({ engine: 'css', selector: escapeNodeName(element), score: kCSSTagNameScore });
  }

  if (element.nodeName === 'IFRAME') {
    for (const attribute of ['name', 'title']) {
      if (element.getAttribute(attribute))
        candidates.push({ engine: 'css', selector: `${escapeNodeName(element)}[${attribute}=${quoteCSSAttributeValue(element.getAttribute(attribute)!)}]`, score: kIframeByAttributeScore });
    }

    // Locate by testId via CSS selector.
    if (element.getAttribute(options.testIdAttributeName))
      candidates.push({ engine: 'css', selector: `[${options.testIdAttributeName}=${quoteCSSAttributeValue(element.getAttribute(options.testIdAttributeName)!)}]`, score: kTestIdScore });

    penalizeScoreForLength([candidates]);
    return candidates;
  }

  // Everything below is not applicable to iframes (getBy* methods).
  if (element.getAttribute(options.testIdAttributeName))
    candidates.push({ engine: 'internal:testid', selector: `[${options.testIdAttributeName}=${escapeForAttributeSelector(element.getAttribute(options.testIdAttributeName)!, true)}]`, score: kTestIdScore });

  if (element.nodeName === 'INPUT' || element.nodeName === 'TEXTAREA') {
    const input = element as HTMLInputElement | HTMLTextAreaElement;
    if (input.placeholder) {
      candidates.push({ engine: 'internal:attr', selector: `[placeholder=${escapeForAttributeSelector(input.placeholder, true)}]`, score: kPlaceholderScoreExact });
      for (const alternative of suitableTextAlternatives(input.placeholder))
        candidates.push({ engine: 'internal:attr', selector: `[placeholder=${escapeForAttributeSelector(alternative.text, false)}]`, score: kPlaceholderScore - alternative.scoreBonus });
    }
  }

  // Vaadin popup menu items can expose generic accessibility labels like
  // "This content is announced" on ancestors, which leads to brittle
  // label-chained locators for submenu entries.
  const shouldUseLabelCandidates = !element.closest('.v-menubar-popup');
  if (shouldUseLabelCandidates) {
    const labels = getElementLabels(injectedScript._evaluator._cacheText, element);
    for (const label of labels) {
      const labelText = label.normalized;
      candidates.push({ engine: 'internal:label', selector: escapeForTextSelector(labelText, true), score: kLabelScoreExact });
      for (const alternative of suitableTextAlternatives(labelText))
        candidates.push({ engine: 'internal:label', selector: escapeForTextSelector(alternative.text, false), score: kLabelScore - alternative.scoreBonus });
    }
  }

  const ariaRole = getAriaRole(element);
  if (ariaRole && !['none', 'presentation'].includes(ariaRole))
    candidates.push({ engine: 'internal:role', selector: ariaRole, score: kRoleWithoutNameScore });

  if (element.getAttribute('name') && ['BUTTON', 'FORM', 'FIELDSET', 'FRAME', 'IFRAME', 'INPUT', 'KEYGEN', 'OBJECT', 'OUTPUT', 'SELECT', 'TEXTAREA', 'MAP', 'META', 'PARAM'].includes(element.nodeName))
    candidates.push({ engine: 'css', selector: `${escapeNodeName(element)}[name=${quoteCSSAttributeValue(element.getAttribute('name')!)}]`, score: kCSSInputTypeNameScore });

  if (['INPUT', 'TEXTAREA'].includes(element.nodeName) && element.getAttribute('type') !== 'hidden') {
    if (element.getAttribute('type'))
      candidates.push({ engine: 'css', selector: `${escapeNodeName(element)}[type=${quoteCSSAttributeValue(element.getAttribute('type')!)}]`, score: kCSSInputTypeNameScore });
  }

  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.nodeName) && element.getAttribute('type') !== 'hidden')
    candidates.push({ engine: 'css', selector: escapeNodeName(element), score: kCSSInputTypeNameScore + 1 });

  penalizeScoreForLength([candidates]);
  return candidates;
}

function buildTextCandidates(injectedScript: InjectedScript, element: Element, isTargetNode: boolean): SelectorToken[][] {
  if (element.nodeName === 'SELECT')
    return [];
  const candidates: SelectorToken[][] = [];

  const title = element.getAttribute('title');
  if (title) {
    candidates.push([{ engine: 'internal:attr', selector: `[title=${escapeForAttributeSelector(title, true)}]`, score: kTitleScoreExact }]);
    for (const alternative of suitableTextAlternatives(title))
      candidates.push([{ engine: 'internal:attr', selector: `[title=${escapeForAttributeSelector(alternative.text, false)}]`, score: kTitleScore - alternative.scoreBonus }]);
  }

  const alt = element.getAttribute('alt');
  if (alt && ['APPLET', 'AREA', 'IMG', 'INPUT'].includes(element.nodeName)) {
    candidates.push([{ engine: 'internal:attr', selector: `[alt=${escapeForAttributeSelector(alt, true)}]`, score: kAltTextScoreExact }]);
    for (const alternative of suitableTextAlternatives(alt))
      candidates.push([{ engine: 'internal:attr', selector: `[alt=${escapeForAttributeSelector(alternative.text, false)}]`, score: kAltTextScore - alternative.scoreBonus }]);
  }

  const text = elementText(injectedScript._evaluator._cacheText, element).normalized;
  const textAlternatives = text ? suitableTextAlternatives(text) : [];
  if (text) {
    if (isTargetNode) {
      if (text.length <= 80)
        candidates.push([{ engine: 'internal:text', selector: escapeForTextSelector(text, true), score: kTextScoreExact }]);
      for (const alternative of textAlternatives)
        candidates.push([{ engine: 'internal:text', selector: escapeForTextSelector(alternative.text, false), score: kTextScore - alternative.scoreBonus }]);
    }
    const cssToken: SelectorToken = { engine: 'css', selector: escapeNodeName(element), score: kCSSTagNameScore };
    for (const alternative of textAlternatives)
      candidates.push([cssToken, { engine: 'internal:has-text', selector: escapeForTextSelector(alternative.text, false), score: kTextScore - alternative.scoreBonus }]);
    if (isTargetNode && text.length <= 80) {
      // Do not use regex for parent elements (for performance).
      const re = new RegExp('^' + escapeRegExp(text) + '$');
      candidates.push([cssToken, { engine: 'internal:has-text', selector: escapeForTextSelector(re, false), score: kTextScoreRegex }]);
    }

    // For Vaadin popup menu items, include popup class context to disambiguate from other elements with same text.
    if (element.closest('.v-menubar-popup') && element.closest('.v-menubar-menuitem-caption')) {
      const popupCssToken: SelectorToken = { engine: 'css', selector: '.v-menubar-menuitem-caption', score: kCSSTagNameScore - 5 };
      for (const alternative of textAlternatives)
        candidates.push([popupCssToken, { engine: 'internal:has-text', selector: escapeForTextSelector(alternative.text, false), score: kTextScore - alternative.scoreBonus }]);
      if (isTargetNode && text.length <= 80) {
        const re = new RegExp('^' + escapeRegExp(text) + '$');
        candidates.push([popupCssToken, { engine: 'internal:has-text', selector: escapeForTextSelector(re, false), score: kTextScoreRegex }]);
      }
    }
  }

  const ariaRole = getAriaRole(element);
  if (ariaRole && !['none', 'presentation'].includes(ariaRole)) {
    const ariaName = getElementAccessibleName(element, false);
    // \p{Co} means "Private Use" characters - these are often used for icon fonts and make for bad locators.
    if (ariaName && !ariaName.match(/^\p{Co}+$/u)) {
      const roleToken = { engine: 'internal:role', selector: `${ariaRole}[name=${escapeForAttributeSelector(ariaName, true)}]`, score: kRoleWithNameScoreExact };
      candidates.push([roleToken]);
      for (const alternative of suitableTextAlternatives(ariaName))
        candidates.push([{ engine: 'internal:role', selector: `${ariaRole}[name=${escapeForAttributeSelector(alternative.text, false)}]`, score: kRoleWithNameScore - alternative.scoreBonus }]);
    } else {
      const roleToken = { engine: 'internal:role', selector: `${ariaRole}`, score: kRoleWithoutNameScore };
      for (const alternative of textAlternatives)
        candidates.push([roleToken, { engine: 'internal:has-text', selector: escapeForTextSelector(alternative.text, false), score: kTextScore - alternative.scoreBonus }]);
      if (isTargetNode && text.length <= 80) {
        // Do not use regex for parent elements (for performance).
        const re = new RegExp('^' + escapeRegExp(text) + '$');
        candidates.push([roleToken, { engine: 'internal:has-text', selector: escapeForTextSelector(re, false), score: kTextScoreRegex }]);
      }
    }
  }

  penalizeScoreForLength(candidates);
  return candidates;
}

function makeSelectorForId(id: string) {
  return /^[a-zA-Z][a-zA-Z0-9\-\_]+$/.test(id) ? '#' + id : `[id=${quoteCSSAttributeValue(id)}]`;
}

function hasCSSIdToken(tokens: SelectorToken[]) {
  return tokens.some(token => token.engine === 'css' && (token.selector.startsWith('#') || token.selector.startsWith('[id="')));
}

function cssFallback(injectedScript: InjectedScript, targetElement: Element, options: InternalOptions): SelectorToken[] {
  const root: Node = options.root ?? targetElement.ownerDocument;
  const tokens: string[] = [];

  function uniqueCSSSelector(prefix?: string): string | undefined {
    const path = tokens.slice();
    if (prefix)
      path.unshift(prefix);
    const selector = path.join(' > ');
    const parsedSelector = injectedScript.parseSelector(selector);
    const node = injectedScript.querySelector(parsedSelector, root, false);
    return node === targetElement ? selector : undefined;
  }

  function makeStrict(selector: string): SelectorToken[] {
    const token = { engine: 'css', selector, score: kCSSFallbackScore };
    const parsedSelector = injectedScript.parseSelector(selector);
    const elements = injectedScript.querySelectorAll(parsedSelector, root);
    if (elements.length === 1)
      return [token];
    const nth = { engine: 'nth', selector: String(elements.indexOf(targetElement)), score: kNthScore };
    return [token, nth];
  }

  for (let element: Element | undefined = targetElement; element && element !== root; element = parentElementOrShadowHost(element)) {
    let bestTokenForLevel: string = '';

    // Element ID is the strongest signal, use it.
    if (element.id && !options.noCSSId) {
      const token = makeSelectorForId(element.id);
      const selector = uniqueCSSSelector(token);
      if (selector)
        return makeStrict(selector);
      bestTokenForLevel = token;
    }

    const parent = element.parentNode as (Element | ShadowRoot);

    // Combine class names until unique.
    const classes = [...element.classList].map(escapeClassName);
    for (let i = 0; i < classes.length; ++i) {
      const token = '.' + classes.slice(0, i + 1).join('.');
      const selector = uniqueCSSSelector(token);
      if (selector)
        return makeStrict(selector);
      // Even if not unique, does this subset of classes uniquely identify node as a child?
      if (!bestTokenForLevel && parent) {
        const sameClassSiblings = parent.querySelectorAll(token);
        if (sameClassSiblings.length === 1)
          bestTokenForLevel = token;
      }
    }

    // Ordinal is the weakest signal.
    if (parent) {
      const siblings = [...parent.children];
      const nodeName = element.nodeName;
      const sameTagSiblings = siblings.filter(sibling => sibling.nodeName === nodeName);
      const token = sameTagSiblings.indexOf(element) === 0 ? escapeNodeName(element) : `${escapeNodeName(element)}:nth-child(${1 + siblings.indexOf(element)})`;
      const selector = uniqueCSSSelector(token);
      if (selector)
        return makeStrict(selector);
      if (!bestTokenForLevel)
        bestTokenForLevel = token;
    } else if (!bestTokenForLevel) {
      bestTokenForLevel = escapeNodeName(element);
    }
    tokens.unshift(bestTokenForLevel);
  }
  return makeStrict(uniqueCSSSelector()!);
}

function penalizeScoreForLength(groups: SelectorToken[][]) {
  for (const group of groups) {
    for (const token of group) {
      if (token.score > kBeginPenalizedScore && token.score < kEndPenalizedScore)
        token.score += Math.min(kTextScoreRange, (token.selector.length / 10) | 0);
    }
  }
}

function joinTokens(tokens: SelectorToken[]): string {
  const parts = [];
  let lastEngine = '';
  for (const { engine, selector } of tokens) {
    if (parts.length  && (lastEngine !== 'css' || engine !== 'css' || selector.startsWith(':nth-match(')))
      parts.push('>>');
    lastEngine = engine;
    if (engine === 'css')
      parts.push(selector);
    else
      parts.push(`${engine}=${selector}`);
  }
  return parts.join(' ');
}

function combineScores(tokens: SelectorToken[]): number {
  let score = 0;
  for (let i = 0; i < tokens.length; i++)
    score += tokens[i].score * (tokens.length - i);
  return score;
}

function isGuidLike(id: string): boolean {
  let lastCharacterType: 'lower' | 'upper' | 'digit' | 'other' | undefined;
  let transitionCount = 0;
  for (let i = 0; i < id.length; ++i) {
    const c = id[i];
    let characterType: 'lower' | 'upper' | 'digit' | 'other';
    if (c === '-' || c === '_')
      continue;
    if (c >= 'a' && c <= 'z')
      characterType = 'lower';
    else if (c >= 'A' && c <= 'Z')
      characterType = 'upper';
    else if (c >= '0' && c <= '9')
      characterType = 'digit';
    else
      characterType = 'other';

    if (characterType === 'lower' && lastCharacterType === 'upper') {
      lastCharacterType = characterType;
      continue;
    }

    if (lastCharacterType && lastCharacterType !== characterType)
      ++transitionCount;
    lastCharacterType = characterType;
  }
  return transitionCount >= id.length / 4;
}

function trimWordBoundary(text: string, maxLength: number) {
  if (text.length <= maxLength)
    return text;
  text = text.substring(0, maxLength);
  // Find last word boundary in the text.
  const match = text.match(/^(.*)\b(.+?)$/);
  if (!match)
    return '';
  return match[1].trimEnd();
}

function suitableTextAlternatives(text: string) {
  let result: { text: string, scoreBonus: number }[] = [];

  {
    const match = text.match(/^([\d.,]+)[^.,\w]/);
    const leadingNumberLength = match ? match[1].length : 0;
    if (leadingNumberLength) {
      const alt = trimWordBoundary(text.substring(leadingNumberLength).trimStart(), 80);
      result.push({ text: alt, scoreBonus: alt.length <= 30 ? 2 : 1 });
    }
  }

  {
    const match = text.match(/[^.,\w]([\d.,]+)$/);
    const trailingNumberLength = match ? match[1].length : 0;
    if (trailingNumberLength) {
      const alt = trimWordBoundary(text.substring(0, text.length - trailingNumberLength).trimEnd(), 80);
      result.push({ text: alt, scoreBonus: alt.length <= 30 ? 2 : 1 });
    }
  }

  if (text.length <= 30) {
    result.push({ text, scoreBonus: 0 });
  } else {
    result.push({ text: trimWordBoundary(text, 80), scoreBonus: 0 });
    result.push({ text: trimWordBoundary(text, 30), scoreBonus: 1 });
  }

  result = result.filter(r => r.text);
  if (!result.length)
    result.push({ text: text.substring(0, 80), scoreBonus: 0 });

  return result;
}

function escapeNodeName(node: Node): string {
  // We are escaping it for document.querySelectorAll, not for usage in CSS file.
  return node.nodeName.toLocaleLowerCase().replace(/[:\.]/g, char => '\\' + char);
}

function escapeClassName(className: string): string {
  // We are escaping class names for document.querySelectorAll by following CSS.escape() rules.
  let result = '';
  for (let i = 0; i < className.length; i++)
    result += cssEscapeCharacter(className, i);
  return result;
}

function isStableSelectorClass(className: string): boolean {
  if (!className || className.length < 3)
    return false;
  if (className.startsWith('v-'))
    return false;
  if (isGuidLike(className))
    return false;
  if (/^[\d_-]+$/.test(className))
    return false;
  return true;
}

function buildClassSelectorCandidates(element: Element): string[] {
  const classes = [...element.classList].filter(isStableSelectorClass).slice(0, 2).map(escapeClassName);
  if (!classes.length)
    return [];

  const tag = escapeNodeName(element);
  const candidates: string[] = [`.${classes[0]}`, `${tag}.${classes[0]}`];
  if (classes.length > 1) {
    const combo = `.${classes[0]}.${classes[1]}`;
    candidates.push(combo, `${tag}${combo}`);
  }

  return [...new Set(candidates)];
}

function cssEscapeCharacter(s: string, i: number): string {
  // https://drafts.csswg.org/cssom/#serialize-an-identifier
  const c = s.charCodeAt(i);
  if (c === 0x0000)
    return '\uFFFD';
  if ((c >= 0x0001 && c <= 0x001f) ||
      (c >= 0x0030 && c <= 0x0039 && (i === 0 || (i === 1 && s.charCodeAt(0) === 0x002d))))
    return '\\' + c.toString(16) + ' ';
  if (i === 0 && c === 0x002d && s.length === 1)
    return '\\' + s.charAt(i);
  if (c >= 0x0080 || c === 0x002d || c === 0x005f || (c >= 0x0030 && c <= 0x0039) ||
      (c >= 0x0041 && c <= 0x005a) || (c >= 0x0061 && c <= 0x007a))
    return s.charAt(i);
  return '\\' + s.charAt(i);
}

// ============ Table Row Context Selectors (Vaadin Tree Tables & Data Grids) ============
// These helpers enable semantic row-based selection in structured tables where pure nth()
// would be fragile. Common in Vaadin applications with tree tables and complex row layouts.

function isElementInTableRow(element: Element): boolean {
  // Check if element or any ancestor is a <tr> or has role="row"
  return !!element.closest('tr, [role="row"]');
}

function getTableRowAncestor(element: Element): Element | null {
  return element.closest('tr, [role="row"]');
}

function extractRowIdentifier(row: Element): string | null {
  // Try to extract a unique identifier from the row (ID or meaningful text from first cell).
  // Strategy:
  // 1. Check if row itself or first <td>/<th> has an ID.
  // 2. Extract text from first <td> (up to 80 chars, numbers + short words).
  // 3. Return null if no suitable identifier found.
  
  if (row.id && !isGuidLike(row.id))
    return row.id;

  const firstCell = row.querySelector('td, th, [role="cell"]');
  if (!firstCell)
    return null;

  if (firstCell.id && !isGuidLike(firstCell.id))
    return firstCell.id;

  // Extract short text from first cell (prefer codes/IDs over long descriptions)
  const labels = firstCell.querySelectorAll('[id], .v-label');
  for (const lbl of Array.from(labels)) {
    if (lbl.id && !isGuidLike(lbl.id) && lbl.textContent && lbl.textContent.trim().length < 20)
      return lbl.id;
  }

  // Fallback to first cell text (trimmed to 80 chars and cleaned)
  const text = firstCell.textContent?.trim() || '';
  if (text) {
    const shortText = trimWordBoundary(text, 80);
    // Prefer full readable row text when available so generated selector stays intuitive.
    if (shortText.includes(' ') && shortText.length < 80)
      return shortText;
    // Fall back to compact identifiers (likely codes).
    const words = shortText.split(/\s+/);
    if (words[0] && words[0].length < 20 && /^[a-zA-Z0-9_-]+$/.test(words[0]))
      return words[0];
    if (shortText.length < 60)
      return shortText;
  }

  return null;
}

function buildTableRowContextCandidates(injectedScript: InjectedScript, element: Element): SelectorToken[][] {
  // Generate row-context-aware selectors for elements within table rows.
  // Returns empty array if element is not in a row or row has no suitable identifier.
  const candidates: SelectorToken[][] = [];
  
  const row = getTableRowAncestor(element);
  if (!row)
    return candidates;

  const rowId = extractRowIdentifier(row);
  if (!rowId)
    return candidates;

  // Strategy 1: Use row ID + target element selector
  // E.g., 'tr[id="row-1"] >> button.delete'
  if (row.id && !isGuidLike(row.id)) {
    const targetSelector = buildSimpleSelector(element);
    if (targetSelector) {
      candidates.push([
        { engine: 'css', selector: `tr#${row.id}`, score: kTableRowContextScore },
        { engine: 'css', selector: targetSelector, score: kCSSTagNameScore }
      ]);
    }
  }

  // Strategy 2: Use row text context + target element
  // E.g., 'tr >> has-text="Activity Code" >> button.select'
  if (rowId) {
    const targetSelector = buildSimpleSelector(element);
    if (targetSelector) {
      candidates.push([
        { engine: 'css', selector: 'tr', score: kTableRowContextScore },
        { engine: 'internal:has-text', selector: escapeForTextSelector(rowId, false), score: kTableRowTextContextScore },
        { engine: 'css', selector: targetSelector, score: kCSSTagNameScore }
      ]);
    }
  }

  return candidates;
}

function buildSimpleSelector(element: Element): string | null {
  // Build a simple single-level selector for an element (no nth, no parent navigation).
  // Used for combining with row context selectors.
  if (element.id && !isGuidLike(element.id))
    return `#${element.id}`;
  
  const classes = [...element.classList].filter(c => !c.startsWith('v-') && c.length > 1);
  if (classes.length) {
    const classSelector = '.' + classes.slice(0, 2).join('.');
    return classSelector;
  }

  // If there are only v-* classes, still pick meaningful non-generic ones.
  const specificVClasses = [...element.classList].filter(c =>
    c.startsWith('v-')
    && c !== 'v-widget'
    && c !== 'v-nativebutton'
    && c !== 'v-disabled'
    && c !== 'v-has-width'
  );
  if (specificVClasses.length)
    return `${escapeNodeName(element)}.${specificVClasses.slice(0, 2).join('.')}`;

  // Vaadin tree table twistee uses only v-* classes, keep the stable class for better locators.
  if (element.classList.contains('v-treetable-treespacer'))
    return 'span.v-treetable-treespacer';
  
  const tag = escapeNodeName(element);
  if (element.nodeName === 'BUTTON' || element.nodeName === 'A' || element.nodeName === 'INPUT')
    return tag;
  
  return null;
}

function buildMenubarContextCandidates(injectedScript: InjectedScript, element: Element): SelectorToken[][] {
  const candidates: SelectorToken[][] = [];

  const menuItem = element.closest('.v-menubar-menuitem');
  if (!menuItem)
    return candidates;

  // Skip context-based candidates for items in popup submenus.
  // Popup submenu items should use simple text-based selectors instead.
  if (menuItem.closest('.v-menubar-popup'))
    return candidates;

  const menuText = extractMenubarText(injectedScript, menuItem);
  if (!menuText)
    return candidates;

  const targetSelector = buildMenubarTargetSelector(element);
  if (!targetSelector)
    return candidates;

  const classes = [...menuItem.classList].filter(c => c.startsWith('v-menubar-menuitem'));
  const parentSelector = classes.length ? `${escapeNodeName(menuItem)}.${classes.slice(0, 2).join('.')}` : '.v-menubar-menuitem';

  candidates.push([
    { engine: 'css', selector: parentSelector, score: kMenubarContextScore },
    { engine: 'internal:has-text', selector: escapeForTextSelector(menuText, false), score: kMenubarTextContextScore },
    { engine: 'css', selector: targetSelector, score: kMenubarTargetScore }
  ]);

  return candidates;
}

function extractMenubarText(injectedScript: InjectedScript, menuItem: Element): string | null {
  const rawText = elementText(injectedScript._evaluator._cacheText, menuItem).normalized;
  if (!rawText)
    return null;

  const cleaned = rawText.replace(/[^\p{L}\p{N}\s_-]+/gu, ' ').trim().replace(/\s+/g, ' ');
  if (cleaned.length >= 2)
    return trimWordBoundary(cleaned, 40);

  return null;
}

function buildMenubarTargetSelector(element: Element): string | null {
  if (element.classList.contains('v-menubar-submenu-indicator'))
    return 'span.v-menubar-submenu-indicator';

  if (element.nodeName === 'IMG') {
    const src = element.getAttribute('src') || '';
    const last = src.split('/').pop() || '';
    const fileName = last.split('?')[0];
    const stem = fileName.replace(/\.[^.]+$/, '');
    if (stem && /^[a-zA-Z0-9_-]+$/.test(stem))
      return `img[src*=${quoteCSSAttributeValue(stem)}]`;
  }

  return buildSimpleSelector(element);
}

// ============ End Table Row Context ============
