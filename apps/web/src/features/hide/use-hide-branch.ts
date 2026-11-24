import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage, json, send } from '@/lib/api'

// Hide or show a leftover branch for everyone on the project (spec 006).
export function useHideBranch(slug: string) {
  const qc = useQueryClient()
  const base = `/api/projects/${encodeURIComponent(slug)}/hidden-branches`
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['board', slug] }),
      qc.invalidateQueries({ queryKey: ['feature', slug] }),
    ])

  const show = useMutation({
    mutationFn: async (branch: string) => {
      const res = await send('DELETE', `${base}?branch=${encodeURIComponent(branch)}`)
      if (!res.ok) await json(res)
    },
    onSuccess: async (_data, branch) => {
      await refresh()
      toast(`${branch} shows again.`)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const hide = useMutation({
    mutationFn: async (branch: string) => json<unknown>(await send('POST', base, { branch })),
    onSuccess: async (_data, branch) => {
      await refresh()
      toast(`Hid ${branch} for everyone.`, { action: { label: 'Undo', onClick: () => show.mutate(branch) } })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  return { hide, show }
}
