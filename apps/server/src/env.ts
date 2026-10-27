import { type Env, parseEnv } from './env-schema.ts'

export type { Env }

function loadEnv(): Env {
  try {
    return parseEnv(process.env)
  } catch (err) {
    console.error((err as Error).message)
    process.exit(1)
  }
}

export const env: Env = loadEnv()
