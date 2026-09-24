import type { Doc } from '../../../_generated/dataModel'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'

export function interactiveCredentialExpiryNonce(
  credential: Pick<Doc<'credentials'>, 'bindingRef' | 'credentialRef' | 'generation' | 'expiresAt'>,
): string {
  return canonicalDigest({
    kind: 'interactive_credential_expiry:v1',
    bindingRef: credential.bindingRef,
    credentialRef: credential.credentialRef,
    generation: credential.generation,
    expiresAt: credential.expiresAt,
  })
}
