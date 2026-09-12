import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { findFiles } from '@/lib/ui/contract-scans'

// AEcon discovers supply through protocols (x402, CDP, the Bazaar extension),
// never by reading a particular third-party marketplace. These are the host
// strings of the two marketplaces retired in Well 0. Enum values retained in
// the schema as history are deliberately not matched; network coupling is.
const RETIRED_SOURCE_HOSTS = /treg\.to|api\.agentic\.market|agentic\.market\//

const fixtureMode = process.env.AE_SCAN_MODE === 'fixtures'

function scanTargets(): readonly string[] {
  if (fixtureMode) {
    return findFiles([{ root: 'tests/fixtures/external-source', includeExtensions: ['.ts'] }])
  }
  return findFiles([
    { root: 'src', includeExtensions: ['.ts', '.tsx'] },
    { root: 'convex', includeExtensions: ['.ts'], exclude: ['convex/_generated'] },
    { root: 'tools', includeExtensions: ['.ts'], exclude: ['tools/release/package5-reference-provider/node_modules'] },
  ])
}

describe('external source drift', () => {
  it(fixtureMode
    ? 'reports a planted marketplace host in fixture mode'
    : 'keeps runtime code free of retired third-party marketplace hosts', () => {
    const hits: string[] = []
    for (const file of scanTargets()) {
      const content = readFileSync(file, 'utf8')
      if (RETIRED_SOURCE_HOSTS.test(content)) hits.push(file.replaceAll('\\', '/'))
    }
    if (fixtureMode) {
      expect(hits).toEqual(['tests/fixtures/external-source/retired-host.fixture.ts'])
      return
    }
    expect(hits).toEqual([])
  })
})
