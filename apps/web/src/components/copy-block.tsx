import { Check, Copy, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function CopyBlock({ value, label, secret }: { value: string; label?: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="space-y-1.5">
      {label ? <div className="text-xs font-medium text-muted-foreground">{label}</div> : null}
      <div className="flex items-start gap-2 rounded-lg border bg-panel py-1.5 pr-1.5 pl-3 shadow-xs">
        <code className="min-w-0 flex-1 py-1 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {value}
        </code>
        <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 bg-card" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {secret ? (
        <p className="flex items-center gap-1.5 text-xs text-state-collision">
          <TriangleAlert aria-hidden className="size-3.5" />
          Shown once. Store it now; the hub can't show it again.
        </p>
      ) : null}
    </div>
  )
}
