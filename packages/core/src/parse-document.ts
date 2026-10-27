import type { Paragraph, PhrasingContent } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { toString as nodeText } from 'mdast-util-to-string'
import { gfm } from 'micromark-extension-gfm'
import { visit } from 'unist-util-visit'

/** Content-only facts about one document; independent of where the document lives. */
export interface DocumentFacts {
  title: string | null
  ownerHandle: string | null
  dependsOn: string[]
  openClarifications: number
  tasksDone: number
  tasksTotal: number
}

// Any member can upload a document, so parsing must stay linear on adversarial input: the body is
// read by a line scanner, and mdast (superlinear on nested containers and emphasis) only ever sees
// the header region, one container-free block of at most BLOCK_MAX characters at a time.
const HEADER_MAX = 16 * 1024
const BLOCK_MAX = 4 * 1024

const CLARIFICATION_MARKER = '[NEEDS CLARIFICATION:'
// Task ids may be bold (`**T044 …**`, as some task lists write them).
// Built once: constructing the gfm extensions per header block dominated hostile-input timings.
const PARSE_OPTIONS = { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }

const TASK = /^\s*[-*+] \[( |x|X)\] (?:\*\*)?T\d+[a-z]?\b/
const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})(.*)$/
const FENCE_CLOSE = /^[ \t]*(`+|~+)[ \t]*$/
const SECTION = /^ {0,3}##(?:[ \t]|$)/
const HEADING = /^#{1,6}(?:[ \t]|$)/
// Indentation, block quote markers and list bullets in front of a line's content.
const CONTAINER = /^(?:[ \t>]|[-*+](?=[ \t]|$)|\d{1,9}[.)](?=[ \t]|$))*/
const OWNER_VALUE = /^:\s*@?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/
// biome-ignore lint/suspicious/noControlCharactersInRegex: directory names must not contain control characters
const FEATURE_DIR = /^[^/\u0000-\u001f]{1,255}$/
const MAX_DEPENDENCIES = 50
// Relative links are resolved as if the document were specs/_self_/spec.md.
const SELF_DIR = '_self_'
const SELF_BASE = `file:///specs/${SELF_DIR}/spec.md`
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

export function parseDocument(text: string): DocumentFacts {
  const prose = proseLines(text)
  return {
    ...readHeader(headerRegion(prose)),
    openClarifications: countClarifications(prose),
    ...countTasks(prose),
  }
}

/** Each line of the document, or null for lines inside (or delimiting) a fenced code block. */
function proseLines(text: string): (string | null)[] {
  const out: (string | null)[] = []
  let fence: { char: string; length: number } | null = null
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (fence) {
      const close = FENCE_CLOSE.exec(line)?.[1]
      if (close && close[0] === fence.char && close.length >= fence.length) fence = null
      out.push(null)
      continue
    }
    const open = FENCE_OPEN.exec(line)
    const marker = open?.[1]
    if (marker && !(marker[0] === '`' && open[2]?.includes('`'))) {
      fence = { char: marker[0] as string, length: marker.length }
      out.push(null)
      continue
    }
    out.push(line)
  }
  return out
}

/** The lines before the first `## ` heading, at most HEADER_MAX characters in total. */
function headerRegion(prose: (string | null)[]): (string | null)[] {
  const out: (string | null)[] = []
  let size = 0
  for (const line of prose) {
    if (line !== null && SECTION.test(line)) break
    const length = (line?.length ?? 0) + 1
    if (size + length > HEADER_MAX) {
      if (line !== null) out.push(line.slice(0, HEADER_MAX - size))
      break
    }
    size += length
    out.push(line)
  }
  return out
}

function countTasks(prose: (string | null)[]): { tasksDone: number; tasksTotal: number } {
  let tasksDone = 0
  let tasksTotal = 0
  for (const line of prose) {
    const box = line === null ? undefined : TASK.exec(line)?.[1]
    if (box === undefined) continue
    tasksTotal++
    if (box !== ' ') tasksDone++
  }
  return { tasksDone, tasksTotal }
}

/** Markers in prose, per blank-line-separated chunk, outside code; a marker may wrap across lines. */
function countClarifications(prose: (string | null)[]): number {
  let count = 0
  let chunk: string[] = []
  const flush = () => {
    if (chunk.length === 0) return
    const flat = stripCodeSpans(chunk.join('\n')).replace(/\s+/g, ' ')
    count += flat.split(CLARIFICATION_MARKER).length - 1
    chunk = []
  }
  for (const line of prose) {
    if (line === null || line.trim() === '') flush()
    else chunk.push(line)
  }
  flush()
  return count
}

/** Replaces code spans with a space; a backtick run closes at the next run of the same length. */
function stripCodeSpans(s: string): string {
  const runs = [...s.matchAll(/`+/g)].map((m) => ({
    at: m.index,
    end: m.index + m[0].length,
    length: m[0].length,
  }))
  const next = new Array<number>(runs.length).fill(-1)
  const lastByLength = new Map<number, number>()
  for (let i = runs.length - 1; i >= 0; i--) {
    const length = runs[i]?.length ?? 0
    next[i] = lastByLength.get(length) ?? -1
    lastByLength.set(length, i)
  }
  let out = ''
  let pos = 0
  for (let i = 0; i < runs.length; ) {
    const j = next[i] ?? -1
    const open = runs[i]
    const close = runs[j]
    if (!open || !close) {
      i++
      continue
    }
    out += `${s.slice(pos, open.at)} `
    pos = close.end
    i = j + 1
  }
  return out + s.slice(pos)
}

interface Block {
  text: string
  item: boolean // starts with a list bullet
}

/** Header lines with containers stripped, grouped into blocks at blank lines, bullets and headings. */
function headerBlocks(header: (string | null)[]): Block[] {
  const blocks: Block[] = []
  let current: { lines: string[]; item: boolean } | null = null
  const end = () => {
    if (current) blocks.push({ text: current.lines.join('\n').slice(0, BLOCK_MAX), item: current.item })
    current = null
  }
  for (const line of header) {
    if (line === null) {
      end()
      continue
    }
    const prefix = CONTAINER.exec(line)?.[0] ?? ''
    const content = line.slice(prefix.length).trimEnd()
    const item = /[^ \t>]/.test(prefix)
    if (content === '') {
      end()
    } else if (item || HEADING.test(content)) {
      end()
      current = { lines: [content], item }
      if (!item) end()
    } else if (current) {
      current.lines.push(content)
    } else {
      current = { lines: [content], item: false }
    }
  }
  end()
  return blocks
}

function readHeader(header: (string | null)[]): Pick<DocumentFacts, 'title' | 'ownerHandle' | 'dependsOn'> {
  let title: string | null | undefined
  let ownerHandle: string | null = null
  let dependsOn: string[] | null = null
  // A Depends on value continues over its paragraph's lines and over a bullet list right after it.
  let inDependsOn = false
  for (const block of headerBlocks(header)) {
    if (!block.item) inDependsOn = false
    const tree = fromMarkdown(block.text, PARSE_OPTIONS)
    for (const node of tree.children) {
      if (node.type === 'heading') {
        inDependsOn = false
        if (node.depth === 1 && title === undefined) {
          title =
            nodeText(node)
              .replace(/^\s*Feature Specification:/i, '')
              .trim() || null
        }
        continue
      }
      if (node.type !== 'paragraph') continue
      for (const line of splitLines(node)) {
        const label = headerLabel(line)
        if (label !== null) inDependsOn = false
        if (label === 'owner' && ownerHandle === null) {
          const match = OWNER_VALUE.exec(
            line
              .slice(1)
              .map((n) => nodeText(n))
              .join(''),
          )
          if (match?.[1]) ownerHandle = match[1].toLowerCase()
        } else if (label === 'depends on' && dependsOn === null) {
          dependsOn = []
          inDependsOn = true
        }
        if (inDependsOn && dependsOn) collectDependencies(line, dependsOn)
      }
    }
  }
  return { title: title ?? null, ownerHandle, dependsOn: dependsOn ?? [] }
}

/** Splits a paragraph's inline children into lines at soft (newline) and hard breaks. */
function splitLines(paragraph: Paragraph): PhrasingContent[][] {
  const lines: PhrasingContent[][] = [[]]
  const push = (node: PhrasingContent) => lines[lines.length - 1]?.push(node)
  for (const node of paragraph.children) {
    if (node.type === 'break') {
      lines.push([])
    } else if (node.type === 'text' && node.value.includes('\n')) {
      node.value.split('\n').forEach((value, i) => {
        if (i > 0) lines.push([])
        if (value) push({ type: 'text', value })
      })
    } else {
      push(node)
    }
  }
  return lines
}

/** The lowercased label if the line starts with a `strong` node, else null. */
function headerLabel(line: PhrasingContent[]): string | null {
  const first = line.find((node) => !(node.type === 'text' && node.value.trim() === ''))
  if (first?.type !== 'strong') return null
  return nodeText(first).trim().replace(/\s+/g, ' ').toLowerCase()
}

function collectDependencies(line: PhrasingContent[], into: string[]): void {
  for (const node of line) {
    visit(node, 'link', (link) => {
      const dir = featureDir(link.url)
      if (dir && into.length < MAX_DEPENDENCIES && !into.includes(dir)) into.push(dir)
    })
  }
}

/** The feature directory a link points to, or null for same-feature and non-feature links. */
function featureDir(href: string): string | null {
  let url: URL
  try {
    url = HAS_SCHEME.test(href) ? new URL(href) : new URL(href, SELF_BASE)
  } catch {
    return null
  }
  const at = url.pathname.lastIndexOf('/specs/')
  if (at < 0) return null
  const segment = url.pathname.slice(at + '/specs/'.length).split('/')[0]
  if (!segment) return null
  let dir: string
  try {
    dir = decodeURIComponent(segment)
  } catch {
    return null
  }
  if (dir === '.' || dir === '..' || dir === SELF_DIR || !FEATURE_DIR.test(dir)) return null
  return dir
}
