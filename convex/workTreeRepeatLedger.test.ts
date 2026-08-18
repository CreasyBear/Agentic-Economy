/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const ledgerApi = anyApi.workTreeRepeatLedger
if (ledgerApi === undefined) throw new Error('work_tree_repeat_ledger_api_missing')
const inspectRepeatUse = ledgerApi.inspectRepeatUse
if (inspectRepeatUse === undefined) throw new Error('work_tree_repeat_ledger_api_missing')

describe('WorkTree repeat ledger after table unlist', () => {
  it('refuses inspect without workTreeRepeat tables', async () => {
    const backend = convexTest(schema, modules)
    await expect(backend.query(inspectRepeatUse, { useRef: 'repeat-use:unlisted' }))
      .resolves.toMatchObject({ kind: 'refused', code: 'not_found' })
  })
})
