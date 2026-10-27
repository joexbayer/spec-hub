import type { ReactNode } from 'react'

// The centered frame for pages outside the app shell: sign-in and waiting for access.
export function AuthFrame({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode
  title: string
  description: ReactNode
  children: ReactNode
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-panel p-6">
      <div className="mb-6 flex items-center gap-2 text-sm font-medium">
        <span
          aria-hidden
          className="grid size-7 place-items-center rounded-lg bg-primary text-[11px] font-semibold text-primary-foreground"
        >
          SH
        </span>
        Spec Hub
      </div>
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-5 space-y-3">
          <span className="grid size-10 place-items-center rounded-lg border bg-panel text-muted-foreground shadow-xs [&_svg]:size-5">
            {icon}
          </span>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">See what your Spec Kit team is working on.</p>
    </main>
  )
}
