'use client'

import { useEffect, useState } from 'react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import {
  listOperatorCommandDestinations,
  type OperatorCommandDestination,
  type OperatorRole,
} from '@/lib/operator/navigation'

type AeOperatorCommandMenuProps = {
  role: OperatorRole
}

export function AeOperatorCommandMenu({ role }: AeOperatorCommandMenuProps) {
  const [open, setOpen] = useState(false)
  const destinations = listOperatorCommandDestinations(role)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="hidden min-h-10 gap-2 md:inline-flex"
        onClick={() => setOpen(true)}
      >
        Jump to…
        <CommandShortcut>⌘K</CommandShortcut>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="min-h-10 min-w-10 md:hidden"
        aria-label="Jump to page"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">⌘K</span>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Jump to page" description="Search operator pages and public surfaces.">
        <CommandInput placeholder="Search pages…" />
        <CommandList>
          <CommandEmpty>No matching page.</CommandEmpty>
          {destinations.map((group, index) => (
            <CommandDestinationGroup
              key={group.id}
              group={group}
              onSelect={() => setOpen(false)}
              showSeparator={index > 0}
            />
          ))}
        </CommandList>
      </CommandDialog>
    </>
  )
}

function CommandDestinationGroup({
  group,
  onSelect,
  showSeparator,
}: {
  group: { id: string; label: string; items: readonly OperatorCommandDestination[] }
  onSelect: () => void
  showSeparator: boolean
}) {
  return (
    <>
      {showSeparator ? <CommandSeparator /> : null}
      <CommandGroup heading={group.label}>
        {group.items.map((item) => {
          const Icon = item.icon
          return (
            <CommandItem
              key={item.href}
              value={`${item.label} ${item.href}`}
              onSelect={() => {
                window.location.assign(item.href)
                onSelect()
              }}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
              {item.hint === undefined ? null : (
                <span className="ml-1 text-xs text-muted-foreground">{item.hint}</span>
              )}
            </CommandItem>
          )
        })}
      </CommandGroup>
    </>
  )
}
