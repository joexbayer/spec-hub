import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDocument } from '../src/parse-document.ts'

const fence = '```'

const aiGatewayHeader = `# Feature Specification: A ledger that grows with leases, not requests, and forgets nothing it folds

**Feature Branch**: \`105-ledger-per-lease-settlement\`

**Owner**: @joexbayer

**Created**: 2026-10-19

**Status**: Approved — self-approved by @joexbayer 2026-10-20: owner approved User Story 8

**Input**: Owner, 2026-10-19: see [\`docs/research/ledger-redesign-2026-10-19.md\`](../../docs/research/ledger-redesign-2026-10-19.md) and [\`bench/\`](bench/README.md).

**Depends on**: [SPEC-099](../099-incremental-reconciliation/spec.md) for its watermark fold and reconciliation accumulators
`

const wrappedDependsOn = `**Depends on**: [SPEC-001](../001-provider-port-streaming/spec.md) for the relay request path whose
consumption it records; [SPEC-002](../002-bundle-envelope-loader/spec.md) for the bundle's price
`

describe('parseDocument', () => {
  it("reads this repository's own spec", () => {
    const text = readFileSync(new URL('../../../specs/001-team-board/spec.md', import.meta.url), 'utf8')
    const facts = parseDocument(text)
    expect(facts.openClarifications).toBe(0)
    expect(facts.title).toBe('Team board — see what everyone is working on')
  })

  it('reads a header block with bold fields and an approval line', () => {
    const facts = parseDocument(aiGatewayHeader)
    expect(facts.title).toBe('A ledger that grows with leases, not requests, and forgets nothing it folds')
    expect(facts.ownerHandle).toBe('joexbayer')
    expect(facts.dependsOn).toEqual(['099-incremental-reconciliation'])
  })

  it('follows a Depends on header wrapped over several lines', () => {
    expect(parseDocument(wrappedDependsOn).dependsOn).toEqual([
      '001-provider-port-streaming',
      '002-bundle-envelope-loader',
    ])
  })

  it('reads headers that are lines of one multi-line paragraph', () => {
    const facts = parseDocument(
      '**Created**: today\n**Owner**: Joe-Bayer\n**Depends on**: [a](../010-a/spec.md) and\n[b](../011-b)\n**Status**: [c](../012-c/spec.md)',
    )
    expect(facts.ownerHandle).toBe('joe-bayer')
    expect(facts.dependsOn).toEqual(['010-a', '011-b'])
  })

  it('counts only links in the Depends on header that point to another feature', () => {
    expect(parseDocument('**Depends on**: none').dependsOn).toEqual([])
    expect(parseDocument('**Depends on**: the hotfix landed on main at 53cba2ab').dependsOn).toEqual([])
    expect(parseDocument('**Depends on**: none\n\nSee [x](../099-x/spec.md) for context.').dependsOn).toEqual(
      [],
    )
    expect(parseDocument('**Depends on**: [plan](./plan.md)').dependsOn).toEqual([])
    expect(
      parseDocument('**Depends on**: [docs](../../docs/x.md) and [bench](bench/README.md)').dependsOn,
    ).toEqual([])
    expect(
      parseDocument(
        '**Depends on**: [foo](https://github.com/o/r/blob/main/specs/042-foo/spec.md), [bar](/specs/043-bar/), [again](../042-foo/plan.md), [up](./../044-baz), [enc](../045%20sp/spec.md)',
      ).dependsOn,
    ).toEqual(['042-foo', '043-bar', '044-baz', '045 sp'])
  })

  it('caps dependencies at 50', () => {
    const links = Array.from({ length: 60 }, (_, i) => `[d](../${i}-d/spec.md)`).join(' ')
    expect(parseDocument(`**Depends on**: ${links}`).dependsOn).toHaveLength(50)
  })

  it('counts Spec Kit tasks only', () => {
    const facts = parseDocument(
      [
        '- [x] T001 a',
        '- [ ] T002 b',
        '  - [x] T003 c',
        '- [x] not a task',
        '- T004 no checkbox',
        '',
        fence,
        '- [x] T009 x',
        fence,
      ].join('\n'),
    )
    expect(facts.tasksDone).toBe(2)
    expect(facts.tasksTotal).toBe(3)
  })

  it('counts clarification markers in prose only', () => {
    const facts = parseDocument(
      [
        'Is it [NEEDS CLARIFICATION: which one?] or [NEEDS CLARIFICATION: the other?]',
        '',
        'Mentioned as `[NEEDS CLARIFICATION: inline]` only.',
        '',
        fence,
        '[NEEDS CLARIFICATION: fenced]',
        fence,
      ].join('\n'),
    )
    expect(facts.openClarifications).toBe(2)
  })

  it('reads the title from the first H1', () => {
    expect(parseDocument('## Not a title\n\ntext').title).toBeNull()
    expect(parseDocument('# Feature Specification: X\n\n# Y').title).toBe('X')
    expect(parseDocument('# feature specification:   ').title).toBeNull()
    expect(parseDocument('# Plain *title*').title).toBe('Plain title')
  })

  it('reads Owner and Depends on from the header only', () => {
    const facts = parseDocument(
      '# T\n\n**Owner**: @alice\n\n## Key Entities\n\n- **Owner**: @the person who\n\n**Depends on**: [x](../099-x/spec.md)\n',
    )
    expect(facts.ownerHandle).toBe('alice')
    expect(facts.dependsOn).toEqual([])
    expect(parseDocument('# T\n\n## Key Entities\n\n- **Owner**: @the person').ownerHandle).toBeNull()
  })

  it('collects a list-form Depends on up to the next label or heading', () => {
    const facts = parseDocument(
      [
        '**Input**: x',
        '- [not](../001-not/spec.md)',
        '',
        '**Depends on**:',
        '- [SPEC-011](../011-a/spec.md): the',
        '  last-administrator guard, and [SPEC-012](../012-b/spec.md)',
        '',
        '- [SPEC-015](../015-c/spec.md); wrapped [SPEC',
        '  -016](../016-d/spec.md)',
        '',
        '**Research**: [r](../020-r/spec.md)',
        '- [after](../021-after/spec.md)',
        '',
        '## Section',
        '- [body](../030-body/spec.md)',
      ].join('\n'),
    )
    expect(facts.dependsOn).toEqual(['011-a', '012-b', '015-c', '016-d'])
  })

  it('counts sub-tasks and ignores bold or quoted task lines', () => {
    const facts = parseDocument(
      ['- [x] T001a a', '- [ ] T001b b', '- [X] T002 c', '- [x] T003ab no'].join('\n'),
    )
    expect(facts.tasksDone).toBe(2)
    expect(facts.tasksTotal).toBe(3)
  })

  it('treats tilde fences and longer fences as code', () => {
    const facts = parseDocument(
      ['~~~', '- [x] T001 a', '~~~', '````', '```', '- [x] T002 b', '````', '- [ ] T003 c'].join('\n'),
    )
    expect(facts.tasksTotal).toBe(1)
    expect(facts.tasksDone).toBe(0)
  })

  it('counts a clarification marker wrapped across a line break', () => {
    expect(
      parseDocument('Is it [NEEDS\nCLARIFICATION: which?]\n\nand `[NEEDS\nCLARIFICATION: code]`')
        .openClarifications,
    ).toBe(1)
    expect(parseDocument('[NEEDS\n\nCLARIFICATION: split by a blank line]').openClarifications).toBe(0)
  })

  it('stays linear on adversarial input', () => {
    const nested = Array.from({ length: 5000 }, (_, i) => `${'>'.repeat(i + 1)} x`).join('\n')
    const lists = Array.from({ length: 3000 }, (_, i) => `${' '.repeat(i * 2)}- x`).join('\n')
    for (const text of [
      '*a'.repeat(250_000),
      `${'>'.repeat(5000)} x`,
      nested,
      lists,
      '- '.repeat(250_000),
      `**Depends on**: ${'*a '.repeat(30_000)}`,
      '`a``'.repeat(100_000),
    ]) {
      const start = performance.now()
      expect(() => parseDocument(text)).not.toThrow()
      expect(performance.now() - start).toBeLessThan(1000)
    }
  })
})

describe('bold task ids', () => {
  it('counts tasks whose id is bold', () => {
    const f = parseDocument('- [X] **T044 bold one**\n- [ ] **T045** bold id only\n- [x] T046 plain\n')
    expect(f.tasksTotal).toBe(3)
    expect(f.tasksDone).toBe(2)
  })
})
