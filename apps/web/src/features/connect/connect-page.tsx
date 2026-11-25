import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Panel, PanelBody } from '@/components/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { meQuery } from '@/lib/query'
import { ConnectLanes } from './connect-lanes'
import { type ConnectInfo, connectQuery } from './connect-query'

// Poll until the hub has seen both this member's clone and their agent.
const allSeen = (d: ConnectInfo | undefined) =>
  d !== undefined && d.clones.length > 0 && d.agentSeenAt !== null

export function ConnectPage({ slug }: { slug: string }) {
  const info = useQuery({
    ...connectQuery(slug, false),
    refetchInterval: (q) => (allSeen(q.state.data) ? false : 3000),
  })
  const name = useQuery(meQuery).data?.projects.find((p) => p.slug === slug)?.name ?? slug

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
      <PageHeader
        title={`Connect ${name}`}
        description="Link your clone and your agent to the hub. The repository is set up once, by one person."
      />
      {info.isPending ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : info.error ? (
        <Panel role="alert">
          <PanelBody>
            <EmptyState icon={AlertTriangle} title="Could not load">
              {info.error.message}
            </EmptyState>
          </PanelBody>
        </Panel>
      ) : (
        <ConnectLanes info={info.data} />
      )}
    </div>
  )
}
