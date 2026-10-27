// Compact relative time for dense tables: "now", "5m ago", "3h ago", "2d ago", "6w ago".
export function shortAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return 'now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d < 14 ? `${d}d ago` : `${Math.floor(d / 7)}w ago`
}
