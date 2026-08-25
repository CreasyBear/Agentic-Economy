import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { validateNewThreadSearch } from '@/routes/t.new'

function source(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../src/routes/${name}`, import.meta.url)), 'utf8')
}

describe('operation chat routes', () => {
  it('normalizes the optional first prompt', () => {
    expect(validateNewThreadSearch({ q: '  find weather operations  ' })).toEqual({ q: 'find weather operations' })
    expect(validateNewThreadSearch({ q: '   ' })).toEqual({})
    expect(validateNewThreadSearch({ q: 42 })).toEqual({})
  })

  it('uses the thin chat and routes durable thread callbacks', () => {
    const fresh = source('t.new.tsx')
    const durable = source('t.$threadId.tsx')

    expect(fresh).toContain("from '@/components/ae/operation-chat'")
    expect(fresh).toContain("initialPrompt={q ?? ''}")
    expect(fresh).toContain('onThreadCreated={openThread}')
    expect(fresh).toContain("to: '/t/$threadId'")
    expect(fresh).toContain("to: '/t/new'")
    expect(durable).toContain('<OperationChat')
    expect(durable).toContain('threadId={threadId}')
    expect(durable).toContain('onOpenThread={openThread}')
  })

  it('keeps durable threads private without legacy route loaders or access keys', () => {
    const durable = source('t.$threadId.tsx')

    expect(durable).toContain("'Cache-Control': 'private, no-store'")
    expect(durable).toContain("content: 'noindex, noarchive'")
    expect(durable).toContain('Chat unavailable')
    expect(durable).not.toMatch(/loader:|answer-thread|initialProjection|readPrivateRecordAccessKey|\bk\?:/u)
  })

  it('keeps shared chat read-only, noindex, and generically unavailable', () => {
    const shared = source('s.$shareToken.tsx')

    expect(shared).toContain('<SharedOperationChat shareToken={shareToken} />')
    expect(shared).toContain('/^[a-f0-9]{64}$/u')
    expect(shared).toContain("content: 'noindex, noarchive'")
    expect(shared).toContain('invalid, expired, or has been revoked')
    expect(shared).not.toMatch(/loader:|answer-thread|AeSharedThreadView|canonical|og:|composer|continue/u)
  })
})
