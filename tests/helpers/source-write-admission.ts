import { createHmac } from 'node:crypto'

import { stableStringify } from '@/modules/common/stable-hash'
import {
  sourceWriteSigningPayload,
  type SourceWriteAdmission,
  type SourceWriteAdmissionScope,
} from '@/modules/security/source-write-admission'

export const testSourceWriteSecret = 'test-source-write-secret'

export function installTestSourceWriteSecret(): void {
  process.env.AE_SOURCE_WRITE_SECRET = testSourceWriteSecret
}

export function sourceWriteAdmission(
  scope: SourceWriteAdmissionScope,
  operationKey: string,
  correlationId: string = operationKey
): SourceWriteAdmission {
  installTestSourceWriteSecret()

  const unsigned = {
    version: 'source-write:v1' as const,
    scope,
    operationKey,
    correlationId,
    issuedAt: Date.now(),
    nonce: `nonce:${scope}:${operationKey}`,
    method: 'POST',
    origin: 'https://ae.example',
    pathname: '/__test/source-write',
  }

  return {
    ...unsigned,
    signature: createHmac('sha256', testSourceWriteSecret)
      .update(stableStringify(sourceWriteSigningPayload(unsigned)))
      .digest('hex'),
  }
}

export function withSourceWrite<T extends { operationKey: string; correlationId: string }>(
  scope: SourceWriteAdmissionScope,
  args: T
): T & { sourceWrite: SourceWriteAdmission } {
  return {
    ...args,
    sourceWrite: sourceWriteAdmission(scope, args.operationKey, args.correlationId),
  }
}

export function withoutSourceWrite<T extends { sourceWrite?: SourceWriteAdmission }>(args: T): Omit<T, 'sourceWrite'> {
  const { sourceWrite: _sourceWrite, ...rest } = args
  return rest
}
