import { describe, expect, it } from 'vitest'
import { parseDocument } from '../src/parse-document.ts'
import { inferPhase } from '../src/phase.ts'
import type { DocFacts } from '../src/types.ts'

const facts = (md: string): DocFacts => ({ ...parseDocument(md), tooLarge: false, unreadable: false })

// Documents shaped like Spec Kit's own templates, with no extension or preset installed: no Owner
// line, no Depends on line, no preview.md. The hub must read them fully.
const SPEC = `# Feature Specification: Photo albums

**Feature Branch**: \`003-photo-albums\`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Let users group photos into albums"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create an album (Priority: P1)

A user creates an album and adds photos to it.

## Requirements *(mandatory)*

- **FR-001**: Users MUST be able to create albums.
- **FR-002**: Albums MUST be shareable with [NEEDS CLARIFICATION: who can see a shared album?]
`

const TASKS = `# Tasks: Photo albums

## Phase 1: Setup

- [x] T001 Create project structure per implementation plan
- [x] T002 [P] Configure linting and formatting tools

## Phase 3: User Story 1 - Create an album (Priority: P1)

- [ ] T003 [P] [US1] Create Album model in src/models/album.py
- [ ] T004 [US1] Implement AlbumService in src/services/album_service.py
`

describe('stock Spec Kit documents', () => {
  it('reads the spec: title, open clarifications, and no owner or dependencies to require', () => {
    const facts = parseDocument(SPEC)
    expect(facts.title).toBe('Photo albums')
    expect(facts.openClarifications).toBe(1)
    expect(facts.ownerHandle).toBeNull()
    expect(facts.dependsOn).toEqual([])
  })

  it('counts tasks with [P] and [USn] markers', () => {
    const facts = parseDocument(TASKS)
    expect([facts.tasksDone, facts.tasksTotal]).toEqual([2, 4])
  })

  it('infers the phase from the spec, plan and tasks alone', () => {
    const spec = facts(SPEC.replace(/\[NEEDS CLARIFICATION:[^\]]*\]/, 'members of the album'))
    const plan = facts('# Implementation Plan: Photo albums\n')
    expect(inferPhase({ spec, plan: null, tasks: null }).kind).toBe('specify')
    expect(inferPhase({ spec, plan, tasks: null }).kind).toBe('plan')
    expect(inferPhase({ spec, plan, tasks: facts(TASKS) })).toMatchObject({
      kind: 'implement',
      done: 2,
      total: 4,
    })
  })
})
