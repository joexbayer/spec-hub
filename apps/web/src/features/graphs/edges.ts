import { type Edge, MarkerType } from '@xyflow/react'

export function styleDependencyEdge({
  blocking,
  critical,
  inCycle,
}: {
  blocking?: boolean
  critical?: boolean
  inCycle?: boolean
}): Partial<Edge> {
  const color = blocking
    ? 'var(--color-state-blocked)'
    : critical
      ? 'var(--color-foreground)'
      : 'var(--color-muted-foreground)'
  return {
    type: 'default',
    animated: !!critical,
    label: inCycle ? 'cycle' : undefined,
    markerEnd: { type: MarkerType.ArrowClosed, color },
    style: {
      stroke: color,
      strokeWidth: critical ? 2.5 : 1.25,
      strokeOpacity: blocking || critical ? 1 : 0.55,
      strokeDasharray: blocking ? '6 4' : undefined,
    },
  }
}
