import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Document, hubHref } from '@/components/document'

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: '<svg></svg>' })) },
}))

describe('Document (untrusted markdown)', () => {
  it('does not create script elements', () => {
    const { container } = render(<Document markdown={'<script>alert(1)</script>'} />)
    expect(container.querySelector('script')).toBeNull()
  })

  it('drops img with onerror', () => {
    const { container } = render(<Document markdown={'<img src=x onerror=alert(1)>'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[onerror]')).toBeNull()
  })

  it('neutralises javascript: links', () => {
    const { container } = render(<Document markdown={'[x](javascript:alert(1))'} />)
    const href = container.querySelector('a')?.getAttribute('href') ?? ''
    expect(href).not.toMatch(/javascript:/i)
  })

  it('replaces images with alt text', () => {
    const { container, getByText } = render(<Document markdown={'![logo](https://evil.example/t.png)'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(getByText('[image: logo]')).toBeTruthy()
  })

  it('keeps https links with safe rel and target', () => {
    const { container } = render(<Document markdown={'[docs](https://example.com)'} />)
    const a = container.querySelector('a')
    if (!a) throw new Error('no link rendered')
    expect(a.getAttribute('href')).toBe('https://example.com')
    expect(a.getAttribute('rel')).toContain('noopener')
    expect(a.getAttribute('target')).toBe('_blank')
  })

  it('renders task list checkboxes disabled', () => {
    const { container } = render(<Document markdown={'- [x] done\n- [ ] todo'} />)
    const boxes = container.querySelectorAll('input[type="checkbox"]')
    expect(boxes.length).toBe(2)
    for (const b of boxes) expect((b as HTMLInputElement).disabled).toBe(true)
  })

  it('does not throw on a mermaid fence', () => {
    expect(() => render(<Document markdown={'```mermaid\ngraph TD; A-->B\n```'} />)).not.toThrow()
  })
})

it('a document the parser cannot handle shows as plain text instead of breaking the page', () => {
  const hostile = '>'.repeat(20_000)
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { container } = render(<Document markdown={hostile} />)
  quiet.mockRestore()
  expect(container.textContent).toContain('could not be rendered')
  expect(container.querySelector('pre')?.textContent).toBe(hostile)
})

describe('Document links on the hub', () => {
  const hrefs = (markdown: string) => {
    const { container } = render(<Document markdown={markdown} slug="acme" />)
    return [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
  }

  it('turns spec links into hub pages and tabs', () => {
    expect(
      hrefs('[dep](../099-recon/spec.md) [p](../099-recon/plan.md) [own](tasks.md) [s](#goals)'),
    ).toEqual(['/p/acme/f/099-recon', '/p/acme/f/099-recon?tab=plan', '?tab=tasks', '#goals'])
  })

  it('keeps external links and shows links the hub has no page for as text', () => {
    const { container, getByText } = render(
      <Document markdown={'[gh](https://github.com/o/r) [doc](../../docs/x.md)'} slug="acme" />,
    )
    expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      'https://github.com/o/r',
    ])
    expect(getByText('doc').tagName).toBe('SPAN')
  })
})

describe('hubHref', () => {
  it('keeps the shown branch when switching tabs and drops blanked links', () => {
    expect(hubHref('plan.md', 'acme', '?branch=feat-b&tab=spec')).toBe('?branch=feat-b&tab=plan')
    expect(hubHref('../099-x/spec.md', 'acme', '?branch=feat-b')).toBe('/p/acme/f/099-x')
    expect(hubHref('', 'acme')).toBeUndefined()
  })
})
