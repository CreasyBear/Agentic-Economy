import { createDevelopmentFileX402PaymentAttemptPort } from '../../src/modules/action-invocation/development-file-x402-payment-attempt-port'
import type {
  X402PaymentAttempt,
  X402PaymentAuthorizationEvent,
} from '../../src/modules/action-invocation/x402-payment-attempt'

const [command, filePath, state = 'prepared'] = process.argv.slice(2)
if (filePath === undefined) throw new Error('payment_state_path_required')

const port = createDevelopmentFileX402PaymentAttemptPort(filePath)
const event: X402PaymentAuthorizationEvent = {
  invocationRef: 'invocation:child',
  attemptRef: 'attempt:child',
  effectGeneration: 1,
  operationKey: 'operation:child',
  queryRelease: 'released',
  authorization: 'created',
  recordedAt: 1,
  challengeDigest: 'sha256:challenge',
  authorizationDigest: 'sha256:authorization',
}
const attempt: X402PaymentAttempt = {
  paymentIdentifier: 'operation:child',
  invocationRef: event.invocationRef,
  attemptRef: event.attemptRef,
  effectGeneration: event.effectGeneration,
  operationKey: event.operationKey,
  challengeDigest: event.challengeDigest!,
  scheme: 'exact',
  network: 'eip155:84532',
  asset: 'USDC',
  payTo: '0x0000000000000000000000000000000000000001',
  amount: '37',
  providerEndpoint: 'https://provider.invalid/paid',
  operationRevision: 'sha256:revision',
  authorizationDigest: event.authorizationDigest!,
  custodyRef: `sha256:${'a'.repeat(64)}`,
  state: state as X402PaymentAttempt['state'],
  preparedAt: 1,
  ...(state === 'settled'
    ? {
        observedAt: 2,
        settledAmount: { currency: 'USDC', amountMinor: 37 },
        evidenceRefs: ['sha256:settlement-evidence'],
      }
    : { evidenceRefs: [] }),
}

if (command === 'persist-then-crash') {
  port.persist({ attempt, authorizationEvent: event })
  process.kill(process.pid, 'SIGKILL')
} else if (command === 'crash-before-persist') {
  process.kill(process.pid, 'SIGKILL')
} else if (command === 'read') {
  process.stdout.write(JSON.stringify({
    attempts: port.list(),
    authorizationEvents: port.listAuthorizationEvents(),
  }))
} else {
  throw new Error('payment_child_command_invalid')
}
