import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { send } from './http'
import { type ProjectForm, projectFormSchema } from './schema'

export function CreateProjectDialog({ onCreated }: { onCreated: (slug: string) => void }) {
  const [open, setOpen] = useState(false)
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProjectForm>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { slug: '', name: '', defaultBranch: 'main', numbering: 'sequential' },
  })

  const submit = handleSubmit(async (values) => {
    const res = await send('POST', '/api/projects', values)
    if (res.status === 201) {
      setOpen(false)
      onCreated(values.slug)
      return
    }
    if (res.status === 409) {
      setError('slug', { message: 'That slug is taken' })
      return
    }
    if (res.status === 422) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null
      setError('root', { message: `Rejected: ${JSON.stringify(body?.error ?? body)}` })
      return
    }
    setError('root', { message: `Failed (${res.status})` })
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Create project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>You become its first admin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cp-slug">Slug</Label>
            <Input id="cp-slug" autoComplete="off" {...register('slug')} />
            {errors.slug && <p className="text-sm text-destructive">{errors.slug.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-name">Name</Label>
            <Input id="cp-name" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-branch">Default branch</Label>
            <Input id="cp-branch" {...register('defaultBranch')} />
            {errors.defaultBranch && (
              <p className="text-sm text-destructive">{errors.defaultBranch.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Numbering</Label>
            <Controller
              control={control}
              name="numbering"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequential">Sequential</SelectItem>
                    <SelectItem value="timestamp">Timestamp</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
