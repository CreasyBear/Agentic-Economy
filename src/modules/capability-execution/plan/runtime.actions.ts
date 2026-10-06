import { defineAction } from '@/modules/common/action'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import type { PlanRunInput, PlanRunResult } from './contracts'
import { planGetResultSchema, planReferenceInputSchema, planRunInputSchema, planRunResultSchema,
  type PlanGetResult, type PlanReferenceInput } from './runtime.schemas'

export const PLAN_RUNTIME_ROUTES = {
  run: { actionId: 'tool.plan.run', contractVersion: 'tool.plan.run:v1', method: 'POST', path: '/api/v1/tools/plans/run', routerPath: '/api/v1/tools/plans/run', requiredHeaders: ['Authorization', 'Content-Type'] },
  get: { actionId: 'tool.plan.get', contractVersion: 'tool.plan.get:v1', method: 'GET', path: '/api/v1/tools/plans/{planRef}', routerPath: '/api/v1/tools/plans/$planRef', requiredHeaders: ['Authorization'] },
  cancel: { actionId: 'tool.plan.cancel', contractVersion: 'tool.plan.cancel:v1', method: 'POST', path: '/api/v1/tools/plans/cancel', routerPath: '/api/v1/tools/plans/cancel', requiredHeaders: ['Authorization', 'Content-Type'] },
} as const
const referenceParameter = { name: 'planRef', type: 'string' as const, required: true, description: 'The Plan reference returned by a Plan quote.' }
const credentialAdmission = { scope: MARKET_TOOLS_CALL_SCOPE, authority: 'descriptor_classified' as const }
const ownerBoundary = 'Scoped to the authenticated Agent and Account.'

export const toolPlanRunAction = defineAction<PlanRunInput, PlanRunResult>({
  id: PLAN_RUNTIME_ROUTES.run.actionId, name: 'Run a Tool Plan',
  summary: 'Approve the exact quoted AUD exposure once and execute the frozen Plan through ordinary Calls.',
  boundaries: [ownerBoundary, 'Exact total checked before replay. Reuse the same key after interruption; each node keeps its Call receipt.'],
  schema: planRunInputSchema, outputSchema: planRunResultSchema,
  parameters: [referenceParameter,
    { name: 'approvedTotalAudUnits', type: 'string', required: true, description: 'Exact quoted AUD micro-units, copied without rounding.' },
    { name: 'idempotencyKey', type: 'string', required: true, description: 'Stable key for this one Plan run.' }],
  readOnly: false, surfaces: ['http', 'mcp', 'cli', 'chat'], credentialAdmission,
  effect: { class: 'external_state_change', reversible: false, recipientKind: 'provider_system', dataClasses: ['tool_input', 'tool_output', 'usage_evidence'], spendExposure: 'bounded', approval: 'policy_eligible' },
  mcp: { idempotent: true, openWorld: true, destructive: true },
  invocationContract: { version: PLAN_RUNTIME_ROUTES.run.contractVersion, consequenceClass: 'external_effect',
    materialInputPaths: ['planRef', 'approvedTotalAudUnits', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'reconcile_before_retry',
    expectedEvidence: ['plan_status', 'call_result'], safeContinuations: ['tool.plan.get', 'tool.plan.cancel'],
    invalidationConditions: ['plan_quote_expired', 'plan_changed', 'grant_changed', 'approved_total_mismatch'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined || context.callService?.planRun === undefined) throw new Error('tool_plan_run_unavailable')
    return context.callService.planRun({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? crypto.randomUUID() })
  },
})

export const toolPlanGetAction = defineAction<PlanReferenceInput, PlanGetResult>({
  id: PLAN_RUNTIME_ROUTES.get.actionId, name: 'Read Tool Plan', summary: 'Read the current Plan, held exposure and every admitted Call result.',
  boundaries: [ownerBoundary, 'Amounts and outputs come from recorded Calls; unknown money stays unconfirmed.'],
  schema: planReferenceInputSchema, outputSchema: planGetResultSchema, parameters: [referenceParameter],
  readOnly: true, surfaces: ['http', 'mcp', 'cli', 'chat'], credentialAdmission,
  effect: { class: 'observation', reversible: true, recipientKind: 'none', dataClasses: ['call_status', 'usage_evidence'], spendExposure: 'none', approval: 'none' },
  invocationContract: { version: PLAN_RUNTIME_ROUTES.get.contractVersion, consequenceClass: 'read_only', materialInputPaths: ['planRef'],
    authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['plan_status', 'call_result'],
    safeContinuations: ['tool.plan.get', 'tool.plan.cancel'], invalidationConditions: ['plan_access_denied'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined || context.callService?.planGet === undefined) throw new Error('tool_plan_get_unavailable')
    return context.callService.planGet({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? crypto.randomUUID() })
  },
})

export const toolPlanCancelAction = defineAction<PlanReferenceInput, PlanRunResult>({
  id: PLAN_RUNTIME_ROUTES.cancel.actionId, name: 'Cancel Tool Plan', summary: 'Stop new node admissions and release proven unused credit after accepted Calls conclude.',
  boundaries: [ownerBoundary, 'Stops future admissions. Admitted Calls retain their financial and recovery controls; no rollback promise.'],
  schema: planReferenceInputSchema, outputSchema: planRunResultSchema, parameters: [referenceParameter],
  readOnly: false, surfaces: ['http', 'mcp', 'cli'], credentialAdmission,
  effect: { class: 'commitment', reversible: false, recipientKind: 'none', dataClasses: ['call_control'], spendExposure: 'none', approval: 'none' },
  mcp: { idempotent: true, openWorld: false, destructive: true },
  invocationContract: { version: PLAN_RUNTIME_ROUTES.cancel.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['planRef'],
    authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['plan_status'], safeContinuations: ['tool.plan.get'], invalidationConditions: ['plan_access_denied'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined || context.callService?.planCancel === undefined) throw new Error('tool_plan_cancel_unavailable')
    return context.callService.planCancel({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? crypto.randomUUID() })
  },
})
