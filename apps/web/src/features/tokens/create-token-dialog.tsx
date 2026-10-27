import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { CopyBlock } from '@/components/copy-block'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { json } from '@/lib/api'

type Created = { id: string; name: string; key: string }

export function CreateTokenDialog({
  onCreated,
  triggerLabel = 'Create token',
  variant = 'default',
}: {
  onCreated?: (key: string) => void
  triggerLabel?: string
  variant?: 'default' | 'outline'
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [key, setKey] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: async (tokenName: string) =>
      json<Created>(
        await fetch('/api/tokens', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: tokenName }),
        }),
      ),
    onSuccess: (created) => {
      setKey(created.key)
      onCreated?.(created.key)
      void queryClient.invalidateQueries({ queryKey: ['tokens'] })
    },
  })

  function reset(next: boolean) {
    setOpen(next)
    if (!next) {
      setName('')
      setKey(null)
      create.reset()
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) create.mutate(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (key && !next ? undefined : reset(next))}>
      <DialogTrigger asChild>
        <Button variant={variant}>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!key}>
        {key ? (
          <>
            <DialogHeader>
              <DialogTitle>Token created</DialogTitle>
              <DialogDescription>Copy it now and paste it where it is needed.</DialogDescription>
            </DialogHeader>
            <CopyBlock value={key} secret />
            <DialogFooter>
              <Button onClick={() => reset(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Create token</DialogTitle>
              <DialogDescription>Name it after the machine or agent that will use it.</DialogDescription>
            </DialogHeader>
            <Input
              aria-label="Token name"
              value={name}
              maxLength={32}
              placeholder="e.g. work laptop"
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {create.error ? <p className="text-sm text-destructive">{create.error.message}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={!name.trim() || create.isPending}>
                Create
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
