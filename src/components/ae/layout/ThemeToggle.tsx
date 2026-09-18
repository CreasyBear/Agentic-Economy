'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'

import { useAppearance } from '@/components/ae/theme/ThemeProvider'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import type { AppearancePreference } from '@/lib/theme/theme-mode'

const OPTIONS: { value: AppearancePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function ThemeToggle() {
  const { preference, setPreference } = useAppearance()
  const [open, setOpen] = useState(false)
  const ActiveIcon = OPTIONS.find((option) => option.value === preference)?.icon ?? Monitor

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Appearance"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(buttonVariants({ variant: 'ghost', size: 'icon', className: 'size-9 shrink-0' }))}
        onClick={() => setOpen((current) => !current)}
      >
        <ActiveIcon aria-hidden="true" className="size-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-20 mb-1 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-soft"
        >
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitem"
              className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
              onClick={() => {
                setPreference(value)
                setOpen(false)
              }}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
