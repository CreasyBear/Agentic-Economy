import { createReadStream } from 'node:fs'
import { toolPlanQuoteAction, TOOL_PLAN_QUOTE_ROUTE_CONTRACT } from '@/modules/capability-execution/plan/quote.actions'
import { PLAN_RUNTIME_ROUTES, toolPlanRunAction, toolPlanGetAction, toolPlanCancelAction } from '@/modules/capability-execution/plan/runtime.actions'
import type { PlanGetResult } from '@/modules/capability-execution/plan/runtime.schemas'
import type { CliOptions } from '../lib/args'
import { acknowledgePurchaseRecovery, findPurchaseRecovery, readPurchaseRecovery, retainPurchaseRecovery, type PlanRecoveryRecord } from '../lib/call-recovery-journal'
import { attachPurchaseRecovery, purchaseRecoveryRequired, purchaseResumeCommand, readPurchasePrincipal, requirePurchasePrincipal } from '../lib/purchase-recovery'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import { usageFailure } from '../lib/help'
import { cliContinuation } from '../lib/continuation-command'
import { MAX_STATUS_WAIT_MS, requireAgentAccessKey } from './status'

export const planQuoteCommandDescriptor = {
  ...TOOL_PLAN_QUOTE_ROUTE_CONTRACT,
  command: 'plan',
  subcommand: 'quote',
  action: toolPlanQuoteAction,
} as const

export const planRunCommandDescriptor = { ...PLAN_RUNTIME_ROUTES.run, command: 'plan', subcommand: 'run' } as const
export const planGetCommandDescriptor = { ...PLAN_RUNTIME_ROUTES.get, command: 'plan', subcommand: 'get' } as const
export const planCancelCommandDescriptor = { ...PLAN_RUNTIME_ROUTES.cancel, command: 'plan', subcommand: 'cancel' } as const

async function readPlanFile(file: string): Promise<unknown> {
  const stream = createReadStream(file, { encoding: 'utf8' })
  let content = ''
  let size = 0
  try {
    for await (const chunk of stream) {
      size += Buffer.byteLength(chunk)
      if (size > 256 * 1024) throw new CliFailure('The Plan file is too large.', { kind: 'PAYLOAD_TOO_LARGE', code: 'payload_too_large' })
      content += chunk
    }
  } catch (error) {
    if (error instanceof CliFailure) throw error
    throw new CliFailure('The Plan file could not be read.', { kind: 'INVALID_ARGUMENT', code: 'plan-file-unreadable' })
  } finally { stream.destroy() }
  try { return JSON.parse(content) } catch {
    throw new CliFailure('The Plan file must contain valid JSON.', { kind: 'INVALID_ARGUMENT', code: 'plan-file-invalid' })
  }
}

export async function planQuoteCommand(file: string, options: CliOptions): Promise<void> {
  const parsed = toolPlanQuoteAction.schema.safeParse({ plan: await readPlanFile(file) })
  if (!parsed.success) throw new CliFailure('The file must contain a Plan with 1–10 Tool nodes.', { kind: 'INVALID_ARGUMENT', code: 'plan-input-invalid' })
  const key = requireAgentAccessKey('plan quote', options)
  const outcome = await callJson(options.baseUrl, planQuoteCommandDescriptor.path, {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify(parsed.data),
  }, 60_000)
  const result = toolPlanQuoteAction.outputSchema.safeParse(requireOk(outcome, planQuoteCommandDescriptor.path))
  if (!result.success) throw new CliFailure('The gateway returned an invalid Plan quote.', { kind: 'UNAVAILABLE', code: 'plan-quote-invalid' })
  if (options.json) { printJson(result.data); return }
  heading(result.data.kind === 'quoted' ? `Plan ${result.data.planRef}` : 'Plan refused')
  line(JSON.stringify(result.data, undefined, 2))
}

function present(value: unknown, options: CliOptions): void {
  if (options.json) printJson(value)
  else line(JSON.stringify(value, undefined, 2))
}

async function readPlan(planRef: string, options: CliOptions, timeoutMs = 30_000): Promise<PlanGetResult> {
  const parsed = toolPlanGetAction.schema.safeParse({ planRef })
  if (!parsed.success) throw usageFailure('plan get', 'plan-reference-invalid')
  const path = PLAN_RUNTIME_ROUTES.get.path.replace('{planRef}', encodeURIComponent(parsed.data.planRef))
  const outcome = await callJson(options.baseUrl, path, { method: 'GET', headers: { Authorization: `Bearer ${requireAgentAccessKey('plan get', options)}` } }, timeoutMs)
  const result = toolPlanGetAction.outputSchema.safeParse(requireOk(outcome, path))
  if (!result.success || (result.data.kind === 'available' && result.data.planRef !== planRef)) {
    throw new CliFailure('The gateway returned an invalid Plan status or changed its identity.', { kind: 'UNAVAILABLE', code: 'plan-status-invalid' })
  }
  return result.data
}

/**
 * Requires a valid Plan reference and origin-bound credential.
 * Ensures bounded reads return recorded progress or an actionable timeout.
 * Invariant: observation never creates, resumes or cancels a purchase.
 * On timeout: abort the read and preserve the same Plan, origin and output mode.
 */
async function watchPlan(planRef: string, options: CliOptions): Promise<void> {
  const deadline = Date.now() + MAX_STATUS_WAIT_MS
  let lastState: string | undefined
  while (true) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) break
    let result: PlanGetResult
    try {
      result = await readPlan(planRef, options, Math.min(30_000, remainingMs))
    } catch (error) {
      if (error instanceof CliFailure && error.code === 'request-timeout') break
      throw error
    }
    if (result.kind === 'refused' || result.state !== 'running') { present(result, options); return }
    if (!options.json && result.state !== lastState) process.stderr.write(`Plan ${planRef}: ${result.state}\n`)
    lastState = result.state
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(1_000, Math.max(0, deadline - Date.now()))))
  }
  throw new CliFailure('Plan watch timed out; read the same Plan to continue.', {
    kind: 'UNAVAILABLE', code: 'plan-watch-timeout', detail: { planRef, identityPreserved: true },
    nextCommand: cliContinuation(options, ['ae', 'plan', 'watch', planRef]),
  })
}

const terminalPlanStates = new Set(['succeeded', 'partially_succeeded', 'failed', 'cancelled', 'expired'])

async function submitRetainedPlan(record: PlanRecoveryRecord, options: CliOptions): Promise<void> {
  try {
    const route = PLAN_RUNTIME_ROUTES.run
    const key = requireAgentAccessKey('plan run', options)
    if (!options.json) process.stderr.write(`Plan run prepared. Recovery: ${purchaseResumeCommand(record, options)}\n`)
    const outcome = await callJson(options.baseUrl, route.path, { method: route.method,
      headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify(record.command) }, 60_000)
    const result = toolPlanRunAction.outputSchema.safeParse(requireOk(outcome, route.path))
    if (!result.success || (result.data.kind !== 'refused' && result.data.planRef !== record.command.planRef)) {
      throw new CliFailure('The gateway returned an invalid Plan result. Read the same Plan before retrying.', { kind: 'UNAVAILABLE', code: 'plan-result-invalid' })
    }
    await acknowledgePurchaseRecovery(record, { terminal: result.data.kind !== 'refused' && terminalPlanStates.has(result.data.state) })
    present({ ...result.data, recoveryRef: record.recoveryRef }, options)
  } catch (error) { throw attachPurchaseRecovery(error, record, options) }
}

async function resumeRetainedPlan(record: PlanRecoveryRecord, options: CliOptions): Promise<void> {
  try {
    await requirePurchasePrincipal(record, options)
    const status = await readPlan(record.command.planRef, options)
    if (status.kind === 'available' && status.approvedTotalAudUnits !== record.command.approvedTotalAudUnits) {
      throw new CliFailure('The gateway changed this Plan approved total.', { kind: 'UNAVAILABLE', code: 'purchase-recovery-identity-conflict' })
    }
    // Only the untouched quoted Plan may admit the saved command. Missing,
    // denied or already accepted work is observation only; no fallback POST.
    if (status.kind === 'available' && status.state === 'quoted') return submitRetainedPlan(record, options)
    await acknowledgePurchaseRecovery(record, { terminal: status.kind === 'available' && terminalPlanStates.has(status.state) })
    present({ ...status, recoveryRef: record.recoveryRef }, options)
  } catch (error) { throw attachPurchaseRecovery(error, record, options) }
}

async function resumePlan(args: readonly string[], options: CliOptions): Promise<void> {
  if (args.length !== 2 || options.input !== undefined || options.idempotencyKey !== undefined) {
    throw new CliFailure('Use ae plan resume <recoveryRef> without input or a new purchase key.', { kind: 'INVALID_ARGUMENT', code: 'plan-resume-usage' })
  }
  const record = readPurchaseRecovery(args[1]!, options.baseUrl, 'plan_run')
  if (record.intent !== 'plan_run') throw new Error('plan_recovery_intent_invalid')
  return resumeRetainedPlan(record, options)
}

async function runPlan(args: readonly string[], options: CliOptions): Promise<void> {
  const parsed = toolPlanRunAction.schema.safeParse({ planRef: args[1], approvedTotalAudUnits: args[2], idempotencyKey: options.idempotencyKey })
  if (!parsed.success) throw usageFailure('plan run', 'plan-command-invalid')
  const principal = await readPurchasePrincipal(options)
  const request = { intent: 'plan_run' as const, origin: options.baseUrl, ...principal, command: parsed.data }
  const previous = findPurchaseRecovery(request, options)
  if (previous !== undefined) {
    if (previous.intent !== 'plan_run') throw new Error('plan_recovery_intent_invalid')
    if (previous.command.idempotencyKey !== parsed.data.idempotencyKey) throw purchaseRecoveryRequired(previous, options)
    return resumeRetainedPlan(previous, options)
  }
  const retained = await retainPurchaseRecovery(request, options)
  if (retained.record.intent !== 'plan_run') throw new Error('plan_recovery_intent_invalid')
  if (!retained.created) throw purchaseRecoveryRequired(retained.record, options)
  return submitRetainedPlan(retained.record, options)
}

async function cancelPlan(args: readonly string[], options: CliOptions): Promise<void> {
  const parsed = toolPlanCancelAction.schema.safeParse({ planRef: args[1] })
  if (!parsed.success) throw usageFailure('plan cancel', 'plan-command-invalid')
  const route = PLAN_RUNTIME_ROUTES.cancel
  const outcome = await callJson(options.baseUrl, route.path, { method: route.method,
    headers: { Authorization: `Bearer ${requireAgentAccessKey('plan cancel', options)}` }, body: JSON.stringify(parsed.data) }, 60_000)
  const result = toolPlanCancelAction.outputSchema.safeParse(requireOk(outcome, route.path))
  if (!result.success || (result.data.kind !== 'refused' && result.data.planRef !== parsed.data.planRef)) {
    throw new CliFailure('The gateway returned an invalid Plan result. Read the same Plan before retrying.', { kind: 'UNAVAILABLE', code: 'plan-result-invalid' })
  }
  present(result.data, options)
}

export async function runPlanCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const command = args[0]
  if (command === 'resume') return resumePlan(args, options)
  if (command === 'quote' && args.length === 2) return planQuoteCommand(args[1]!, options)
  if (command === 'run' && args.length === 3) return runPlan(args, options)
  if (command === 'cancel' && args.length === 2) return cancelPlan(args, options)
  if (command === 'get' && args.length === 2) { present(await readPlan(args[1]!, options), options); return }
  if (command === 'watch' && args.length === 2) return watchPlan(args[1]!, options)
  throw usageFailure('plan', 'plan-usage')
}
