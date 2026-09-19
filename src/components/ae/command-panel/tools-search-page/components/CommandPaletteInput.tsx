'use client'

import type { RefObject } from 'react'

import { CommandInput } from '@/components/ui/command'

export type CommandPaletteInputProps = Readonly<{
  inputRef: RefObject<HTMLInputElement | null>
  isActive: boolean
  query: string
  onValueChange: (query: string) => void
}>

export function CommandPaletteInput({
  inputRef,
  isActive,
  query,
  onValueChange,
}: CommandPaletteInputProps) {
  return (
    <CommandInput
      ref={inputRef}
      disabled={!isActive}
      aria-label="Search Tools"
      placeholder="Search Tools…"
      value={query}
      onValueChange={onValueChange}
      className="h-12 py-0"
    />
  )
}
