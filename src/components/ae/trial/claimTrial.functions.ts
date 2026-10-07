import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import type { Infer } from 'convex/values'
import { trialClaimResultValue } from '@/modules/money/public'
import { callSourceAction, sourceAction } from '@/lib/server/convex-source'

const claimTrial = sourceAction<Record<string, never>, Infer<typeof trialClaimResultValue>>('trialAccessActions:claim')

export const claimTrialServer = createServerFn({ method: 'POST' })
  .validator(data => z.strictObject({}).parse(data))
  .handler(async () => {
    setResponseHeader('cache-control', 'private, no-store')
    return await callSourceAction(claimTrial, {})
  })
