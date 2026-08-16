import { describe, expect, it } from 'vitest'

import { backfillMoneyAccountRecoveryDueUnits } from '../../../convex/migrations'

type Row = Record<string, unknown> & { _id: string }
type Page = {
  page: Row[]
  isDone: boolean
  continueCursor: string
}
type HandlerArgs = { cursor?: string; batchSize?: number }
type HandlerResult = {
  done: boolean
  cursor: string
  scanned: number
  updated: number
}
type Handler = (ctx: { db: MemoryDb }, args: HandlerArgs) => Promise<HandlerResult>

type Query = {
  paginate: (args: { cursor: string | null; numItems: number }) => Promise<Page>
}

class MemoryDb {
  private readonly tables = new Map<string, Row[]>()

  seed(table: string, row: Row): void {
    const rows = this.tables.get(table) ?? []
    rows.push(row)
    this.tables.set(table, rows)
  }

  rows(table: string): Row[] {
    return [...(this.tables.get(table) ?? [])]
  }

  query(table: string): Query {
    return {
      paginate: async ({ cursor, numItems }) => {
        const rows = this.tables.get(table) ?? []
        const start = cursor === null ? 0 : Number(cursor)
        const page = rows.slice(start, start + numItems)
        const nextCursor = start + page.length
        return {
          page,
          isDone: nextCursor >= rows.length,
          continueCursor: String(nextCursor),
        }
      },
    }
  }

  async patch(id: string, changes: Record<string, unknown>): Promise<void> {
    for (const rows of this.tables.values()) {
      const index = rows.findIndex((row) => row._id === id)
      const current = rows[index]
      if (current !== undefined) rows[index] = { ...current, ...changes }
    }
  }
}

const handler = (backfillMoneyAccountRecoveryDueUnits as unknown as { _handler: Handler })._handler

function account(id: string, recoveryDueUnits?: string): Row {
  return recoveryDueUnits === undefined
    ? { _id: id }
    : { _id: id, recoveryDueUnits }
}

function recoveryValues(db: MemoryDb): unknown[] {
  return db.rows('moneyAccounts').map((row) => row.recoveryDueUnits)
}

describe('money account recovery due migration', () => {
  it('backfills only missing values, preserves existing values, and replays idempotently', async () => {
    const db = new MemoryDb()
    db.seed('moneyAccounts', account('missing-1'))
    db.seed('moneyAccounts', account('zero-1', '0'))
    db.seed('moneyAccounts', account('debt-1', '7'))
    db.seed('moneyAccounts', account('missing-2'))
    db.seed('moneyAccounts', account('zero-2', '0'))
    db.seed('moneyAccounts', account('missing-3'))

    const first = await handler({ db }, { batchSize: 2 })
    expect(first).toEqual({ done: false, cursor: '2', scanned: 2, updated: 1 })
    expect(recoveryValues(db)).toEqual(['0', '0', '7', undefined, '0', undefined])

    const second = await handler({ db }, { cursor: first.cursor, batchSize: 2 })
    expect(second).toEqual({ done: false, cursor: '4', scanned: 2, updated: 1 })

    const third = await handler({ db }, { cursor: second.cursor, batchSize: 2 })
    expect(third).toEqual({ done: true, cursor: '6', scanned: 2, updated: 1 })
    expect(recoveryValues(db)).toEqual(['0', '0', '7', '0', '0', '0'])

    const replayFirst = await handler({ db }, { batchSize: 2 })
    const replaySecond = await handler({ db }, { cursor: replayFirst.cursor, batchSize: 2 })
    const replayThird = await handler({ db }, { cursor: replaySecond.cursor, batchSize: 2 })
    expect([replayFirst, replaySecond, replayThird]).toEqual([
      { done: false, cursor: '2', scanned: 2, updated: 0 },
      { done: false, cursor: '4', scanned: 2, updated: 0 },
      { done: true, cursor: '6', scanned: 2, updated: 0 },
    ])
    expect(recoveryValues(db)).toEqual(['0', '0', '7', '0', '0', '0'])
  })

  it('caps a requested page and reports bounded scan and update counts', async () => {
    const db = new MemoryDb()
    for (let index = 0; index < 251; index += 1)
      db.seed('moneyAccounts', account(`missing-${index}`))

    const first = await handler({ db }, { batchSize: 10_000 })
    expect(first).toEqual({ done: false, cursor: '250', scanned: 250, updated: 250 })
    expect(recoveryValues(db).filter((value) => value === undefined)).toHaveLength(1)

    const last = await handler({ db }, { cursor: first.cursor, batchSize: 10_000 })
    expect(last).toEqual({ done: true, cursor: '251', scanned: 1, updated: 1 })
    expect(recoveryValues(db).filter((value) => value === undefined)).toHaveLength(0)
  })
})
