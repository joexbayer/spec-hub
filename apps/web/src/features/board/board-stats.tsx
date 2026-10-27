import { type Board, buildDependencyGraph, PHASE_ORDER } from '@spec-hub/core'
import { AlertTriangle, CloudOff, HelpCircle, Layers, ListChecks, Lock } from 'lucide-react'
import { Bar, BarChart, XAxis, YAxis } from 'recharts'
import { isNotPushed } from '@/components/feature-card'
import { PHASE_DOT } from '@/components/phase-badge'
import { StatStrip, StatTile } from '@/components/stat-strip'
import { type ChartConfig, ChartContainer } from '@/components/ui/chart'
import { cn } from '@/lib/utils'

export function BoardStats({ board }: { board: Board }) {
  const { inFlight } = board
  const impl = inFlight.filter((e) => e.phase.kind === 'implement' || e.phase.kind === 'implemented')
  const done = impl.reduce(
    (n, e) =>
      n + (e.phase.kind === 'implement' ? e.phase.done : e.phase.kind === 'implemented' ? e.phase.total : 0),
    0,
  )
  const total = impl.reduce(
    (n, e) => n + (e.phase.kind === 'implement' || e.phase.kind === 'implemented' ? e.phase.total : 0),
    0,
  )
  const implementing = inFlight.filter((e) => e.phase.kind === 'implement').length
  const unclear = inFlight.filter((e) => e.openClarifications > 0)
  const questions = unclear.reduce((n, e) => n + e.openClarifications, 0)
  const notPushed = inFlight.filter(isNotPushed).length
  const blocked = buildDependencyGraph(board).blocked.size
  const collisions = inFlight.filter((e) => e.collisions.length > 0).length
  return (
    <StatStrip className="md:grid-cols-3 xl:grid-cols-6" footer={<PhaseBar board={board} />}>
      <StatTile
        label="In flight"
        icon={<Layers />}
        value={inFlight.length}
        caption={`${implementing} of ${inFlight.length} implementing`}
      />
      <StatTile
        label="Implementing"
        icon={<ListChecks />}
        value={`${done}/${total}`}
        caption={total ? `${Math.round((done / total) * 100)}% of tasks done` : 'No tasks yet'}
      />
      <StatTile
        label="Needs clarification"
        icon={<HelpCircle className={cn(unclear.length > 0 && 'text-phase-clarify')} />}
        value={unclear.length}
        caption={
          questions ? `${questions} open ${questions === 1 ? 'question' : 'questions'}` : 'No open questions'
        }
      />
      <StatTile
        label="Not pushed"
        icon={<CloudOff />}
        value={notPushed}
        caption={notPushed ? 'Only on local branches' : 'Everything is pushed'}
      />
      <StatTile
        label="Blocked"
        icon={<Lock className={cn(blocked > 0 && 'text-state-blocked')} />}
        value={blocked}
        caption={blocked ? 'Waiting on a dependency' : 'Nothing is blocked'}
      />
      <StatTile
        label="Collisions"
        icon={<AlertTriangle className={cn(collisions > 0 && 'text-state-collision')} />}
        value={collisions}
        caption={collisions ? 'Numbers used twice' : 'Every number is unique'}
      />
    </StatStrip>
  )
}

const KINDS = PHASE_ORDER

const config = Object.fromEntries(
  KINDS.map((k) => [k, { label: `${k[0]?.toUpperCase()}${k.slice(1)}`, color: `var(--phase-${k})` }]),
) as ChartConfig

function PhaseBar({ board }: { board: Board }) {
  const counts = Object.fromEntries(
    KINDS.map((k) => [k, board.inFlight.filter((e) => e.phase.kind === k).length]),
  )
  if (board.inFlight.length === 0) return null
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
      <span className="shrink-0 font-medium text-foreground">By phase</span>
      <div role="img" aria-label="In-flight features per phase" className="min-w-0 flex-1">
        <ChartContainer config={config} className="aspect-auto h-2 w-full overflow-hidden rounded-full">
          <BarChart data={[counts]} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <XAxis type="number" hide domain={[0, board.inFlight.length]} />
            <YAxis type="category" hide />
            {KINDS.map((k) => (
              <Bar key={k} dataKey={k} stackId="phase" fill={`var(--color-${k})`} isAnimationActive={false} />
            ))}
          </BarChart>
        </ChartContainer>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {KINDS.map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-2 rounded-full ${PHASE_DOT[k]}`} />
            {config[k]?.label}
            <span className="tabular-nums text-foreground">{counts[k]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
