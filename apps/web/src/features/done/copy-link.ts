import { toast } from 'sonner'

export function featureUrl(slug: string, dir: string): string {
  return `${window.location.origin}/p/${encodeURIComponent(slug)}/f/${encodeURIComponent(dir)}`
}

export async function copyLink(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url)
    toast('Link copied')
  } catch {
    toast.error('Could not copy the link')
  }
}
