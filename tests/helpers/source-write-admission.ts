import {
  createSourceWriteAdmission,
  sourceWriteBodyDigest,
  type SourceWriteAdmission,
  type SourceWriteAdmissionScope,
} from '@/modules/security/source-write-admission'

export const testSourceWriteSecret = 'test-source-write-secret'

export function installTestSourceWriteSecret(): void {
  for (const name of [
    'AE_SOURCE_WRITE_KEY_INQUIRY',
    'AE_SOURCE_WRITE_PREVIOUS_KEYS_INQUIRY',
    'AE_SOURCE_WRITE_KEY_BILLING',
    'AE_SOURCE_WRITE_PREVIOUS_KEYS_BILLING',
    'AE_SOURCE_WRITE_KEY_PROTECTED',
    'AE_SOURCE_WRITE_PREVIOUS_KEYS_PROTECTED',
    'AE_SOURCE_WRITE_KEY_CLAIM',
    'AE_SOURCE_WRITE_PREVIOUS_KEYS_CLAIM',
    'AE_SOURCE_WRITE_KEY_OPERATOR',
    'AE_SOURCE_WRITE_PREVIOUS_KEYS_OPERATOR',
    'AE_SOURCE_WRITE_KEY_REPAIR',
    'AE_SOURCE_WRITE_PREVIOUS_KEYS_REPAIR',
    'AE_SOURCE_WRITE_KEY_SESSION',
    'AE_SOURCE_WRITE_PREVIOUS_KEYS_SESSION',
    'AE_SOURCE_WRITE_DERIVED_KEY_ID_INQUIRY',
    'AE_SOURCE_WRITE_PREVIOUS_DERIVED_KEY_IDS_INQUIRY',
    'AE_SOURCE_WRITE_DERIVED_KEY_ID_BILLING',
    'AE_SOURCE_WRITE_PREVIOUS_DERIVED_KEY_IDS_BILLING',
    'AE_SOURCE_WRITE_DERIVED_KEY_ID_PROTECTED',
    'AE_SOURCE_WRITE_PREVIOUS_DERIVED_KEY_IDS_PROTECTED',
    'AE_SOURCE_WRITE_DERIVED_KEY_ID_CLAIM',
    'AE_SOURCE_WRITE_PREVIOUS_DERIVED_KEY_IDS_CLAIM',
    'AE_SOURCE_WRITE_DERIVED_KEY_ID_OPERATOR',
    'AE_SOURCE_WRITE_PREVIOUS_DERIVED_KEY_IDS_OPERATOR',
    'AE_SOURCE_WRITE_DERIVED_KEY_ID_REPAIR',
    'AE_SOURCE_WRITE_PREVIOUS_DERIVED_KEY_IDS_REPAIR',
    'AE_SOURCE_WRITE_DERIVED_KEY_ID_SESSION',
    'AE_SOURCE_WRITE_PREVIOUS_DERIVED_KEY_IDS_SESSION',
  ]) {
    delete process.env[name]
  }
  process.env.AE_SOURCE_WRITE_SECRET = testSourceWriteSecret
}

export function sourceWriteAdmission(
  scope: SourceWriteAdmissionScope,
  operationKey: string,
  correlationId: string = operationKey,
  options: { nonce?: string } = {}
): SourceWriteAdmission {
  installTestSourceWriteSecret()

  return createSourceWriteAdmission({
    scope,
    operationKey,
    correlationId,
    ...(options.nonce === undefined ? {} : { nonce: options.nonce }),
    request: {
      method: 'POST',
      origin: 'https://ae.example',
      pathname: '/__test/source-write',
      bodyDigest: sourceWriteBodyDigest(undefined),
    },
  })
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
