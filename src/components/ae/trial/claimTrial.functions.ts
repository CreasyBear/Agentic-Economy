import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import type { Infer } from 'convex/values'
import { trialClaimResultValue } from '@/modules/money/public'
import { callSourceAction, sourceAction } from '@/lib/server/convex-source'

const claimTrial = sourceAction<{ code?: string }, Infer<typeof trialClaimResultValue>>('trialAccessActions:claim')

export const claimTrialServer = createServerFn({ method: 'POST' })
  .validator(data => z.strictObject({ code: z.string().trim().max(32).optional() }).parse(data))
  .handler(async ({ data }) => {
    setResponseHeader('cache-control', 'private, no-store')
    return await callSourceAction(claimTrial, data.code === undefined ? {} : { code: data.code })
  })
