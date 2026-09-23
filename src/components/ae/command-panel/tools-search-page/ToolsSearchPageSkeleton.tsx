'use client'

import { Command, CommandInput, CommandList } from '@/components/ui/command'

export function ToolsSearchPageSkeleton() {
  return (
    <Command
      label="Search Tools"
      shouldFilter={false}
      className="min-h-0 flex-1 [&_[data-slot=command-input-wrapper]]:h-12 [&_[data-slot=command-input-wrapper]]:shrink-0 [&_[data-slot=command-input-wrapper]]:border-border [&_[data-slot=command-input-wrapper]]:px-gutter [&_[data-slot=command-input]]:text-sm"
    >
      <CommandInput
        disabled
        aria-label="Search Tools"
        placeholder="Search Tools…"
        value=""
        className="h-12 py-0"
      />
      <CommandList
        label="Matching Tools"
        aria-busy
        className="min-h-0 max-h-none flex-1 overscroll-contain"
      />
    </Command>
  )
}
