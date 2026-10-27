import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Document } from '@/components/document'

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
