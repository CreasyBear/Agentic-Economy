import { Text } from '@astryxdesign/core/Text'

/**
 * Openings drawn from businesses that are actually registered right now.
 *
 * A blank input is the hardest thing to answer, and an invented example teaches
 * the wrong thing. Each opening below is generated from a real published
 * category and place, so the front door shows what AE can genuinely reach
 * instead of a decorative sample. When nothing is published the strip renders
 * nothing rather than inventing supply.
 */

export type StarterPrompt = Readonly<{
  id: string
  label: string
  prompt: string
}>

export function AeStarterPrompts({ prompts, onChoose }: {
  prompts: readonly StarterPrompt[]
  onChoose: (prompt: string) => void
}) {
  if (prompts.length === 0) return null
  return <section className="mx-auto grid w-full max-w-3xl gap-3" aria-labelledby="starter-prompts-heading">
    <Text id="starter-prompts-heading" type="supporting" color="secondary" className="block text-center">
      Registered right now
    </Text>
    <ul className="flex flex-wrap justify-center gap-2">
      {prompts.map((starter) => <li key={starter.id}>
        <button
          type="button"
          onClick={() => onChoose(starter.prompt)}
          className="min-h-11 rounded-full border border-border bg-card px-4 text-sm text-primary transition-[background-color,border-color] duration-150 hover:border-accent hover:bg-accent-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {starter.label}
        </button>
      </li>)}
    </ul>
  </section>
}

/**
 * Turns published listings into openings a person would actually type. One per
 * category so the strip shows breadth of supply rather than repeating a suburb.
 */
export function starterPromptsFromSupply(
  listings: readonly Readonly<{ category: string; suburb: string; stateTerritory: string }>[],
): readonly StarterPrompt[] {
  const byCategory = new Map<string, StarterPrompt>()
  for (const listing of listings) {
    const category = listing.category.trim()
    const suburb = listing.suburb.trim()
    if (category.length === 0 || suburb.length === 0) continue
    const key = category.toLowerCase()
    if (byCategory.has(key)) continue
    byCategory.set(key, {
      id: key,
      label: `${category} in ${suburb}`,
      prompt: `I need ${lowerFirst(category)} in ${suburb}, ${listing.stateTerritory.trim()}.`,
    })
  }
  return [...byCategory.values()].slice(0, 6)
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1)
}
