import { projectChatChoiceActions } from '@/modules/chat/tool-card-actions'
import { CHAT_TOOL_NAME_MAP, projectToolCard, type ToolCardProjection } from '@/modules/chat/tool-card'
import { chatSearchResolution } from '../tools/step'

type CompletedStep = Readonly<{
  toolResults: readonly Readonly<{ toolName: string; output: unknown }>[]
}>

/** Only completed Tool outputs become answer facts; a tool call alone proves no result. */
export function completedChatFacts(steps: readonly CompletedStep[]): string | null {
  const results = steps.flatMap(step => step.toolResults)
  const search = results.filter(result =>
    result.toolName === CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search'])
  const searchAnswer = search.length === 0 ? null : chatSearchResolution([{ toolResults: search }])
  const facts: string[] = []
  const cards: ToolCardProjection[] = []
  for (const result of results) {
    const card = projectToolCard({
      type: 'dynamic-tool', toolName: result.toolName, state: 'output-available', output: result.output,
    })
    if (card !== null) cards.push(card)
    if (card?.kind === 'execute') {
      const reference = card.callRef === undefined ? '' : ` CallRef: ${card.callRef}.`
      const output = card.outputPreview === undefined ? '' : ` Returned output: ${JSON.stringify(card.outputPreview)}.`
      const details = card.facts.map(fact => `${fact.label}: ${fact.value}`).join('; ')
      facts.push(`**Call ${card.state}.**${reference} ${card.summary}${output}${details ? ` ${details}.` : ''}${card.state === 'reconciliation_required' ? ' Do not send another Call until this one is reconciled.' : ''}`)
    } else if (card?.kind === 'inspect' && card.facts.length > 0) {
      facts.push(`**Current Quote terms:** ${card.facts.map(fact => `${fact.label}: ${fact.value}`).join('; ')}.`)
    }
  }
  const choices = projectChatChoiceActions(cards)
  const details = choices.filter(choice => choice.toolId === 'registry.tools.describe')
  const selected = details.length > 0 ? details : choices
  const next = selected.some(choice => choice.reviewInputs)
    ? 'Choose Review inputs on the eligible Tool card.'
    : selected.length > 1 && selected.every(choice => choice.compare)
      ? 'Select Compare on their cards to inspect the reported facts.'
      : 'Open a Tool card to check its exact inputs and current terms.'
  const choiceAnswer = selected.length === 0 ? null
    : `**Tools to inspect:** ${selected.map(({ choice }) =>
      `${choice.title}${choice.price === undefined ? '' : ` (${choice.price})`}${choice.readiness === undefined ? '' : ` — ${choice.readiness}`}`)
      .join('; ')}. Next: ${next}`
  return facts.findLast(fact => fact.startsWith('**Call '))
    ?? facts.findLast(fact => fact.startsWith('**Current Quote '))
    ?? (details.length > 0 ? choiceAnswer : searchAnswer ?? choiceAnswer)
    ?? facts.at(-1)
    ?? null
}

function unwrapToolOutput(output: unknown): unknown {
  if (typeof output === 'object' && output !== null && 'type' in output && 'value' in output
    && (output.type === 'json' || output.type === 'text')) return output.value
  return output
}

/** Completed tool messages from this turn, not a model narration. */
export function factsFromSavedTurn(messages: readonly { role?: string; content?: unknown }[]): string | null {
  const toolResults: { toolName: string; output: unknown }[] = []
  for (const message of messages) {
    if (message.role !== 'tool' || !Array.isArray(message.content)) continue
    for (const part of message.content) {
      if (typeof part !== 'object' || part === null || !('type' in part) || part.type !== 'tool-result') continue
      if (!('toolName' in part) || typeof part.toolName !== 'string') continue
      toolResults.push({ toolName: part.toolName, output: 'output' in part ? unwrapToolOutput(part.output) : undefined })
    }
  }
  return toolResults.length === 0 ? null : completedChatFacts([{ toolResults }])
}

