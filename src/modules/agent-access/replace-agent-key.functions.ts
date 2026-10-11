import { clerkClient } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'

import { degrade } from '@/lib/observability/degrade'
import { hasStrictClerkConsequenceProof } from '@/lib/server/clerk-consequence-proof'
import { currentRequestCorrelationId } from '@/lib/server/request-correlation'
import { idempotencyKeySchema } from '@/modules/common/action'
import {
  cancelAgentCredentialReplacement,
  completeAgentLifecycle,
  createClerkAgentAccessKeyApi,
  owner,
  prepareAgentCredentialReplacement,
  promoteAgentCredentialReplacement,
  requireCanonicalOwnerAuthorityServer,
} from './agent-access.functions'
import { loadAgentDirectoryReadback } from './agent-access-console'
import { replaceAgentAccessKey } from './replace-agent-key'

/** Replace one Agent key: mint, prepare, promote, revoke the predecessor. */
export const replaceAgentAccessKeyServer = createServerFn({ method: 'POST' })
  .validator((data) => z.strictObject({ principalRef: z.string().regex(/^prn_[0-9a-f]{32}$/u), idempotencyKey: idempotencyKeySchema }).parse(data))
  .handler(async ({ data }) => {
    try {
      const principal = await owner()
      if (principal === undefined) return { kind: 'error' as const, code: 'missing_auth' as const, retryable: false }
      if (!await hasStrictClerkConsequenceProof()) return { kind: 'refused', code: 'reverification_required' } as const
      await requireCanonicalOwnerAuthorityServer()
      const directory = await loadAgentDirectoryReadback(null, data.principalRef, undefined, getRequest().signal)
      const detail = directory.details.find((candidate) => candidate.agent.principalRef === data.principalRef)
      if (detail === undefined) return { kind: 'error' as const, code: 'invalid_input' as const, retryable: false }
      return await replaceAgentAccessKey({
        userId: principal.userId,
        detail,
        idempotencyKey: data.idempotencyKey,
        api: createClerkAgentAccessKeyApi(clerkClient().apiKeys),
        prepare: prepareAgentCredentialReplacement,
        promote: promoteAgentCredentialReplacement,
        cancel: cancelAgentCredentialReplacement,
        completeLifecycle: completeAgentLifecycle,
        correlationRef: currentRequestCorrelationId() ?? globalThis.crypto.randomUUID(),
      })
    } catch (cause) {
      return degrade(cause, { kind: 'error' as const, code: 'issuance_unavailable' as const, retryable: true }, { site: 'replaceAgentAccessKeyServer', reason: 'source_unavailable' })
    }
  })
