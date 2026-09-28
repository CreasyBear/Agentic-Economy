import { createServerFn } from '@tanstack/react-start'

import { readOperatorContextThroughSource } from '@/lib/server/operator-context.functions'
import { readFormancePresence } from '@/modules/money/server'
import type { AdminConfiguredState } from './overview.contracts'

export const readAdminFormanceConfigurationServer = createServerFn({ method: 'GET' })
  .handler(async (): Promise<AdminConfiguredState> => {
    const session = await readOperatorContextThroughSource()
    if (session.kind !== 'authorized' || !session.allowedSurfaces.includes('admin')) return 'unavailable'
    try {
      return readFormancePresence()
    } catch (cause) {
      console.warn('admin_formance_presence_unavailable', cause)
      return 'unavailable'
    }
  })
