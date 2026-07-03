'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { ArrowUpRightIcon, Building2Icon, FileQuestionIcon, HelpCircleIcon, HomeIcon, SearchIcon, StoreIcon } from 'lucide-react'

import { Button } from '@astryxdesign/core/Button'
import { CommandPalette, CommandPaletteInput } from '@astryxdesign/core/CommandPalette'
import { Kbd } from '@astryxdesign/core/Kbd'
import { createStaticSource, type SearchableItem } from '@astryxdesign/core/Typeahead'

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

type RouteCommandItem = SearchableItem & {
  auxiliaryData: {
    destination: AeCommandDestination
    group: string
    keywords: string[]
  }
}

export function AeRouteCommandMenu({
  label = 'Search',
  destinations,
  triggerClassName,
  mobile = false,
}: {
  label?: string
  destinations: readonly AeCommandDestination[]
  triggerClassName?: string
  mobile?: boolean
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const commandItems = useMemo(() => toRouteCommandItems(destinations), [destinations])
  const destinationById = useMemo(
    () => new Map(destinations.map((destination) => [destination.id, destination])),
    [destinations],
  )
  const searchSource = useMemo(
    () =>
      createStaticSource(commandItems, {
        keywords: (item) => item.auxiliaryData?.keywords ?? [],
      }),
    [commandItems],
  )

  function navigateToDestination(destination: AeCommandDestination) {
    void router.navigate({
      to: destination.href,
      ...(destination.params === undefined ? {} : { params: destination.params }),
      ...(destination.search === undefined ? {} : { search: destination.search }),
    })
    setOpen(false)
  }

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
        label={mobile ? 'Open route console' : label}
        variant="secondary"
        size="sm"
        isIconOnly={mobile}
        icon={<SearchIcon data-icon="inline-start" aria-hidden="true" />}
        endContent={mobile ? undefined : <Kbd keys="mod+k" />}
        {...(triggerClassName === undefined ? {} : { className: triggerClassName })}
        onClick={() => setOpen(true)}
      />
      <CommandPalette<RouteCommandItem>
        isOpen={open}
        onOpenChange={setOpen}
        label="Route console"
        width="min(42rem, calc(100vw - 2rem))"
        maxHeight="min(42rem, 82vh)"
        searchSource={searchSource}
        emptySearchText="No matching route."
        emptyBootstrapText="No routes available."
        onValueChange={(id) => {
          const destination = destinationById.get(id)
          if (destination !== undefined) {
            navigateToDestination(destination)
          }
        }}
        input={<CommandPaletteInput placeholder="Search pages, services, and actions..." />}
        footer={<span className="px-3 py-2 text-xs text-secondary">Press Escape to close.</span>}
        renderItem={(item) => <RouteCommandItemContent destination={item.auxiliaryData.destination} />}
      />
    </>
  )
}

export function AePublicRouteCommandMenu({ mobile = false }: { mobile?: boolean }) {
  const destinations = useMemo(() => [...publicDestinations, ownerCommandDestination(false)], [])

  return (
    <AeRouteCommandMenu
      destinations={destinations}
      label="Search"
      mobile={mobile}
      triggerClassName={mobile ? 'md:hidden' : 'hidden md:inline-flex'}
    />
  )
}

function ownerCommandDestination(isSignedIn: boolean): AeCommandDestination {
  if (isSignedIn) {
    return {
      id: 'owner',
      label: 'For businesses',
      href: '/owner/status',
      group: 'Owner',
      hint: 'Dashboard',
      icon: Building2Icon,
      keywords: ['owner', 'dashboard', 'business'],
    }
  }

  return {
    id: 'owner',
    label: 'For businesses',
    href: '/sign-in/$',
    params: { _splat: '' },
    search: { redirect: '/owner/status' },
    group: 'Owner',
    hint: 'Sign in',
    icon: Building2Icon,
    keywords: ['owner', 'sign in', 'business'],
  }
}

function RouteCommandItemContent({ destination }: { destination: AeCommandDestination }) {
  const Icon = destination.icon ?? ArrowUpRightIcon

  return (
    <>
      <Icon aria-hidden="true" className="size-4 shrink-0 text-secondary" />
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-sm font-medium text-primary">{destination.label}</span>
        <span className="truncate font-mono text-xs text-secondary">{destination.href}</span>
      </span>
      {destination.hint === undefined ? null : <span className="ml-auto text-xs text-secondary">{destination.hint}</span>}
    </>
  )
}

function toRouteCommandItems(destinations: readonly AeCommandDestination[]): RouteCommandItem[] {
  return destinations.map((destination) => ({
    id: destination.id,
    label: destination.label,
    auxiliaryData: {
      destination,
      group: destination.group,
      keywords: [destination.href, ...(destination.keywords ?? [])],
    },
  }))
}

const publicDestinations = [
  {
    id: 'ask',
    label: 'Ask for a local service',
    href: '/',
    group: 'Discovery',
    hint: 'Home',
    icon: HomeIcon,
    keywords: ['question', 'search', 'answer'],
  },
  {
    id: 'registry',
    label: 'Browse service pages',
    href: '/registry?q=&limit=10',
    group: 'Discovery',
    hint: 'Catalog',
    icon: StoreIcon,
    keywords: ['businesses', 'providers', 'catalog'],
  },
  {
    id: 'claim',
    label: 'List or claim a business',
    href: '/claim',
    group: 'Owner',
    hint: 'Owner',
    icon: Building2Icon,
    keywords: ['publish', 'owner', 'business'],
  },
  {
    id: 'corrections',
    label: 'Correct or remove a page',
    href: '/privacy/remove-business',
    group: 'Trust',
    hint: 'Review',
    icon: FileQuestionIcon,
    keywords: ['remove', 'stale', 'wrong'],
  },
  {
    id: 'help',
    label: 'Help and boundaries',
    href: '/help',
    group: 'Trust',
    hint: 'Help',
    icon: HelpCircleIcon,
    keywords: ['contact', 'safe', 'support'],
  },
] satisfies readonly AeCommandDestination[]
