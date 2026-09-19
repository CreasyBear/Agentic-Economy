'use client'

import { Monitor, Moon, Sun } from 'lucide-react'

import { TACTILE } from '@/components/ae/feedback/AeEmptyState'
import { useAppearance } from '@/components/ae/theme/ThemeProvider'
import { buttonVariants } from '@/components/ui/button-variants'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { AppearancePreference } from '@/lib/theme/theme-mode'

const OPTIONS: { value: AppearancePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function ThemeToggle() {
  const { preference, setPreference } = useAppearance()
  const activeOption =
    OPTIONS.find((option) => option.value === preference) ?? OPTIONS[2]!
  const ActiveIcon = activeOption.icon
  const currentLabel = activeOption.label

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Appearance: ${currentLabel}`}
        className={cn(
          buttonVariants({
            variant: 'ghost',
            size: 'icon',
            className: cn('size-8 shrink-0', TACTILE),
          }),
        )}
      >
        <ActiveIcon aria-hidden="true" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-[9.5rem]">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => setPreference(value as AppearancePreference)}
        >
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
