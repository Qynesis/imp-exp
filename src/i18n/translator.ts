/**
 * Shows the app in Bangla without touching the components. The screens are written in English;
 * this layer watches the page and swaps each piece of English text (and placeholder, aria-label
 * and title) for its Bangla form, keeping the English so switching back restores it exactly.
 *
 * Text that is data (names, amounts, invoice numbers) has no entry and stays as typed. Mark any
 * element with `data-no-translate` to leave its whole subtree alone.
 *
 * React keeps working because only the contents of existing text nodes change, never the nodes
 * themselves; when React writes new English into a node, the observer sees it and translates again.
 */
import { BN_PHRASES, BN_TOKENS, translateBn } from './bn'

const ATTRS = ['placeholder', 'aria-label', 'title'] as const
/** English as React wrote it, per text node or element attribute. */
const originalText = new WeakMap<Text, string>()
/** What we last wrote, to tell our own changes from React's. */
const writtenText = new WeakMap<Text, string>()
const originalAttr = new WeakMap<Element, Map<string, string>>()

let observer: MutationObserver | null = null

const skip = (el: Element | null): boolean => !!el?.closest('script, style, textarea, [contenteditable="true"], [data-no-translate]')

function doText(node: Text) {
  if (skip(node.parentElement)) return
  const current = node.data
  if (writtenText.get(node) !== current) originalText.set(node, current)
  const en = originalText.get(node) ?? current
  if (!/[A-Za-z]/.test(en)) return
  const bn = translateBn(en)
  if (bn !== current) {
    writtenText.set(node, bn)
    node.data = bn
  } else writtenText.set(node, current)
}

function doAttrs(el: Element) {
  if (skip(el)) return
  let saved = originalAttr.get(el)
  for (const a of ATTRS) {
    const v = el.getAttribute(a)
    if (v == null || !/[A-Za-z]/.test(v)) continue
    if (!saved) originalAttr.set(el, (saved = new Map()))
    // React wrote a new English value if it differs from our last translation of the saved one
    const prev = saved.get(a)
    if (prev === undefined || translateBn(prev) !== v) saved.set(a, v)
    const bn = translateBn(saved.get(a) as string)
    if (bn !== v) el.setAttribute(a, bn)
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root as Text)
  if (root.nodeType !== Node.ELEMENT_NODE) return
  const el = root as Element
  if (skip(el)) return
  doAttrs(el)
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text)
    else doAttrs(n as Element)
  }
}

/** Put every piece of English back. */
function restore(root: Node) {
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  for (let n: Node | null = root; n; n = tw.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n as Text
      const en = originalText.get(t)
      if (en !== undefined && writtenText.get(t) === t.data && en !== t.data) t.data = en
      writtenText.delete(t)
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const saved = originalAttr.get(n as Element)
      saved?.forEach((v, a) => (n as Element).setAttribute(a, v))
      originalAttr.delete(n as Element)
    }
  }
}

export function startTranslating(): void {
  if (observer) return
  walk(document.body)
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') doText(r.target as Text)
      else if (r.type === 'attributes') doAttrs(r.target as Element)
      else r.addedNodes.forEach(walk)
    }
  })
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] })
}

export function stopTranslating(): void {
  observer?.disconnect()
  observer = null
  restore(document.body)
}

/** For tests and the settings screen: how many phrases the dictionary knows. */
export const dictionarySize = (): number => Object.keys(BN_PHRASES).length + BN_TOKENS.length
