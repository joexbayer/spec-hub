import { type SpawnSyncReturns, spawn, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type ServerType, serve } from '@hono/node-server'
import { app } from '../../src/app.ts'

export const SCRIPT = fileURLToPath(
  new URL('../../../../packages/extension/scripts/spec-hub', import.meta.url),
)
/** Where the hooks call the reporter, relative to the work tree root. */
export const SELF = '.specify/extensions/spec-hub/scripts/spec-hub'
export const CONFIG = '.specify/extensions/spec-hub/spec-hub-config.yml'

// ---------------------------------------------------------------- hub

export type Hub = { server: ServerType; port: number }

export function startHub(port = 0): Promise<Hub> {
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info: AddressInfo) =>
      resolve({ server, port: info.port }),
    )
  })
}

export function stopHub(hub: Hub): Promise<void> {
  return new Promise((resolve, reject) => {
    if ('closeAllConnections' in hub.server) hub.server.closeAllConnections()
    hub.server.close((err) => (err ? reject(err) : resolve()))
  })
}

// ---------------------------------------------------------------- shell

export type Run = { status: number | null; stdout: string; stderr: string }

function result(r: SpawnSyncReturns<string>): Run {
  if (r.error) throw r.error
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
}

/** A sandbox: its own HOME / XDG_CONFIG_HOME, no system git config, no inherited GIT_* variables. */
export class Sandbox {
  readonly root: string
  readonly env: NodeJS.ProcessEnv

  constructor() {
    this.root = realpathSync(mkdtempSync(join(tmpdir(), 'spec-hub-e2e-')))
    mkdirSync(join(this.root, 'home'))
    mkdirSync(join(this.root, 'xdg'))
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
    this.env = {
      ...inherited,
      HOME: join(this.root, 'home'),
      XDG_CONFIG_HOME: join(this.root, 'xdg'),
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
    }
  }

  run(cwd: string, cmd: string, args: string[], opts: { input?: string; env?: NodeJS.ProcessEnv } = {}): Run {
    return result(
      spawnSync(cmd, args, {
        cwd,
        env: { ...this.env, ...opts.env },
        encoding: 'utf8',
        ...(opts.input === undefined ? {} : { input: opts.input }),
      }),
    )
  }

  /**
   * Async run: anything that talks to the hub must use this, because the hub serves from this
   * process and spawnSync would block its event loop.
   */
  runAsync(
    cwd: string,
    cmd: string,
    args: string[],
    opts: { input?: string; env?: NodeJS.ProcessEnv } = {},
  ): Promise<Run> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { cwd, env: { ...this.env, ...opts.env } })
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8').on('data', (d: string) => {
        stdout += d
      })
      child.stderr.setEncoding('utf8').on('data', (d: string) => {
        stderr += d
      })
      child.on('error', reject)
      child.on('close', (status) => resolve({ status, stdout, stderr }))
      child.stdin.end(opts.input ?? '')
    })
  }

  /** git, throwing on a non-zero exit. */
  git(cwd: string, ...args: string[]): string {
    const r = this.run(cwd, 'git', args)
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed (${r.status}): ${r.stderr}`)
    return r.stdout
  }

  /** A bare origin plus a clone whose main (with the reporter and its config) is pushed. */
  repo(opts: {
    hubPort: number
    project: string
    name?: string
    initialFiles?: Record<string, string>
  }): Repo {
    const name = opts.name ?? 'clone'
    const origin = join(this.root, `${name}-origin.git`)
    const dir = join(this.root, name)
    this.git(this.root, 'init', '-q', '--bare', '-b', 'main', origin)
    this.git(this.root, 'init', '-q', '-b', 'main', dir)
    this.git(dir, 'config', 'user.name', 'Test Dev')
    this.git(dir, 'config', 'user.email', 'dev@example.test')
    this.git(dir, 'remote', 'add', 'origin', origin)
    const repo = new Repo(this, dir)
    mkdirSync(join(dir, dirname(SELF)), { recursive: true })
    copyFileSync(SCRIPT, join(dir, SELF))
    chmodSync(join(dir, SELF), 0o755)
    repo.writeConfig(opts.hubPort, opts.project)
    repo.write('README.md', '# test\n')
    for (const [path, content] of Object.entries(opts.initialFiles ?? {})) repo.write(path, content)
    this.git(dir, 'add', '-A')
    this.git(dir, 'commit', '-q', '-m', 'initial')
    this.git(dir, 'push', '-q', '-u', 'origin', 'main')
    return repo
  }
}

export class Repo {
  readonly sb: Sandbox
  readonly dir: string

  constructor(sb: Sandbox, dir: string) {
    this.sb = sb
    this.dir = dir
  }

  write(path: string, content: string): void {
    mkdirSync(dirname(join(this.dir, path)), { recursive: true })
    writeFileSync(join(this.dir, path), content)
  }

  writeConfig(port: number, project: string): void {
    this.write(CONFIG, `hub_url: http://127.0.0.1:${port}\nproject: ${project}\n`)
  }

  git(...args: string[]): string {
    return this.sb.git(this.dir, ...args)
  }

  /** git commit as the user would run it (hooks fire), returning its output. */
  commit(paths: string[], message: string, env?: NodeJS.ProcessEnv): Run {
    this.git('add', '--', ...paths)
    const r = this.sb.run(this.dir, 'git', ['commit', '-m', message], env ? { env } : {})
    if (r.status !== 0) throw new Error(`git commit failed (${r.status}): ${r.stderr}`)
    return r
  }

  /** The reporter, run from the work tree root as the hooks run it. */
  spechub(args: string[], opts: { input?: string; env?: NodeJS.ProcessEnv } = {}): Promise<Run> {
    return this.sb.runAsync(this.dir, 'sh', [SELF, ...args], opts)
  }

  /** The reporter run synchronously: only for commands that never wait on the hub (hook's foreground). */
  spechubSync(args: string[]): Run {
    return this.sb.run(this.dir, 'sh', [SELF, ...args])
  }

  async connect(token: string): Promise<Run> {
    const r = await this.spechub(['connect'], { input: `${token}\n` })
    if (r.status !== 0) throw new Error(`connect failed (${r.status}): ${r.stdout}${r.stderr}`)
    return r
  }

  cloneId(): string {
    return this.git('config', '--local', 'spec-hub.cloneId').trim()
  }

  commonDir(): string {
    return this.git('rev-parse', '--path-format=absolute', '--git-common-dir').trim()
  }
}

// ---------------------------------------------------------------- polling

/** Polls `probe` every 100 ms for up to `ms` until it returns a non-undefined value. */
export async function waitFor<T>(probe: () => Promise<T | undefined>, what: string, ms = 5000): Promise<T> {
  const deadline = Date.now() + ms
  for (;;) {
    const v = await probe()
    if (v !== undefined) return v
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 100))
  }
}
