import { describeActionForAgent, findAction, listActions, resolveActionContract } from '@/modules/actions/index'

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
      contract: contract.compatibility,
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
      ['contract', row.contract],
    ])
  }
  line('')
  line('Registration alone does not create a reachable route. Run npm run audit:actions for drift.')
}

export async function runActionCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const id = args[0]?.trim()
  if (id === undefined || id.length === 0) throw new CliFailure("Usage: ae action <id> ['<json>'] [--allow-write]")

  const action = findAction(id)
  if (action === undefined) {
    throw new CliFailure(`Unknown action: ${id}\nRun: npm run ae -- actions`)
  }

  const contract = resolveActionContract(action)

  if (!action.readOnly && !options.allowWrite) {
    heading(`Refused: ${id} is not read-only`)
    line(`consequence: ${contract.consequenceClass}   authority: ${contract.authorityRequirement}`)
    line('')
    line('Boundaries:')
    for (const boundary of action.boundaries) line(`  - ${boundary}`)
    line('')
    throw new CliFailure('Pass --allow-write to run a write-classified action.')
  }

  const rawInput = args.slice(1).join(' ').trim()
  let parsedInput: unknown = {}
  if (rawInput.length > 0) {
    try {
      parsedInput = JSON.parse(rawInput)
    } catch {
      throw new CliFailure(`Input must be JSON. Received: ${rawInput.slice(0, 200)}`)
    }
  }

  const validated = action.schema.safeParse(parsedInput)
  if (!validated.success) {
    throw new CliFailure(`Input does not match ${id} schema:\n${JSON.stringify(validated.error.issues, undefined, 2)}`)
  }

  if (!options.json) {
    heading(`Running ${id}`)
    line(`consequence: ${contract.consequenceClass}   authority: ${contract.authorityRequirement}`)
    for (const boundary of action.boundaries) line(`  - ${boundary}`)
  }

  const startedAt = Date.now()
  const result = await action.run({ data: validated.data, context: { caller: 'cli' } })
  const durationMs = Date.now() - startedAt

  if (options.json) {
    printJson({ id, durationMs, result })
    return
  }

  line('')
  line(`result.kind = ${String(result.kind)} (${durationMs}ms)`)
  line(JSON.stringify(result, undefined, 2).slice(0, 4000))
}
