import { createHighlighterCore, type HighlighterCore, type ThemedToken } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { bundledLanguages } from 'shiki/langs'

// Loaded on demand by document.tsx (dynamic import), so Shiki stays out of the main bundle; each
// language's grammar is its own chunk, fetched the first time a fence uses it. The JavaScript regex
// engine avoids WebAssembly (no CSP change).
let highlighter: Promise<HighlighterCore> | undefined

/** Tokens with `--shiki-light`/`--shiki-dark` colours, or null for a language Shiki doesn't know. */
export async function tokenize(code: string, lang: string): Promise<ThemedToken[][] | null> {
  const name = lang.toLowerCase()
  const grammar = bundledLanguages[name as keyof typeof bundledLanguages]
  if (!grammar) return null
  highlighter ??= createHighlighterCore({
    themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  })
  const h = await highlighter
  await h.loadLanguage(grammar)
  return h.codeToTokens(code, {
    lang: name,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
    // Minified or generated lines stay plain instead of stalling the tab.
    tokenizeMaxLineLength: 2000,
  }).tokens
}
