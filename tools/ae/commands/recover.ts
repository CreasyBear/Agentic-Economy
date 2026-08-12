import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import {
  operationInvokeRecoveryResultSchema,
  operationReconcileInputSchema,
  operationReconciliationEvidenceSchema,
} from '@/modules/capability-execution/operation-recovery.actions'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk, table } from '../lib/output'
import { recoveryTransportFailure, requireAgentAccessKey } from './status'

function recoverPath(invocationRef: string): string {
  return OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.path.replace(
    '{invocationRef}',
    encodeURIComponent(invocationRef),
  )
}

/** Reconcile one uncertain invocation with explicit evidence and replay identity. */
export async function runRecoverCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const invocationRef = args[0]?.trim()
  const rawEvidence = args[1]?.trim()
  if (invocationRef === undefined || invocationRef.length === 0 || rawEvidence === undefined || rawEvidence.length === 0 || args.length > 2) {
    throw new CliFailure("Usage: npm run -s ae -- recover <invocation-ref> '<evidence-json>' --idempotency-key <key>", {
      kind: 'INVALID_ARGUMENT',
      code: 'recover-usage',
    })
  }

  const apiKey = requireAgentAccessKey('recover', options)
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
  const parsedEvidence = operationReconciliationEvidenceSchema.safeParse(evidence)
  const parsedInput = operationReconcileInputSchema.safeParse({ invocationRef, evidence, idempotencyKey })
  if (!parsedEvidence.success || !parsedInput.success) {
    throw new CliFailure('Recovery evidence or identity does not match operation.reconcile:v1.', {
      kind: 'INVALID_ARGUMENT',
      code: parsedEvidence.success ? 'recover-input' : 'recover-evidence',
    })
  }

  const path = recoverPath(parsedInput.data.invocationRef)
  let outcome
  try {
    outcome = await callJson(options.baseUrl, path, {
      method: OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.method,
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
    throw recoveryTransportFailure('reconcile', parsedInput.data.invocationRef, parsedInput.data.idempotencyKey)
  }
  const parsedResult = operationInvokeRecoveryResultSchema.safeParse(requireOk(outcome, path))
  if (!parsedResult.success) {
    throw new CliFailure('The gateway returned an invalid recovery result.', {
      kind: 'UNAVAILABLE',
      code: 'operation-recover-result-invalid',
    })
  }

  const rendered = {
    ...parsedResult.data,
    idempotencyKey: parsedInput.data.idempotencyKey,
    nextCommand: `npm run -s ae -- status ${parsedInput.data.invocationRef}`,
  }
  if (options.json) {
    printJson(rendered)
    return
  }
  heading(`Operation recovery ${parsedInput.data.invocationRef}`)
  table([
    ['status', parsedResult.data.kind],
    ['idempotency key', parsedInput.data.idempotencyKey],
    ['next command', rendered.nextCommand],
  ])
  line(JSON.stringify(rendered, undefined, 2))
}
