import {
  createSourceWriteAdmission,
  sourceWriteCommandBodyDigest,
  sourceWriteCommandDigest,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
  type SourceWriteAdmissionScope,
} from '@/modules/security/source-write-admission'

export const testSourceWriteSecret = 'test-source-write-secret-material-32'

export function installTestSourceWriteSecret(): void {
  for (const name of [
    'AE_SOURCE_WRITE_KEY_BILLING',
    'AE_SOURCE_WRITE_PREVIOUS_KEYS_BILLING',
    'AE_SOURCE_WRITE_KEY_PROTECTED',
    'AE_SOURCE_WRITE_PREVIOUS_KEYS_PROTECTED',
    'AE_SOURCE_WRITE_KEY_CATALOG',
    'AE_SOURCE_WRITE_PREVIOUS_KEYS_CATALOG',
    'AE_SOURCE_WRITE_KEY_OPERATOR',
    'AE_SOURCE_WRITE_PREVIOUS_KEYS_OPERATOR',
    'AE_SOURCE_WRITE_KEY_REPAIR',
    'AE_SOURCE_WRITE_PREVIOUS_KEYS_REPAIR',
    'AE_SOURCE_WRITE_KEY_SESSION',
    'AE_SOURCE_WRITE_PREVIOUS_KEYS_SESSION',
    'AE_SOURCE_WRITE_DERIVED_KEY_ID_BILLING',
    'AE_SOURCE_WRITE_PREVIOUS_DERIVED_KEY_IDS_BILLING',
    'AE_SOURCE_WRITE_DERIVED_KEY_ID_PROTECTED',
    'AE_SOURCE_WRITE_PREVIOUS_DERIVED_KEY_IDS_PROTECTED',
    'AE_SOURCE_WRITE_DERIVED_KEY_ID_CATALOG',
    'AE_SOURCE_WRITE_PREVIOUS_DERIVED_KEY_IDS_CATALOG',
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

export async function sourceWriteAdmission(
  scope: SourceWriteAdmissionScope,
  operationKey: string,
  correlationId: string = operationKey,
  options: { nonce?: string } = {}
): Promise<SourceWriteAdmission> {
  installTestSourceWriteSecret()
  const command = { operationKey, correlationId }
  const request = sourceWriteRequestFor(command)

  return await createSourceWriteAdmission({
    scope,
    operationKey,
    correlationId,
    commandDigest: sourceWriteCommandDigest(command),
    ...(options.nonce === undefined ? {} : { nonce: options.nonce }),
    request,
    now: new Date().getTime(),
    env: { AE_SOURCE_WRITE_SECRET: testSourceWriteSecret },
  })
}

export async function withSourceWrite<T extends { operationKey: string; correlationId: string }>(
  scope: SourceWriteAdmissionScope,
  args: T
): Promise<T & { sourceWriteRequest: SourceWriteAdmissionRequest; sourceWrite: SourceWriteAdmission }> {
  installTestSourceWriteSecret()
  const sourceWriteRequest = sourceWriteRequestFor(args)
  return {
    ...args,
    sourceWriteRequest,
    sourceWrite: await createSourceWriteAdmission({
      scope,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      commandDigest: sourceWriteCommandDigest(args),
      request: sourceWriteRequest,
      now: new Date().getTime(),
      env: { AE_SOURCE_WRITE_SECRET: testSourceWriteSecret },
    }),
  }
}

/**
 * Sign an internal admission command while returning the narrower public
 * action arguments. Recovery actions intentionally add their fixed empty
 * operation/input material before invoking the admission mutation.
 */
export async function withSourceWriteCommand<
  T extends { operationKey: string; correlationId: string },
>(
  scope: SourceWriteAdmissionScope,
  args: T,
  command: object,
): Promise<T & { sourceWriteRequest: SourceWriteAdmissionRequest; sourceWrite: SourceWriteAdmission }> {
  installTestSourceWriteSecret()
  const sourceWriteRequest = sourceWriteRequestFor(command)
  return {
    ...args,
    sourceWriteRequest,
    sourceWrite: await createSourceWriteAdmission({
      scope,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      commandDigest: sourceWriteCommandDigest(command),
      request: sourceWriteRequest,
      now: new Date().getTime(),
      env: { AE_SOURCE_WRITE_SECRET: testSourceWriteSecret },
    }),
  }
}

export function withoutSourceWrite<T extends {
  sourceWrite?: SourceWriteAdmission
  sourceWriteRequest?: SourceWriteAdmissionRequest
}>(args: T): Omit<T, 'sourceWrite' | 'sourceWriteRequest'> {
  const { sourceWrite: _sourceWrite, sourceWriteRequest: _sourceWriteRequest, ...rest } = args
  return rest
}

const TEST_SOURCE_WRITE_REQUEST = {
  method: 'POST',
  initiatorOrigin: 'https://ae.example',
  targetOrigin: 'https://ae.example',
  targetPath: '/__test/source-write',
  targetQuery: '',
} as const

function sourceWriteRequestFor(command: object): SourceWriteAdmissionRequest {
  return {
    ...TEST_SOURCE_WRITE_REQUEST,
    bodyDigest: sourceWriteCommandBodyDigest(command),
  }
}
