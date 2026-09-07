import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import {
  callRecoveryResultSchema,
  callReconcileInputSchema,
  callReconciliationEvidenceSchema,
} from '@/modules/capability-execution/call-recovery.actions'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk, table } from '../lib/output'
import { usageFailure } from '../lib/help'
import { continuationCommand } from '../lib/continuation-command'
import { recoveryTransportFailure, requireAgentAccessKey } from './status'

function recoverPath(callRef: string): string {
  return CALL_ROUTE_CONTRACT.reconcile.path.replace(
    '{callRef}',
    encodeURIComponent(callRef),
  )
}

/** Reconcile one uncertain call with explicit evidence and replay identity. */
export async function runRecoverCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const callRef = args[0]?.trim()
  const rawEvidence = args[1]?.trim()
  if (callRef === undefined || callRef.length === 0 || rawEvidence === undefined || rawEvidence.length === 0 || args.length > 2) {
    throw usageFailure('recover', 'recover-usage')
  }

  const idempotencyKey = options.idempotencyKey?.trim()
  if (idempotencyKey === undefined || idempotencyKey.length === 0) {
    throw new CliFailure('Recover requires an explicit --idempotency-key.', {
      kind: 'INVALID_ARGUMENT',
      code: 'idempotency-key-required',
    })
  }

  let evidence: unknown
  try {
    evidence = JSON.parse(rawEvidence)
  } catch {
    throw new CliFailure('Recovery evidence must be valid JSON.', {
      kind: 'INVALID_ARGUMENT',
      code: 'recover-evidence',
    })
  }
  const parsedEvidence = callReconciliationEvidenceSchema.safeParse(evidence)
  const parsedInput = callReconcileInputSchema.safeParse({ callRef, evidence, idempotencyKey })
  const identityMatchesEvidence = parsedEvidence.success && parsedEvidence.data.invocationRef === callRef
  if (!parsedEvidence.success || !parsedInput.success || !identityMatchesEvidence) {
    throw new CliFailure('Recovery evidence or identity does not match call.reconcile:v1.', {
      kind: 'INVALID_ARGUMENT',
      code: parsedEvidence.success ? 'recover-input' : 'recover-evidence',
    })
  }

  const apiKey = requireAgentAccessKey('recover', options)
  const path = recoverPath(parsedInput.data.callRef)
  let outcome
  try {
    outcome = await callJson(options.baseUrl, path, {
      method: CALL_ROUTE_CONTRACT.reconcile.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        idempotencyKey: parsedInput.data.idempotencyKey,
        evidence: parsedEvidence.data,
      }),
    })
  } catch (error) {
    if (error instanceof CliFailure) throw error
    throw recoveryTransportFailure('reconcile', parsedInput.data.callRef, parsedInput.data.idempotencyKey)
  }
  const parsedResult = callRecoveryResultSchema.safeParse(requireOk(outcome, 'Call reconciliation'))
  if (!parsedResult.success) {
    throw new CliFailure('The gateway returned an invalid recovery result.', {
      kind: 'UNAVAILABLE',
      code: 'call-recover-result-invalid',
    })
  }

  const continuationSuffix = continuationCommand([
    ...(options.baseUrlSource === undefined || options.baseUrlSource === 'hosted_default'
      ? []
      : ['--base-url', options.baseUrl]),
    ...(options.json ? ['--json'] : []),
  ])
  const statusCommand = `ae status ${parsedInput.data.callRef}`
  const nextCommand = continuationSuffix.length === 0
    ? statusCommand
    : `${statusCommand} ${continuationSuffix}`
  const rendered = {
    ...parsedResult.data,
    nextCommand,
  }
  if (options.json) {
    printJson(rendered)
    return
  }
  heading(`Call recovery ${parsedInput.data.callRef}`)
  table([
    ['status', parsedResult.data.kind],
    ['next command', rendered.nextCommand],
  ])
  line(JSON.stringify(rendered, undefined, 2))
}
