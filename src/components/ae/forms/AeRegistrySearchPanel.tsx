'use client'

import { useNavigate } from '@tanstack/react-router'

import { AeAnswerSuggestions } from '@/components/ae/chat/AeSuggestionChips'
import { AePublicSearchBar } from '@/components/ae/forms/AePublicSearchBar'

const REGISTRY_EXAMPLES = [
  'plumber parramatta',
  'locksmith cbd',
  'electrician footscray',
] as const

export type AeRegistrySearchPanelProps = {
  query: string
  limit: number
}

export function AeRegistrySearchPanel({ query, limit }: AeRegistrySearchPanelProps) {
  const navigate = useNavigate()

  return (
    <div className="grid gap-3">
      <AeAnswerSuggestions
        variant="landing"
        aria-label="Example registry searches"
        suggestions={REGISTRY_EXAMPLES}
        onSelect={(example) => {
          void navigate({ to: '/registry', search: { q: example, limit } })
        }}
      />
      <AePublicSearchBar
        key={query}
        id="registry-q"
        name="q"
        label="Business, service, or place"
        defaultValue={query}
        placeholder="emergency plumber parramatta"
        submitLabel="Search businesses"
        action="/registry"
        hiddenFields={[{ name: 'limit', value: String(limit) }]}
      />
    </div>
  )
}
