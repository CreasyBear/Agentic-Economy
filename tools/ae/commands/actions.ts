import { describeActionForAgent, findAction, listActions, mcpToolName, resolveActionContract, type AnyAction } from '@/modules/actions/index'
import { isRecord } from '@/modules/common/is-record'
import type { ActionResult } from '@/modules/common/action'
import { OPERATION_INVOKE_ACTION_ID } from '@/modules/capability-execution/operation-invoke-entry'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk, table } from '../lib/output'
import { requireAgentAccessKey } from './status'
/**
 * Generic dispatch by name over the real registry. Registration is visible in
 * the inventory; execution still requires the action to declare the CLI surface.
 */
export async function runActionsCommand(_args: readonly string[], options: CliOptions): Promise<void> {
  const rows = listActions().map((action) => {
    const descriptor = describeActionForAgent(action)
    const contract = resolveActionContract(action)
    return {
      id: descriptor.id,
      name: descriptor.name,
      readOnly: descriptor.readOnly,
      surfaces: action.surfaces,
      consequenceClass: contract.consequenceClass,
      authorityRequirement: contract.authorityRequirement,
      contract,
      hasInputSchema: descriptor.inputJsonSchema !== undefined,
    }
  })

  if (options.json) {
    printJson(rows)
    return
  }

  heading(`Registered actions (${rows.length})`)
  for (const row of rows) {
    line('')
    table([
      ['id', row.id],
      ['name', row.name],
      ['readOnly', String(row.readOnly)],
      ['surfaces', row.surfaces.join(', ')],
      ['consequence', row.consequenceClass],
      ['authority', row.authorityRequirement],
      ['contract', JSON.stringify(row.contract)],
    ])
  }
  line('')
  line('Registration alone does not create a reachable route. Run npm run audit:actions for drift.')
}

async function runCredentialAdmittedAction(
  action: AnyAction,
  data: unknown,
  options: CliOptions,
): Promise<ActionResult> {
  const apiKey = requireAgentAccessKey(`action ${action.id}`, options)
  const outcome = await callJson(options.baseUrl, '/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'cli-action',
      method: 'tools/call',
      params: {
        name: mcpToolName(action),
        arguments: data,
      },
    }),
  })
  const body = requireOk(outcome, '/mcp')
  const structuredResult = isRecord(body)
    && isRecord(body.result)
    && isRecord(body.result.structuredContent)
    ? body.result.structuredContent.result
    : undefined
  if (!isRecord(structuredResult) || typeof structuredResult.kind !== 'string') {
    throw new CliFailure('The MCP action returned an invalid result.', {
      kind: 'UNAVAILABLE',
      code: 'mcp_action_result_invalid',
    })
  }
  return structuredResult as ActionResult
}

export async function runActionCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const id = args[0]?.trim()
  const usage = "Usage: npm run -s ae -- advanced action <id> ['<json>'] [--allow-write]"
  if (id === undefined || id.length === 0) {
    if (!options.allowWrite) {
      throw new CliFailure('Pass --allow-write to run a write-classified action.', {
        kind: 'PERMISSION_DENIED',
        code: 'write_requires_allow',
      })
    }
    throw new CliFailure(usage, { kind: 'INVALID_ARGUMENT', code: 'action-usage' })
  }

  if (args.length === 1 && /^[\[{"]/u.test(id)) {
    try {
      JSON.parse(id)
    } catch {
      throw new CliFailure('Input must be valid JSON.', { kind: 'INVALID_ARGUMENT', code: 'action-input' })
    }
    throw new CliFailure(usage, { kind: 'INVALID_ARGUMENT', code: 'action-usage' })
  }

  if (id === OPERATION_INVOKE_ACTION_ID) {
    throw new CliFailure('Use `npm run -s ae -- invoke` so operation.invoke runs through the authenticated HTTP gateway.', {
      kind: 'PERMISSION_DENIED',
      code: 'operation_invoke_requires_gateway',
    })
  }

  const action = findAction(id)
  if (action === undefined) {
    throw new CliFailure(`Unknown action: ${id}\nRun: npm run -s ae -- advanced actions`, { kind: 'NOT_FOUND', code: 'unknown_action' })
  }
  if (!action.surfaces.includes('cli')) {
    throw new CliFailure(`Action ${id} is not declared for the CLI surface.`, {
      kind: 'PERMISSION_DENIED',
      code: 'surface_not_allowed',
    })
  }

  const rawInput = args.slice(1).join(' ').trim()
  let parsedInput: unknown = {}
  if (rawInput.length > 0) {
    try {
      parsedInput = JSON.parse(rawInput)
    } catch {
      throw new CliFailure('Input must be valid JSON.', { kind: 'INVALID_ARGUMENT', code: 'action-input' })
    }
  }

  if (!action.readOnly && !options.allowWrite) {
    throw new CliFailure('Pass --allow-write to run a write-classified action.', { kind: 'PERMISSION_DENIED', code: 'write_requires_allow' })
  }

  const validated = action.schema.safeParse(parsedInput)
  if (!validated.success) {
    throw new CliFailure(`Input does not match ${id} schema:\n${JSON.stringify(validated.error.issues, undefined, 2)}`, { kind: 'INVALID_ARGUMENT', code: 'action-schema' })
  }

  const startedAt = Date.now()
  const result = action.credentialAdmission === undefined
    ? await action.run({ data: validated.data, context: { caller: 'cli' } })
    : await runCredentialAdmittedAction(action, validated.data, options)
  const durationMs = Date.now() - startedAt

  if (options.json) {
    printJson({ id, durationMs, result })
    return
  }
  line(`Ran ${id}`)

  line('')
  line(`result.kind = ${String(result.kind)} (${durationMs}ms)`)
  line(JSON.stringify(result, undefined, 2).slice(0, 4000))
}
