import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { findFiles } from '@/lib/ui/contract-scans'

const adminFiles = findFiles([
  { root: 'convex', includeExtensions: ['.ts'] },
  { root: 'src/lib/operator/admin-console', includeExtensions: ['.ts'] },
  { root: 'src/components/ae/admin', includeExtensions: ['.ts', '.tsx'] },
]).filter((file) => !file.startsWith('convex/') || file.startsWith('convex/lib/adminConsole/') || /^convex\/adminConsole[^/]*\.ts$/u.test(file))
const adminSources = adminFiles.map((file) => ({ file, source: readFileSync(file, 'utf8') }))

function offenders(pattern: RegExp, files = adminSources): string[] {
  return files.filter(({ source }) => pattern.test(source)).map(({ file }) => file)
}

describe('admin console boundary', () => {
  it('keeps private module imports out of admin code', () => {
    expect(offenders(/(?:from\s*|import\s*\(\s*|import\s*)['"]@\/modules\/[^/'"]+\/internal\//u)).toEqual([])
  })

  it('keeps Convex documents out of operator contracts', () => {
    expect(offenders(/\bDoc\s*</u, adminSources.filter(({ file }) => /^src\/lib\/operator\/admin-console\/[^/]+\.ts$/u.test(file)))).toEqual([])
  })

  it('centralises server event capture', () => {
    const sources = findFiles([
      { root: 'src', includeExtensions: ['.ts', '.tsx'] },
      { root: 'convex', includeExtensions: ['.ts'] },
    ]).filter((file) => ![
      'src/lib/observability/admin-event-props.ts',
      'src/lib/observability/posthog.server.ts',
    ].includes(file)).map((file) => ({ file, source: readFileSync(file, 'utf8') }))
    expect(offenders(/\bcaptureServerEvent\s*\(/u, sources)).toEqual([])
  })

  it('uses Convex pagination rather than unbounded reads or hand-rolled cursors', () => {
    expect(offenders(/base64|\b(?:btoa|atob)\s*\(|\bBuffer\.from\s*\(|\b(?:encode|decode)Cursor\b/iu)).toEqual([])
    // Point lookups may use first(); list queries must finish with paginate() or take().
    expect(offenders(/\.collect\s*\(/u)).toEqual([])
  })

  it('keeps admin RPC façades below 200 lines', () => {
    expect(adminSources
      .filter(({ file }) => /^convex\/adminConsole[^/]*\.ts$/u.test(file))
      .filter(({ source }) => source.split('\n').length > 200)
      .map(({ file }) => file)).toEqual([])
  })
})
