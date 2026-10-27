import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth-schema.ts'

export * from './auth-schema.ts'

export const projectNumbering = pgEnum('numbering', ['sequential', 'timestamp'])
export const membershipRole = pgEnum('membership_role', ['admin', 'member'])

export const project = pgTable('project', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  defaultBranch: text('default_branch').notNull().default('main'),
  numbering: projectNumbering('numbering').notNull().default('sequential'),
  defaultTip: text('default_tip'),
  defaultTipAt: timestamp('default_tip_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const membership = pgTable(
  'membership',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    // The GitHub account the membership belongs to (FR-027); assigned by username, resolved by GitHub.
    githubId: text('github_id').notNull(),
    // GitHub's login at assign time, shown only while pending; never used to bind or authorize.
    assignedLogin: text('assigned_login').notNull(),
    // Bound when the account with `githubId` has a hub user (at assign time, or its first sign-in).
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    role: membershipRole('role').notNull(),
    invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.githubId] }), index('membership_user_id_idx').on(t.userId)],
)

export const clone = pgTable(
  'clone',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    commitEmail: text('commit_email').notNull(),
    generatedAt: bigint('generated_at', { mode: 'number' }).notNull(),
    reportedAt: timestamp('reported_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('clone_project_id_idx').on(t.projectId), index('clone_user_id_idx').on(t.userId)],
)

export const cloneBranch = pgTable(
  'clone_branch',
  {
    cloneId: uuid('clone_id')
      .notNull()
      .references(() => clone.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tip: text('tip').notNull(),
    tipAt: timestamp('tip_at', { withTimezone: true }).notNull(),
    pushed: boolean('pushed').notNull(),
  },
  (t) => [primaryKey({ columns: [t.cloneId, t.name] })],
)

export const cloneFeature = pgTable(
  'clone_feature',
  {
    cloneId: uuid('clone_id').notNull(),
    branch: text('branch').notNull(),
    dir: text('dir').notNull(),
    lastChangeAt: timestamp('last_change_at', { withTimezone: true }).notNull(),
    authorName: text('author_name'),
    authorEmail: text('author_email'),
    specOid: text('spec_oid'),
    planOid: text('plan_oid'),
    tasksOid: text('tasks_oid'),
    specSize: integer('spec_size'),
    planSize: integer('plan_size'),
    tasksSize: integer('tasks_size'),
  },
  (t) => [
    primaryKey({ columns: [t.cloneId, t.branch, t.dir] }),
    foreignKey({
      columns: [t.cloneId, t.branch],
      foreignColumns: [cloneBranch.cloneId, cloneBranch.name],
    }).onDelete('cascade'),
    index('clone_feature_dir_idx').on(t.dir),
  ],
)

export const document = pgTable(
  'document',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    oid: text('oid').notNull(),
    size: integer('size').notNull(),
    content: text('content'),
    tooLarge: boolean('too_large').notNull().default(false),
    unreadable: boolean('unreadable').notNull().default(false),
    title: text('title'),
    ownerHandle: text('owner_handle'),
    openClarifications: integer('open_clarifications').notNull().default(0),
    tasksDone: integer('tasks_done').notNull().default(0),
    tasksTotal: integer('tasks_total').notNull().default(0),
    dependsOn: text('depends_on').array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.oid] })],
)

export const landedFeature = pgTable(
  'landed_feature',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    dir: text('dir').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
    baseline: boolean('baseline').notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.dir] })],
)

export const securityEvent = pgTable(
  'security_event',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorUserId: text('actor_user_id'),
    projectId: uuid('project_id'),
    type: text('type').notNull(),
    detail: jsonb('detail').notNull().default({}),
  },
  (t) => [
    index('security_event_project_at_idx').on(t.projectId, t.at.desc()),
    index('security_event_at_idx').on(t.at),
  ],
)
