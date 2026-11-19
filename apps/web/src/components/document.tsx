import { specLink } from '@spec-hub/core'
import { Component, type ComponentProps, type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import Markdown, { type Components, type ExtraProps } from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

// Only relative URLs (no scheme), http: and https: survive.
function urlTransform(url: string): string {
  if (/^https?:/i.test(url)) return url
  if (/^[a-z][a-z0-9+.-]*:/i.test(url.trim())) return ''
  return url
}

const DOC_FILES: Record<string, 'spec' | 'plan' | 'tasks'> = {
  'spec.md': 'spec',
  'plan.md': 'plan',
  'tasks.md': 'tasks',
}

// A relative link in a spec is written for the repository (../099-x/spec.md). On the hub it
// becomes that feature's page, or a tab of this one; undefined when the hub has no page for it.
export function hubHref(href: string, slug: string): string | undefined {
  if (href.startsWith('#')) return href
  const target = specLink(href)
  if (!target) return /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : undefined
  const tab = DOC_FILES[target.file] ?? (target.file === '' ? 'spec' : undefined)
  if (target.dir === null) return tab ? `?tab=${tab}` : undefined
  const page = `/p/${encodeURIComponent(slug)}/f/${encodeURIComponent(target.dir)}`
  return tab && tab !== 'spec' ? `${page}?tab=${tab}` : page
}

function MermaidDiagram({ code }: { code: string }) {
  const id =
    'mmd-' +
    useId()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSvg(null)
    setFailed(false)
    ;(async () => {
      try {
        const { default: mermaid } = await import('mermaid')
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' })
        const out = await mermaid.render(id, code)
        if (!cancelled) setSvg(out.svg)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, id])

  if (failed || svg === null) {
    return <CodeBlock>{code}</CodeBlock>
  }
  // The single allowed dangerouslySetInnerHTML in the app (ui.md Security):
  // mermaid's SVG output, rendered with securityLevel 'strict'.
  // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid strict-mode SVG, the one allowed use (ui.md Security)
  return <div className="my-3 overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="my-3 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
      <code>{children}</code>
    </pre>
  )
}

function Anchor({ node: _n, className, href, ...p }: ComponentProps<'a'> & ExtraProps) {
  const external = !!href && /^https?:/i.test(href)
  return (
    <a
      {...p}
      href={href}
      rel="noopener noreferrer nofollow"
      target={external ? '_blank' : undefined}
      className={cn('text-primary underline underline-offset-2', className)}
    />
  )
}

const components: Components = {
  h1: ({ node: _n, className, ...p }) => (
    <h1 className={cn('mt-5 mb-2 text-xl font-semibold', className)} {...p} />
  ),
  h2: ({ node: _n, className, ...p }) => (
    <h2 className={cn('mt-4 mb-2 text-lg font-semibold', className)} {...p} />
  ),
  h3: ({ node: _n, className, ...p }) => (
    <h3 className={cn('mt-3 mb-1 text-base font-semibold', className)} {...p} />
  ),
  h4: ({ node: _n, className, ...p }) => (
    <h4 className={cn('mt-3 mb-1 text-sm font-semibold', className)} {...p} />
  ),
  p: ({ node: _n, className, ...p }) => (
    <p className={cn('my-2 text-sm leading-relaxed', className)} {...p} />
  ),
  ul: ({ node: _n, className, ...p }) => (
    <ul
      className={cn(
        'my-2 list-disc space-y-0.5 pl-5 text-sm',
        className?.includes('contains-task-list') && 'list-none pl-1',
        className,
      )}
      {...p}
    />
  ),
  ol: ({ node: _n, className, ...p }) => (
    <ol className={cn('my-2 list-decimal space-y-0.5 pl-5 text-sm', className)} {...p} />
  ),
  input: ({ node: _n, className, ...p }) => (
    <input {...p} disabled readOnly className={cn('mr-1.5 align-middle', className)} />
  ),
  table: ({ node: _n, className, ...p }) => (
    <div className="my-3 overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...p} />
    </div>
  ),
  th: ({ node: _n, className, ...p }) => (
    <th className={cn('border-b px-2 py-1 text-left font-medium', className)} {...p} />
  ),
  td: ({ node: _n, className, ...p }) => (
    <td className={cn('border-b px-2 py-1 align-top', className)} {...p} />
  ),
  a: Anchor,
  img: ({ alt }) => <span className="text-xs italic text-muted-foreground">[image: {alt}]</span>,
  pre: ({ children }) => <>{children}</>,
  code: ({ node: _n, className, children, ...p }) => {
    const text = String(children ?? '')
    const lang = /language-(\S+)/.exec(className ?? '')?.[1]
    if (lang === 'mermaid') return <MermaidDiagram code={text.replace(/\n$/, '')} />
    if (lang || text.includes('\n')) return <CodeBlock>{text.replace(/\n$/, '')}</CodeBlock>
    return (
      <code className={cn('rounded bg-muted px-1 py-0.5 font-mono text-xs', className)} {...p}>
        {children}
      </code>
    )
  },
}

// A document the Markdown parser can't handle (hostile nesting overflows its stack) shows as plain
// text instead of taking the page down.
class PlainOnError extends Component<{ text: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <>
        <p className="text-xs text-muted-foreground">
          This document could not be rendered; showing its text.
        </p>
        <CodeBlock>{this.props.text}</CodeBlock>
      </>
    )
  }
}

/** `slug` maps relative spec links to hub pages; without it they render as written. */
export function Document({ markdown, slug }: { markdown: string; slug?: string }) {
  const rendered = useMemo<Components>(() => {
    if (slug === undefined) return components
    return {
      ...components,
      a: ({ href, children, ...p }) => {
        const to = href === undefined ? undefined : hubHref(href, slug)
        if (to === undefined) return <span>{children}</span>
        return (
          <Anchor href={to} {...p}>
            {children}
          </Anchor>
        )
      },
    }
  }, [slug])
  return (
    <div className="max-w-none break-words">
      <PlainOnError key={markdown} text={markdown}>
        <Markdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
          urlTransform={urlTransform}
          components={rendered}
        >
          {markdown}
        </Markdown>
      </PlainOnError>
    </div>
  )
}
