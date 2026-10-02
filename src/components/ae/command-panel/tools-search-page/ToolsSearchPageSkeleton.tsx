'use client'

import { Command, CommandInput, CommandList } from '@/components/ui/command'
import '../CommandPanelComposition.css'

export function ToolsSearchPageSkeleton() {
  return (
    <Command
      label="Search Tools"
      shouldFilter={false}
      className="arc-market arc-command-search"
    >
      <CommandInput
        disabled
        aria-label="Search Tools"
        placeholder="Search Tools…"
        value=""
      />
      <CommandList
        label="Matching Tools"
        aria-busy
      />
    </Command>
  )
}
