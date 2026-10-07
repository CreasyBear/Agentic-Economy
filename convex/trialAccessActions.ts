"use node"

import { v } from 'convex/values'
import { action, internalAction } from './_generated/server'
import { trialClaimResultValue } from '@/modules/money/public'
import { claimTrialHandler, deliverInvitationHandler } from './lib/money/trials/clerk'

export const claim = action({ args: {}, returns: trialClaimResultValue, handler: claimTrialHandler })
export const deliverInvitation = internalAction({ args: { offerRef: v.string() }, returns: v.boolean(), handler: deliverInvitationHandler })
