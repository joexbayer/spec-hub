import type { ShownDoc, ShownVersion } from '@spec-hub/server/board-query'
import { FileText, FileX, GitBranch, ListChecks, MapIcon, Network } from 'lucide-react'
import type { ReactNode } from 'react'
import { Document } from '@/components/document'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const FEATURE_TABS = ['spec', 'plan', 'tasks', 'versions', 'dependencies'] as const
type FixedTab = (typeof FEATURE_TABS)[number]
/** A fixed tab, or the name of an extra document without `.md`. */
export type FeatureTab = string

const DOC_TABS = ['spec', 'plan', 'tasks'] as const

function DocBody({ name, doc, slug }: { name: string; doc: ShownDoc | null; slug: string }) {
  if (!doc) return <Note>This branch has no {name}.md yet.</Note>
  if (doc.tooLarge) {
    return <Note>Too large to display ({doc.size} bytes). Read it in the repository.</Note>
  }
  if (doc.unreadable || doc.content === null) {
    return <Note>Not valid UTF-8; read it in the repository.</Note>
  }
  return <Document markdown={doc.content} slug={slug} />
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
      <FileX aria-hidden className="size-5" />
      <p>{children}</p>
    </div>
  )
}

const ICONS: Record<FixedTab, ReactNode> = {
  spec: <FileText />,
  plan: <MapIcon />,
  tasks: <ListChecks />,
  versions: <GitBranch />,
  dependencies: <Network />,
}

export function DocumentTabs({
  slug,
  shown,
  tab,
  onTabChange,
  versions,
  dependencies,
}: {
  slug: string
  shown: ShownVersion | null
  tab: FeatureTab
  onTabChange: (tab: FeatureTab) => void
  versions?: ReactNode
  dependencies?: ReactNode
}) {
  const extra = shown?.extra ?? []
  const extraTabs = extra.map((e) => ({ ...e, tab: e.name.replace(/\.md$/, '') }))
  const fixed = (t: FixedTab) => (
    <TabsTrigger key={t} value={t} className="flex-none px-3 capitalize">
      {ICONS[t]}
      {t}
    </TabsTrigger>
  )
  // a ?tab= naming an extra document this version lacks falls back to spec
  const available = [...FEATURE_TABS, ...extraTabs.map((e) => e.tab)]
  const current = available.includes(tab) ? tab : 'spec'
  return (
    <Tabs value={current} onValueChange={onTabChange} className="gap-4">
      <div className="overflow-x-auto border-b">
        <TabsList variant="line" className="h-10">
          {DOC_TABS.map(fixed)}
          {extraTabs.map((e) => (
            <TabsTrigger key={e.tab} value={e.tab} className="flex-none px-3">
              <FileText />
              {e.tab}
            </TabsTrigger>
          ))}
          {fixed('versions')}
          {fixed('dependencies')}
        </TabsList>
      </div>
      {DOC_TABS.map((name) => (
        <TabsContent key={name} value={name}>
          <div className="rounded-xl border bg-card px-5 py-4 shadow-xs md:px-8 md:py-6">
            <DocBody name={name} doc={shown?.docs[name] ?? null} slug={slug} />
          </div>
        </TabsContent>
      ))}
      {extraTabs.map((e) => (
        <TabsContent key={e.tab} value={e.tab}>
          <div className="rounded-xl border bg-card px-5 py-4 shadow-xs md:px-8 md:py-6">
            <DocBody name={e.tab} doc={e.doc} slug={slug} />
          </div>
        </TabsContent>
      ))}
      <TabsContent value="versions">{versions}</TabsContent>
      <TabsContent value="dependencies">{dependencies}</TabsContent>
    </Tabs>
  )
}
