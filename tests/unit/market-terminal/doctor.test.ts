import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

const ENVIRONMENT_NAMES = [
  'CONVEX_URL',
  'VITE_CONVEX_URL',
  'AE_SOURCE_WRITE_SECRET',
  'OPENROUTER_API_KEY',
  'VITE_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'CLERK_JWT_ISSUER_DOMAIN',
  'EXA_API_KEY',
  'OPENWEATHER_API_KEY',
  'SERPAPI_API_KEY',
  'TAVILY_API_KEY',
  'COINGECKO_DEMO_API_KEY',
] as const

const SENTINEL = 'doctor-sentinel-secret-value'

function runDoctor(json: boolean) {
  return spawnSync(process.execPath, [
    '--import',
    'tsx',
    'tools/ae/cli.ts',
    'doctor',
    ...(json ? ['--json'] : []),
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: doctorEnvironment(),
  })
}

function doctorEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const name of ENVIRONMENT_NAMES) env[name] = ''
  return {
    ...env,
    CONVEX_URL: 'https://convex.example.test',
    AE_SOURCE_WRITE_SECRET: SENTINEL,
    OPENROUTER_API_KEY: SENTINEL,
    VITE_CLERK_PUBLISHABLE_KEY: SENTINEL,
    CLERK_JWT_ISSUER_DOMAIN: 'clerk.example.test',
    EXA_API_KEY: SENTINEL,
    TAVILY_API_KEY: SENTINEL,
  }
}

describe('market-terminal doctor command', () => {
  it('reports configured and missing names as deterministic JSON without values', () => {
    const result = runDoctor(true)

    expect(result.status).toBe(0)
    expect(result.signal).toBeNull()
    expect(result.stderr).toBe('')
    expect(result.stdout).not.toContain(SENTINEL)
    expect(JSON.parse(result.stdout)).toEqual({
      core: [
        { name: 'CONVEX_URL', status: 'configured' },
        { name: 'VITE_CONVEX_URL', status: 'missing' },
        { name: 'AE_SOURCE_WRITE_SECRET', status: 'configured' },
        { name: 'OPENROUTER_API_KEY', status: 'configured' },
        { name: 'VITE_CLERK_PUBLISHABLE_KEY', status: 'configured' },
        { name: 'CLERK_SECRET_KEY', status: 'missing' },
        { name: 'CLERK_JWT_ISSUER_DOMAIN', status: 'configured' },
      ],
      optionalProviders: [
        { name: 'EXA_API_KEY', status: 'configured' },
        { name: 'OPENWEATHER_API_KEY', status: 'missing' },
        { name: 'SERPAPI_API_KEY', status: 'missing' },
        { name: 'TAVILY_API_KEY', status: 'configured' },
        { name: 'COINGECKO_DEMO_API_KEY', status: 'missing' },
      ],
    })
  }, 15_000)

  it('reports the same names-only statuses in human output and exits zero when providers are absent', () => {
    const result = runDoctor(false)

    expect(result.status).toBe(0)
    expect(result.signal).toBeNull()
    expect(result.stderr).toBe('')
    expect(result.stdout).not.toContain(SENTINEL)
    expect(result.stdout).toContain('Core runtime')
    expect(result.stdout).toMatch(/^  CONVEX_URL\s+configured$/mu)
    expect(result.stdout).toMatch(/^  VITE_CONVEX_URL\s+missing$/mu)
    expect(result.stdout).toMatch(/^  EXA_API_KEY\s+configured$/mu)
    expect(result.stdout).toMatch(/^  OPENWEATHER_API_KEY\s+missing$/mu)
    expect(result.stdout).toMatch(/^  COINGECKO_DEMO_API_KEY\s+missing$/mu)
  }, 15_000)
})
