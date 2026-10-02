import type { ComponentProps } from 'react'
import type { Button } from '@/components/ui/button'
import type { ScrollArea } from '@/components/ui/scroll-area'

export type SuggestionsProps = ComponentProps<typeof ScrollArea>
export type SuggestionProps = Omit<ComponentProps<typeof Button>, 'onClick'> & Readonly<{
  suggestion: string
  onClick?: (suggestion: string) => void
}>
