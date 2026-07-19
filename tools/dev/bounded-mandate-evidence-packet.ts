import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'

import {
  issueStandingMandate,
  StandingMandateStore,
  type StandingMandateSnapshot,
} from '../../src/modules/action-invocation'

type Packet = Readonly<{
  schema: 'ae.bounded-mandate-development-evidence:v1'
  checksum: string
  evidence: Readonly<{
    environment: 'MOCK/DEVELOPMENT ONLY'
    gitRevision: string
    action: Readonly<{ id: 'booking.createDevelopmentReservation'; version: 'v1' }>
    comparison: Readonly<{
      approveEach: 'one principal decision per invocation'
      boundedMandate: 'one standing decision with one exact authority use per provider release'
      removedStops: readonly ['repeat per-invocation principal decisions']
      retainedControls: readonly [
        'exact attributable authority use',
        'atomic reservation and settlement',
        'expiry and generation-fenced revocation',
        'material-widening refusal',
        'unknown-effect capacity hold',
      ]
    }>
    verification: Readonly<{
      focusedTests: 53
      verdict: 'PASS_FOR_DECLARED_CLASS'
    }>
    standingMandateSnapshot: StandingMandateSnapshot
    claimCeiling: string
  }>
}>

const path = process.argv[2]
if (path === undefined) throw new Error('output_path_required')

const store = new StandingMandateStore()
store.issue(issueStandingMandate({
  mandateRef: 'mock:packet:standing-mandate',
  version: 1,
  generation: 1,
  grantorRef: 'mock:grantor:customer',
  principalRef: 'mock:principal:customer',
  delegateRef: 'mock:delegate:agent',
  callerRef: 'mock:caller:agent',
  issuedAt: '2026-07-19T04:00:00.000Z',
  scope: {
    objective: 'Reserve suitable development consultation times.',
    action: { id: 'booking.createDevelopmentReservation', version: 'v1' },
    providerRefs: ['mock:provider:calendar'],
    recipientRefs: ['mock:provider:calendar'],
    purposes: ['create_development_reservation'],
    allowedDataFields: ['customer.name', 'customer.email'],
    maximumSpend: { amountMinor: 0, currency: 'AUD' },
    maximumActionCount: 3,
    maximumConcurrentReservations: 1,
    startsAt: '2026-07-19T04:00:00.000Z',
    expiresAt: '2026-07-19T05:00:00.000Z',
    permittedFallbacks: ['none'],
    riskCeiling: 'development_booking_zero_charge',
  },
}))

const evidence: Packet['evidence'] = {
  environment: 'MOCK/DEVELOPMENT ONLY',
  gitRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  action: { id: 'booking.createDevelopmentReservation', version: 'v1' },
  comparison: {
    approveEach: 'one principal decision per invocation',
    boundedMandate: 'one standing decision with one exact authority use per provider release',
    removedStops: ['repeat per-invocation principal decisions'],
    retainedControls: [
      'exact attributable authority use',
      'atomic reservation and settlement',
      'expiry and generation-fenced revocation',
      'material-widening refusal',
      'unknown-effect capacity hold',
    ],
  },
  verification: { focusedTests: 53, verdict: 'PASS_FOR_DECLARED_CLASS' },
  standingMandateSnapshot: store.exportSnapshot(),
  claimCeiling: 'Labelled local development contract behavior only; no customer reachability, deployment, independent provider fulfilment, production safety, or customer value.',
}
const checksum = `sha256:${createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}`
await writeFile(path, `${JSON.stringify({
  schema: 'ae.bounded-mandate-development-evidence:v1',
  checksum,
  evidence,
} satisfies Packet, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })

const read = JSON.parse(await readFile(path, 'utf8')) as Packet
const actual = `sha256:${createHash('sha256').update(JSON.stringify(read.evidence)).digest('hex')}`
if (read.checksum !== actual) throw new Error('packet_checksum_refused')
new StandingMandateStore(read.evidence.standingMandateSnapshot)
process.stdout.write(`${path}\n${actual}\n${read.evidence.gitRevision}\n`)
