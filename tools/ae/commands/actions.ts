import { describeActionForAgent, findAction, listActions, resolveActionContract } from '@/modules/actions/index'
import { OPERATION_INVOKE_ACTION_ID } from '@/modules/capability-execution/operation-invoke-entry'

import type { CliOptions } from '../lib/args'
import { CliFailure, heading, line, printJson, table } from '../lib/output'
/**
 * Generic dispatch by name over the real registry. No HTTP, no per-action
 * codegen: whatever is registered is what the CLI can see and run.
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

  const rawInput = args.slice(1).join(' ').trim()
  let parsedInput: unknown = {}
  if (id === OPERATION_INVOKE_ACTION_ID) {
    throw new CliFailure('Use `npm run -s ae -- invoke` so operation.invoke runs through the authenticated HTTP gateway.', {
      kind: 'PERMISSION_DENIED',
      code: 'operation_invoke_requires_gateway',
    })
  }
  if (rawInput.length > 0) {
    try {
      parsedInput = JSON.parse(rawInput)
    } catch {
      throw new CliFailure('Input must be valid JSON.', { kind: 'INVALID_ARGUMENT', code: 'action-input' })
    }
  }

  const action = findAction(id)
  if (action === undefined) {
    throw new CliFailure(`Unknown action: ${id}\nRun: npm run -s ae -- advanced actions`, { kind: 'NOT_FOUND', code: 'unknown_action' })
  }
  if (!action.readOnly && !options.allowWrite) {
    throw new CliFailure('Pass --allow-write to run a write-classified action.', { kind: 'PERMISSION_DENIED', code: 'write_requires_allow' })
  }

  const validated = action.schema.safeParse(parsedInput)
  if (!validated.success) {
    throw new CliFailure(`Input does not match ${id} schema:\n${JSON.stringify(validated.error.issues, undefined, 2)}`, { kind: 'INVALID_ARGUMENT', code: 'action-schema' })
  }

  const startedAt = Date.now()
  const result = await action.run({ data: validated.data, context: { caller: 'cli' } })
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
