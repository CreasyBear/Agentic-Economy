'use client'

import { Monitor, Moon, Settings2, Sun } from 'lucide-react'

import { useAppearance } from '@/components/ae/theme/ThemeProvider'
import { Button } from '@/components/arc/button/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  DEFAULT_APPEARANCE_PREFERENCE,
  type AppearancePreference,
} from '@/lib/theme/theme-mode'
import './app-shell/WorkspaceNavigationComposition.css'

type ThemeOption = { value: AppearancePreference; label: string; icon: typeof Sun }

const SYSTEM_OPTION: ThemeOption = { value: 'system', label: 'System', icon: Monitor }

const OPTIONS: readonly ThemeOption[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  SYSTEM_OPTION,
]

const DEFAULT_OPTION: ThemeOption =
  OPTIONS.find((option) => option.value === DEFAULT_APPEARANCE_PREFERENCE) ?? SYSTEM_OPTION

export function ThemeToggle({ workspace = false }: { workspace?: boolean }) {
  const { preference, setPreference, sidebarVisible, setSidebarVisible } = useAppearance()
  const activeOption =
    OPTIONS.find((option) => option.value === preference) ?? DEFAULT_OPTION
  const ActiveIcon = workspace ? Settings2 : activeOption.icon
  const currentLabel = activeOption.label

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="md" className="arc-market arc-workspace-menu-trigger" data-workspace-display-settings={workspace ? '' : undefined} aria-label={workspace ? 'Display settings' : `Appearance: ${currentLabel}`} />}
      >
        <ActiveIcon aria-hidden="true" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="arc-market arc-workspace-menu arc-theme-menu">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => setPreference(value as AppearancePreference)}
        >
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="arc-theme-menu-item">
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {workspace ? <DropdownMenuGroup className="hidden md:block">
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={sidebarVisible} onCheckedChange={setSidebarVisible} className="arc-theme-menu-item">
            Show sidebar
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
