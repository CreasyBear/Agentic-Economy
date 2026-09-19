/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeOrganizationSwitcher } from '@/components/ae/layout/AeOrganizationSwitcher'
import { clerkAppearance, clerkOrganizationSwitcherAppearance } from '@/components/ae/website/clerk-appearance'
import '../../setup/jsdom-platform'

const switcherState = vi.hoisted(() => ({
  lastProps: null as Record<string, unknown> | null,
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  OrganizationSwitcher: (props: Record<string, unknown>) => {
    switcherState.lastProps = props
    return <div data-testid="organization-switcher" />
  },
}))

function appearanceElements(): Record<string, string> {
  const appearance = switcherState.lastProps?.appearance as { elements?: Record<string, string> } | undefined
  if (!appearance?.elements) {
    throw new Error('OrganizationSwitcher appearance.elements was not passed')
  }
  return appearance.elements
}

afterEach(() => {
  cleanup()
  switcherState.lastProps = null
})

describe('clerkOrganizationSwitcherAppearance', () => {
  it('styles the popover card with AE semantic surface tokens', () => {
    const card = clerkOrganizationSwitcherAppearance.elements.organizationSwitcherPopoverCard

    expect(card).toContain('bg-popover')
    expect(card).toContain('border-border')
    expect(card).toContain('shadow-overlay')
    expect(card).not.toMatch(/\bbg-(black|white|gray|slate|zinc)/u)
    expect(card).not.toContain('transition-all')
  })

  it('styles the active organization pill with brand and monospace tokens', () => {
    const pill = clerkOrganizationSwitcherAppearance.elements.organizationSwitcherActiveOrganizationPill

    expect(pill).toContain('bg-brand-muted')
    expect(pill).toContain('font-mono')
    expect(pill).not.toMatch(/\bbg-(black|white|gray|green)-/u)
  })
})

describe('AeOrganizationSwitcher', () => {
  it('merges harmonized popover and pill styling into OrganizationSwitcher appearance', () => {
    render(<AeOrganizationSwitcher />)

    const elements = appearanceElements()

    expect(elements.formButtonPrimary).toBe(clerkAppearance.elements.formButtonPrimary)
    expect(elements.organizationSwitcherPopoverCard).toBe(
      clerkOrganizationSwitcherAppearance.elements.organizationSwitcherPopoverCard,
    )
    expect(elements.organizationSwitcherActiveOrganizationPill).toBe(
      clerkOrganizationSwitcherAppearance.elements.organizationSwitcherActiveOrganizationPill,
    )
    expect(elements.organizationSwitcherPopoverActionButton).toBe(
      clerkOrganizationSwitcherAppearance.elements.organizationSwitcherPopoverActionButton,
    )
  })

  it('applies expanded sidebar trigger classes when not collapsed', () => {
    render(<AeOrganizationSwitcher isCollapsed={false} />)

    const trigger = appearanceElements().organizationSwitcherTrigger
    expect(trigger).toContain('w-full')
    expect(trigger).toContain('justify-between')
    expect(trigger).toContain('enabled:active:scale-[0.98]')
    expect(trigger).not.toContain('size-8')
    expect(appearanceElements().organizationPreviewTextContainer).toBe('min-w-0 truncate text-xs font-medium')
    expect(appearanceElements().organizationSwitcherTriggerIcon).toBe('size-4 opacity-50')
  })

  it('applies collapsed icon-mode trigger classes when collapsed', () => {
    render(<AeOrganizationSwitcher isCollapsed />)

    const trigger = appearanceElements().organizationSwitcherTrigger
    expect(trigger).toContain('size-8')
    expect(trigger).toContain('justify-center')
    expect(trigger).toContain('enabled:active:scale-[0.98]')
    expect(trigger).not.toContain('justify-between')
    expect(appearanceElements().organizationPreviewTextContainer).toBe('sr-only')
    expect(appearanceElements().organizationSwitcherTriggerIcon).toBe('sr-only')
  })

  it('locks zero-CLS wrapper dimensions without extra vertical padding', () => {
    const { container } = render(<AeOrganizationSwitcher />)
    const wrapper = container.querySelector('[aria-label="Workspace selection"]')
    expect(wrapper?.className).toContain('h-8')
    expect(wrapper?.className).toContain('w-full')
    expect(wrapper?.className).not.toContain('py-1')
  })
})
