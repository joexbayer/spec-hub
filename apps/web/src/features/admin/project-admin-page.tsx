import { useQuery } from '@tanstack/react-query'
import { ScrollText, Settings, Users } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { meQuery } from '@/lib/query'
import { MembersTab } from './members-tab'
import { SecurityLogTab } from './security-log-tab'
import { SettingsTab } from './settings-tab'

export function ProjectAdminPage({ slug }: { slug: string }) {
  const name = useQuery(meQuery).data?.projects.find((p) => p.slug === slug)?.name ?? slug
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
      <PageHeader title="Project admin" description={`Members, the security log and settings for ${name}.`} />
      <Tabs defaultValue="members" className="gap-6">
        <div className="overflow-x-auto border-b">
          <TabsList variant="line" className="h-10">
            <TabsTrigger value="members" className="flex-none px-3">
              <Users /> Members
            </TabsTrigger>
            <TabsTrigger value="security" className="flex-none px-3">
              <ScrollText /> Security log
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex-none px-3">
              <Settings /> Settings
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="members">
          <MembersTab slug={slug} />
        </TabsContent>
        <TabsContent value="security">
          <SecurityLogTab slug={slug} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab slug={slug} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
