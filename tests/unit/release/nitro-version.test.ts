import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { assertPinnedNitro } from '../../../tools/release/release-integrity'

describe('nitro dependency', () => {
  it('is a published release, not a nightly snapshot', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    const spec: string = pkg.dependencies?.nitro ?? pkg.devDependencies?.nitro
    expect(spec).toBeDefined()
    expect(spec).not.toMatch(/nightly|npm:/)
    expect(spec).toMatch(/^\d+\.\d+\.\d+(-beta)?$/)
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
    expect(assertPinnedNitro(pkg, lock)).toBe(spec)
  })
})

function pinnedNitro(version = '3.0.260903-beta') {
  return {
    manifest: { devDependencies: { nitro: version } },
    lock: {
      packages: {
        '': { devDependencies: { nitro: version } },
        'node_modules/nitro': {
          version,
          resolved: `https://registry.npmjs.org/nitro/-/nitro-${version}.tgz`,
          integrity: 'sha512-test',
        },
      },
    },
  }
}

describe('Nitro release integrity', () => {
  it.each(['3.0.260903-beta', '3.0.0', '3.0.0-beta.1'])('accepts the exact published version %s', version => {
    const { manifest, lock } = pinnedNitro(version)
    expect(assertPinnedNitro(manifest, lock)).toBe(version)
  })

  it.each(['latest', 'beta', '^3.0.0', '~3.0.0', '3.*', '3.0', '>=3.0.0', 'npm:nitro-nightly@3.0.0-test'])('rejects a mutable or aliased dependency: %s', spec => {
    const { manifest, lock } = pinnedNitro(spec)
    expect(() => assertPinnedNitro(manifest, lock)).toThrow('nitro_must_be_exactly_pinned')
  })

  it('rejects a different root lockfile specification', () => {
    const { manifest, lock } = pinnedNitro()
    lock.packages[''].devDependencies.nitro = '3.0.0'
    expect(() => assertPinnedNitro(manifest, lock)).toThrow('nitro_root_lock_spec_mismatch')
  })

  it('rejects a different installed version', () => {
    const { manifest, lock } = pinnedNitro()
    lock.packages['node_modules/nitro'].version = '3.0.0'
    expect(() => assertPinnedNitro(manifest, lock)).toThrow('nitro_lock_version_mismatch')
  })

  it('accepts an explicit package name but rejects a substituted package', () => {
    const { manifest, lock } = pinnedNitro()
    Object.assign(lock.packages['node_modules/nitro'], { name: 'nitro' })
    expect(assertPinnedNitro(manifest, lock)).toBe('3.0.260903-beta')
    Object.assign(lock.packages['node_modules/nitro'], { name: 'nitro-nightly' })
    expect(() => assertPinnedNitro(manifest, lock)).toThrow('nitro_lock_version_mismatch')
  })

  it.each(['integrity', 'resolved'] as const)('rejects missing %s metadata', field => {
    const { manifest, lock } = pinnedNitro()
    lock.packages['node_modules/nitro'][field] = ''
    expect(() => assertPinnedNitro(manifest, lock)).toThrow(/must_be_a_non_empty_string/)
  })
})
