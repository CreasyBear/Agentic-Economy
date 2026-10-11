import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { assertPinnedNitro } from '../../../tools/release/release-integrity'

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

function manifestAndLock(spec: string, locked: Record<string, string>) {
  return [
    { devDependencies: { nitro: spec } },
    { packages: { '': { devDependencies: { nitro: spec } }, 'node_modules/nitro': locked } },
  ] as const
}

describe('nitro dependency pin', () => {
  it('accepts the repository manifest and lockfile', () => {
    const manifest = readJson('package.json') as { devDependencies: { nitro: string } }
    expect(assertPinnedNitro(manifest, readJson('package-lock.json'))).toBe(manifest.devDependencies.nitro)
  })

  it('accepts an exact published version locked from the npm registry', () => {
    const [manifest, lock] = manifestAndLock('3.0.260903-beta', {
      version: '3.0.260903-beta',
      resolved: 'https://registry.npmjs.org/nitro/-/nitro-3.0.260903-beta.tgz',
      integrity: 'sha512-x',
    })
    expect(assertPinnedNitro(manifest, lock)).toBe('3.0.260903-beta')
  })

  it.each(['^3.0.260903-beta', 'npm:nitro-nightly@3.0.1-20260628-090458-3df69609', 'latest'])(
    'rejects the non-exact spec %s',
    (spec) => {
      const [manifest, lock] = manifestAndLock(spec, { version: spec, resolved: 'x', integrity: 'x' })
      expect(() => assertPinnedNitro(manifest, lock)).toThrow('nitro_must_be_an_exact_published_version')
    },
  )

  it('rejects a lock entry resolved from a nightly alias', () => {
    const [manifest, lock] = manifestAndLock('3.0.260903-beta', {
      name: 'nitro-nightly',
      version: '3.0.260903-beta',
      resolved: 'https://registry.npmjs.org/nitro-nightly/-/nitro-nightly-3.0.260903-beta.tgz',
      integrity: 'sha512-x',
    })
    expect(() => assertPinnedNitro(manifest, lock)).toThrow('nitro_lock_must_resolve_from_the_npm_registry')
  })
})
