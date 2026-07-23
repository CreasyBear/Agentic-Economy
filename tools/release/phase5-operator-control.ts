import { createSourceWriteAdmission } from '../../src/modules/security/source-write-admission'

const revision = required('AE_RELEASE_SOURCE_REVISION')
const subject = required('AE_PHASE5_ADMIN_SUBJECT')
const issuer = required('AE_PHASE5_ADMIN_ISSUER')
const origin = required('AE_PHASE5_BASE_URL')
const operationKey = `release:phase5:${revision}:enable-public-offering-projection`
const correlationId = `release:phase5:${revision}`

const sourceWrite = createSourceWriteAdmission({
  request: {
    method: 'POST',
    origin,
    pathname: '/internal/release/phase5/operator-control',
    bodyDigest: 'none',
  },
  scope: 'admin_operator',
  operationKey,
  correlationId,
})

process.stdout.write(JSON.stringify({
  identity: {
    subject,
    issuer,
    tokenIdentifier: `phase5-release|${subject}`,
  },
  args: {
    key: 'offering_public_projection_enabled',
    enabled: true,
    reasonCode: 'phase5_public_inspect_only_comparison',
    evidenceRefs: [`git:${revision}`, 'release:phase5-consumer-comparison'],
    operationKey,
    correlationId,
    sourceWrite,
  },
}))

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (value === undefined || value.length === 0) throw new Error(`${name}_required`)
  return value
}
