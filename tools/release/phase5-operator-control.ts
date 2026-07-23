import { createSourceWriteAdmission } from '../../src/modules/security/source-write-admission'

const revision = required('AE_RELEASE_SOURCE_REVISION')
const subject = required('AE_PHASE5_ADMIN_SUBJECT')
const issuer = required('AE_PHASE5_ADMIN_ISSUER')
const origin = required('AE_PHASE5_BASE_URL')
const correlationId = `release:phase5:${revision}`
const bootstrapOperationKey = `release:phase5:${revision}:bootstrap-owner-admin`
const controlOperationKey = `release:phase5:${revision}:enable-public-offering-projection`

process.stdout.write(JSON.stringify({
  identity: {
    subject,
    issuer,
    tokenIdentifier: `${issuer}|${subject}`,
  },
  bootstrapArgs: {
    reasonCode: 'phase5_release_owner_bootstrap',
    evidenceRefs: [`git:${revision}`, 'release:phase5-consumer-comparison'],
    operationKey: bootstrapOperationKey,
    correlationId,
    sourceWrite: sourceWrite(bootstrapOperationKey, '/internal/release/phase5/bootstrap-owner-admin'),
  },
  controlArgs: {
    key: 'offering_public_projection_enabled',
    enabled: true,
    reasonCode: 'phase5_public_inspect_only_comparison',
    evidenceRefs: [`git:${revision}`, 'release:phase5-consumer-comparison'],
    operationKey: controlOperationKey,
    correlationId,
    sourceWrite: sourceWrite(controlOperationKey, '/internal/release/phase5/operator-control'),
  },
}))

function sourceWrite(operationKey: string, pathname: string) {
  return createSourceWriteAdmission({
    request: {
      method: 'POST',
      origin,
      pathname,
      bodyDigest: 'none',
    },
    scope: 'admin_operator',
    operationKey,
    correlationId,
  })
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (value === undefined || value.length === 0) throw new Error(`${name}_required`)
  return value
}
