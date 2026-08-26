'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { ArrowUpRightIcon, SearchIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

export type AeCommandDestination = {
  id: string
  label: string
  href: string
  group: string
  hint?: string
  keywords?: readonly string[]
  icon?: LucideIcon
  params?: Record<string, unknown>
  search?: Record<string, unknown>
}

export function AeRouteCommandMenu({
  label = 'Search',
  destinations,
  triggerClassName,
  mobile = false,
  open: openProp,
  onOpenChange,
}: {
  label?: string
  destinations: readonly AeCommandDestination[]
  triggerClassName?: string
  mobile?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const setOpen = onOpenChange ?? setUncontrolledOpen
  const open = onOpenChange === undefined ? uncontrolledOpen : (openProp ?? false)
  const commandContentId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const previousOpenRef = useRef(false)
  const router = useRouter()
  const groupedDestinations = useMemo(() => {
    const groups = new Map<string, AeCommandDestination[]>()
    // Object.groupBy needs Chrome 117+; no declared browser floor (vite default chrome111) — recorded adoption limit, see T42
    for (const destination of destinations) {
      const group = groups.get(destination.group)
      if (group === undefined) {
        groups.set(destination.group, [destination])
      } else {
        group.push(destination)
      }
    }
    return [...groups.entries()]
  }, [destinations])

  function focusTrigger() {
    window.setTimeout(() => {
      const currentTrigger = triggerRef.current
      if (currentTrigger !== null) {
        const styles = getComputedStyle(currentTrigger)
        if (currentTrigger.isConnected && styles.display !== 'none' && styles.visibility !== 'hidden') {
          currentTrigger.focus()
          return
        }
      }

      const visibleTrigger = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-route-command-trigger]')).find((candidate) => {
        const styles = getComputedStyle(candidate)
        return candidate.isConnected && styles.display !== 'none' && styles.visibility !== 'hidden'
      })
      if (visibleTrigger !== undefined) {
        visibleTrigger.focus()
        return
      }

      const sidebarTrigger = document.querySelector<HTMLButtonElement>('[data-sidebar="trigger"]')
      if (sidebarTrigger !== null) {
        sidebarTrigger.focus()
      }
    }, 0)
  }

  useEffect(() => {
    if (previousOpenRef.current && !open) {
      focusTrigger()
    }
    previousOpenRef.current = open
  }, [open])

  function closeRouteMenu() {
    setOpen(false)
    focusTrigger()
  }
  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
  }
  function navigateToDestination(destination: AeCommandDestination) {
    const navigation = router.navigate({
      to: destination.href,
      ...(destination.params === undefined ? {} : { params: destination.params }),
      ...(destination.search === undefined ? {} : { search: destination.search }),
    })
    closeRouteMenu()
    void navigation.then(focusTrigger, focusTrigger)
  }

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }

    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (onOpenChange === undefined) {
          setUncontrolledOpen((current) => !current)
        } else {
          onOpenChange(!(openProp ?? false))
        }
        return
      }
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault()
        setOpen(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpenChange, openProp])


  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        size={mobile ? 'icon' : 'sm'}
        aria-label={mobile ? 'Open route console' : label}
        aria-expanded={open}
        {...(open ? { 'aria-controls': commandContentId } : {})}
        data-route-command-trigger
        {...(triggerClassName === undefined
          ? { className: 'min-h-11' }
          : { className: triggerClassName })}
        onClick={() => setOpen(true)}
      >
        <SearchIcon data-icon="inline-start" aria-hidden="true" />
        {mobile ? null : (
          <>
            <span>{label}</span>
            <kbd className="ml-1 hidden rounded border border-border px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground sm:inline">/</kbd>
          </>
        )}
      </Button>
      {open ? (
        <CommandDialog
          open={open}
          onOpenChange={handleOpenChange}
          title="Route console"
          description="Search pages, services, and actions."
          className="w-[min(42rem,calc(100vw-2rem))]"
        >
          <div id={commandContentId}>
            <CommandInput placeholder="Search pages, services, and actions..." />
            <CommandList>
              <CommandEmpty>No matching route.</CommandEmpty>
              {groupedDestinations.map(([group, groupDestinations]) => (
                <CommandGroup key={group} heading={group}>
                  {groupDestinations.map((destination) => (
                    <CommandItem
                      key={destination.id}
                      value={[destination.label, destination.href, ...(destination.keywords ?? [])].join(' ')}
                      onSelect={() => navigateToDestination(destination)}
                    >
                      <RouteCommandItemContent destination={destination} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </div>
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Press Escape to close.</div>
        </CommandDialog>
      ) : null}
    </>
  )
}

function RouteCommandItemContent({ destination }: { destination: AeCommandDestination }) {
  const Icon = destination.icon ?? ArrowUpRightIcon

  return (
    <>
      <Icon aria-hidden="true" className="text-muted-foreground" />
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">{destination.label}</span>
        <span className="truncate font-mono text-xs text-muted-foreground">{destination.href}</span>
      </span>
      {destination.hint === undefined ? null : <span className="ml-auto text-xs text-muted-foreground">{destination.hint}</span>}
    </>
  )
}
