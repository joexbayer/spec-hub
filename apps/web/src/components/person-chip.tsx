import type { Owner } from '@spec-hub/core'
import { formatDistanceToNow } from 'date-fns'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export function ownerName(owner: Owner): string {
  switch (owner.kind) {
    case 'member':
      return `@${owner.githubLogin}`
    case 'handle':
      return `@${owner.handle}`
    case 'git-name':
      return owner.name
    default:
      return 'unknown'
  }
}

export function initials(name: string): string {
  return name.replace(/^@/, '').slice(0, 2).toUpperCase() || '?'
}

export function OwnerAvatar({
  owner,
  size = 'sm',
  className,
}: {
  owner: Owner
  size?: 'sm' | 'default' | 'lg'
  className?: string
}) {
  return (
    <Avatar size={size} className={cn('border', className)}>
      {owner.kind === 'member' && owner.image ? <AvatarImage src={owner.image} alt="" /> : null}
      <AvatarFallback className="text-[10px] font-medium">{initials(ownerName(owner))}</AvatarFallback>
    </Avatar>
  )
}

export function PersonChip({
  owner,
  lastReportAt,
  className,
}: {
  owner: Owner
  lastReportAt?: number
  className?: string
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2 text-sm', className)}>
      <OwnerAvatar owner={owner} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate">{ownerName(owner)}</span>
        {lastReportAt !== undefined ? (
          <span className="truncate text-xs text-muted-foreground">
            reported {formatDistanceToNow(lastReportAt, { addSuffix: true })}
          </span>
        ) : null}
      </span>
    </span>
  )
}
