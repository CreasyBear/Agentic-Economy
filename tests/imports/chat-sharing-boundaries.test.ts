import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../helpers/source-files'

/**
 * Locks the B7 chat-sharing extraction contract:
 * the chatThreadShares durable table and its access helpers have exactly one
 * owner (`src/modules/chat-sharing/`), hosts compose through owner helpers only,
 * and external consumption passes exclusively through the three declared
 * entry surfaces (share-token.ts / schema.ts / convex.ts).
 */
const shareOwnershipRoot = 'src/modules/chat-sharing/'

const declaredEntries: Record<string, true> = {
  'share-token.ts': true,
  'schema.ts': true,
  'convex.ts': true,
}

const hostShareConsumers = [
  'convex/chatShares.ts',
  'convex/chatThreads.ts',
]

const moduleImportPatterns = [
  /@\/modules\/chat-sharing\/([\w./-]+)/gu,
  /\.\.\/src\/modules\/chat-sharing\/([\w./-]+)/gu,
]

describe('chat sharing feature-module boundaries', () => {
  it('owns the chatThreadShares durable table definition inside chat-sharing only', () => {
    const definers = listTsFiles('src/modules').filter((file) =>
      readFileSync(file, 'utf8').includes('chatThreadShares'))

    expect(definers.length).toBeGreaterThan(0)
    for (const file of definers) {
      expect(file.startsWith(shareOwnershipRoot)).toBe(true)
    }
    const tableOwner = 'src/modules/chat-sharing/internal/convex-schema.ts'
    expect(readFileSync(tableOwner, 'utf8')).toContain('chatThreadShares: defineTable(')
  })

  it('keeps the chat module free of any share-table reference', () => {
    for (const file of listTsFiles('src/modules/chat')) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toContain('chatThreadShares')
      expect(file.endsWith('share-token.ts')).toBe(false)
      expect(source).not.toContain("from '@/modules/chat-sharing")
    }
  })

  it('keeps both Convex hosts on owner helpers with zero direct share-table CRUD', () => {
    for (const file of hostShareConsumers) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toContain("'chatThreadShares'")
      expect(source).not.toContain('.replace(existing._id')
    }
  })

  it('completes the clean cutover of share-token authority', () => {
    expect(existsSync('src/modules/chat/share-token.ts')).toBe(false)

    const staleImporter = /@\/modules\/chat\/share-token/u
    for (const file of [...listTsFiles('convex'), ...listTsFiles('src'), ...listTsFiles('tests')]) {
      expect(staleImporter.test(readFileSync(file, 'utf8'))).toBe(false)
    }
  })

  it('exposes chat-sharing externally only through its declared entry surfaces', () => {
    const consumers = [
      ...listTsFiles('convex'),
      ...listTsFiles('src'),
      ...listTsFiles('tests'),
    ].filter((file) => !file.startsWith(shareOwnershipRoot))

    for (const file of consumers) {
      const source = readFileSync(file, 'utf8')
      for (const pattern of moduleImportPatterns) {
        for (const match of source.matchAll(pattern)) {
          const rawEntry = match[1]
          const entry = rawEntry === undefined || rawEntry.endsWith('.ts')
            ? rawEntry
            : `${rawEntry}.ts`
          expect(entry !== undefined && declaredEntries[entry] === true, `${file} imports undeclared chat-sharing entry ${String(rawEntry)}`).toBe(true)
        }
      }
    }
  })
})
