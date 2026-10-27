import type { ShownDoc, ShownVersion } from '@spec-hub/server/board-query'
import { FileText, FileX, GitBranch, ListChecks, MapIcon, Network } from 'lucide-react'
import type { ReactNode } from 'react'
import { Document } from '@/components/document'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const FEATURE_TABS = ['spec', 'plan', 'tasks', 'versions', 'dependencies'] as const
export type FeatureTab = (typeof FEATURE_TABS)[number]

const DOC_TABS = ['spec', 'plan', 'tasks'] as const

function DocBody({ name, doc }: { name: string; doc: ShownDoc | null }) {
  if (!doc) return <Note>This branch has no {name}.md yet.</Note>
  if (doc.tooLarge) {
    return <Note>Too large to display ({doc.size} bytes). Read it in the repository.</Note>
  }
  if (doc.unreadable || doc.content === null) {
    return <Note>Not valid UTF-8; read it in the repository.</Note>
  }
  return <Document markdown={doc.content} />
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
      <FileX aria-hidden className="size-5" />
      <p>{children}</p>
    </div>
  )
}

const ICONS: Record<FeatureTab, ReactNode> = {
  spec: <FileText />,
  plan: <MapIcon />,
  tasks: <ListChecks />,
  versions: <GitBranch />,
  dependencies: <Network />,
}

export function DocumentTabs({
  shown,
  tab,
  onTabChange,
  versions,
  dependencies,
}: {
  shown: ShownVersion | null
  tab: FeatureTab
  onTabChange: (tab: FeatureTab) => void
  versions?: ReactNode
  dependencies?: ReactNode
}) {
  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v as FeatureTab)} className="gap-4">
      <div className="overflow-x-auto border-b">
        <TabsList variant="line" className="h-10">
          {FEATURE_TABS.map((t) => (
            <TabsTrigger key={t} value={t} className="flex-none px-3 capitalize">
              {ICONS[t]}
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {DOC_TABS.map((name) => (
        <TabsContent key={name} value={name}>
          <div className="rounded-xl border bg-card px-5 py-4 shadow-xs md:px-8 md:py-6">
            <DocBody name={name} doc={shown?.docs[name] ?? null} />
          </div>
        </TabsContent>
      ))}
      <TabsContent value="versions">{versions}</TabsContent>
      <TabsContent value="dependencies">{dependencies}</TabsContent>
    </Tabs>
  )
}
