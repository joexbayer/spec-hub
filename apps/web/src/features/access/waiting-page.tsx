import { Hourglass, LogOut } from 'lucide-react'
import { AuthFrame } from '@/components/auth-frame'
import { Button } from '@/components/ui/button'

// FR-025: signed in, not a hub admin and in no project — the only page such a person sees.
export function WaitingPage({ login, onSignOut }: { login: string; onSignOut: () => void }) {
  return (
    <AuthFrame
      icon={<Hourglass />}
      title="Waiting for access"
      description={
        <>
          You&apos;re signed in, but not in any project yet. Give your GitHub login to an admin so they can
          add you.
        </>
      }
    >
      <p className="rounded-lg border bg-panel px-3 py-2.5 text-center font-mono text-lg">@{login}</p>
      <p className="text-sm text-muted-foreground">Once you&apos;re added, reload this page.</p>
      <Button variant="outline" className="w-full" onClick={onSignOut}>
        <LogOut /> Sign out
      </Button>
    </AuthFrame>
  )
}
