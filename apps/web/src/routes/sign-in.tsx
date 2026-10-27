import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, LogIn } from 'lucide-react'
import { AuthFrame } from '@/components/auth-frame'
import { Button } from '@/components/ui/button'
import { signInWithGitHub } from '@/lib/auth-client'

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>): { error?: string } => ({
    error: search.error ? String(search.error) : undefined,
  }),
  component: SignIn,
})

function SignIn() {
  const { error } = Route.useSearch()
  return (
    <AuthFrame
      icon={<LogIn />}
      title="Sign in to Spec Hub"
      description="Use your GitHub account to continue."
    >
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Signing in with GitHub didn&apos;t complete. Try again.
            <span className="mt-0.5 block font-mono text-xs opacity-80">{error.slice(0, 64)}</span>
          </span>
        </p>
      )}
      <Button className="w-full" onClick={() => void signInWithGitHub()}>
        <LogIn /> Sign in with GitHub
      </Button>
    </AuthFrame>
  )
}
