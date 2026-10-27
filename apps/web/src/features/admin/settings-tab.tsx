import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { CopyBlock } from '@/components/copy-block'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getJson, send } from './http'
import { type SettingsForm, settingsSchema } from './schema'

type Settings = SettingsForm & { slug: string; createdAt: string }

export function SettingsTab({ slug }: { slug: string }) {
  const { data } = useQuery({
    queryKey: ['project', slug],
    queryFn: () => getJson<Settings>(`/api/projects/${slug}`),
  })
  if (!data) return null
  return <SettingsPanel slug={slug} current={data} />
}

function SettingsPanel({ slug, current }: { slug: string; current: SettingsForm }) {
  const queryClient = useQueryClient()
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: current.name,
      defaultBranch: current.defaultBranch,
      numbering: current.numbering,
    },
  })

  const submit = handleSubmit(async (values) => {
    const body = Object.fromEntries(
      Object.entries(values).filter(([k, v]) => v !== current[k as keyof SettingsForm]),
    )
    if (Object.keys(body).length === 0) {
      toast.success('No changes')
      return
    }
    const res = await send('PATCH', `/api/projects/${slug}`, body)
    if (res.ok) {
      toast.success('Settings saved')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project', slug] }),
        queryClient.invalidateQueries({ queryKey: ['me'] }),
      ])
      return
    }
    setError('root', {
      message: res.status === 422 ? 'Rejected: check the values' : `Failed (${res.status})`,
    })
  })

  const origin = window.location.origin
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Panel>
        <PanelHeader title="General" description="How the hub names and reads this project." />
        <PanelBody className="p-4">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="s-name">Name</Label>
              <Input id="s-name" {...register('name')} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-branch">Default branch</Label>
              <Input id="s-branch" {...register('defaultBranch')} />
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
                    <SelectTrigger className="w-full">
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
            <Button type="submit" disabled={isSubmitting}>
              Save
            </Button>
          </form>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Repository setup"
          description="What a repository needs to report to this project."
        />
        <PanelBody className="space-y-4 p-4">
          <CopyBlock label="spec-hub-config.yml" value={`hub_url: ${origin}\nproject: ${slug}`} />
          <CopyBlock
            label="Install the extension"
            value={`specify extension add spec-hub --from ${origin}/extension/spec-hub.zip`}
          />
        </PanelBody>
      </Panel>
    </div>
  )
}
