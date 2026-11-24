import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage, json, send } from '@/lib/api'

// Mark a feature done, or bring it back, for everyone on the project (spec 006).
export function useMarkDone(slug: string) {
  const qc = useQueryClient()
  const url = (dir: string) =>
    `/api/projects/${encodeURIComponent(slug)}/features/${encodeURIComponent(dir)}/done`
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['board', slug] }),
      qc.invalidateQueries({ queryKey: ['feature', slug] }),
    ])

  const undo = useMutation({
    mutationFn: async (dir: string) => {
      const res = await send('DELETE', url(dir))
      if (!res.ok) await json(res)
    },
    onSuccess: async (_data, dir) => {
      await refresh()
      toast(`${dir} is back on the board.`)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const mark = useMutation({
    mutationFn: async ({ dir }: { dir: string; title: string }) =>
      json<unknown>(await send('POST', url(dir))),
    onSuccess: async (_data, { dir, title }) => {
      await refresh()
      toast(`Marked ${title} as done.`, { action: { label: 'Undo', onClick: () => undo.mutate(dir) } })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  return { mark, undo }
}
