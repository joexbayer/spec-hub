import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ConnectInfo } from './connect-query'
import { SetupLane } from './setup-lane'
import { Troubleshooting } from './troubleshooting'
import { YourselfLane } from './yourself-lane'

type Lane = 'yourself' | 'setup'

// Mounted once the connect info has loaded: the lane is chosen from it once and never flips by itself.
export function ConnectLanes({ info }: { info: ConnectInfo }) {
  const [lane, setLane] = useState<Lane>(info.projectReported ? 'yourself' : 'setup')
  const [tokenKey, setTokenKey] = useState<string | null>(null)

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <Tabs value={lane} onValueChange={(v) => setLane(v as Lane)} className="min-w-0">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="yourself">Connect yourself</TabsTrigger>
          <TabsTrigger value="setup">Set up the repository</TabsTrigger>
        </TabsList>
        <TabsContent value="yourself">
          <YourselfLane
            mcpUrl={info.mcpUrl}
            clones={info.clones}
            agentSeenAt={info.agentSeenAt}
            tokenKey={tokenKey}
            onCreated={setTokenKey}
          />
        </TabsContent>
        <TabsContent value="setup">
          <SetupLane
            installCommand={info.installCommand}
            configSnippet={info.configSnippet}
            onConnectYourself={() => setLane('yourself')}
          />
        </TabsContent>
      </Tabs>
      <Troubleshooting mcpUrl={info.mcpUrl} />
    </div>
  )
}
