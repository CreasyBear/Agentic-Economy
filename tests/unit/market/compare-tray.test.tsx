// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createRef, useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AE_COMPARE_MAX_TOOLS,
  AeCompareTray,
} from '@/components/ae/market/AeCompareTray'
import { toolCompareInputSchema } from '@/modules/capability-supply/public'
import type { ToolCardViewModel } from '@/modules/market/tool-view-model'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AeCompareTray', () => {
  it('stays absent with no selection and requires a second Tool before comparison', () => {
    const fallbackFocusRef = createRef<HTMLButtonElement>()
    const { rerender } = render(
      <>
        <button type="button" ref={fallbackFocusRef}>Catalog table</button>
        <AeCompareTray
          tools={[]}
          onRemove={() => undefined}
          onClear={() => undefined}
          onCompare={() => undefined}
          fallbackFocusRef={fallbackFocusRef}
        />
      </>,
    )

    expect(screen.queryByRole('complementary', { name: 'Tool comparison' })).toBeNull()

    rerender(
      <>
        <button type="button" ref={fallbackFocusRef}>Catalog table</button>
        <AeCompareTray
          tools={[tool(1)]}
          onRemove={() => undefined}
          onClear={() => undefined}
          onCompare={() => undefined}
          fallbackFocusRef={fallbackFocusRef}
        />
      </>,
    )

    const tray = screen.getByRole('complementary', { name: 'Tool comparison' })
    expect(within(tray).getByText('Select one more Tool to compare.')).toBeTruthy()
    expect(within(tray).getByLabelText('1 of 4 selected').getAttribute('data-slot')).toBe('badge')
    expect(within(tray).getByRole<HTMLButtonElement>('button', { name: 'Compare 1' }).disabled).toBe(true)
    expect(
      within(tray).getByRole('button', {
        name: 'Remove Tool 1 by Provider 1 from comparison',
      }),
    ).toBeTruthy()
  })

  it('passes two to four refs in authoritative order and never exceeds the canonical limit', () => {
    const onCompare = vi.fn()
    const fallbackFocusRef = createRef<HTMLButtonElement>()
    render(
      <>
        <button type="button" ref={fallbackFocusRef}>Catalog table</button>
        <AeCompareTray
          tools={Array.from({ length: 5 }, (_, index) => tool(index + 1))}
          onRemove={() => undefined}
          onClear={() => undefined}
          onCompare={onCompare}
          fallbackFocusRef={fallbackFocusRef}
        />
      </>,
    )

    const tray = screen.getByRole('complementary', { name: 'Tool comparison' })
    expect(within(tray).getByLabelText('4 of 4 selected')).toBeTruthy()
    expect(within(tray).getByText('Maximum 4 Tools selected.')).toBeTruthy()
    expect(within(tray).queryByText('Tool 5')).toBeNull()

    fireEvent.click(within(tray).getByRole('button', { name: 'Compare 4' }))

    expect(onCompare).toHaveBeenCalledOnce()
    expect(onCompare).toHaveBeenCalledWith([
      toolRef(1),
      toolRef(2),
      toolRef(3),
      toolRef(4),
    ])
  })

  it('moves focus to the nearest remove control, then restores fallback focus when cleared', async () => {
    function Harness() {
      const [selected, setSelected] = useState(() => [tool(1), tool(2), tool(3)])
      const fallbackFocusRef = useRef<HTMLButtonElement>(null)
      return (
        <>
          <button type="button" ref={fallbackFocusRef}>Catalog table</button>
          <AeCompareTray
            tools={selected}
            onRemove={(toolRef) => {
              setSelected((current) => current.filter((item) => item.toolRef !== toolRef))
            }}
            onClear={() => setSelected([])}
            onCompare={() => undefined}
            fallbackFocusRef={fallbackFocusRef}
          />
        </>
      )
    }

    render(<Harness />)

    fireEvent.click(screen.getByRole('button', {
      name: 'Remove Tool 2 by Provider 2 from comparison',
    }))

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', {
        name: 'Remove Tool 3 by Provider 3 from comparison',
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))

    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'Tool comparison' })).toBeNull()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Catalog table' }))
    })
  })

  it('uses the unchanged shadcn composition and contains mobile overflow inside the tray', () => {
    const fallbackFocusRef = createRef<HTMLButtonElement>()
    render(
      <AeCompareTray
        tools={[tool(1), tool(2)]}
        onRemove={() => undefined}
        onClear={() => undefined}
        onCompare={() => undefined}
        fallbackFocusRef={fallbackFocusRef}
      />,
    )

    const tray = screen.getByRole('complementary', { name: 'Tool comparison' })
    expect(tray.className).toContain('safe-area-inset-bottom')
    expect(tray.className).toContain('motion-reduce:animate-none')
    const card = tray.querySelector('[data-slot="card"]')
    expect(card).not.toBeNull()
    expect(tray.querySelector('[data-slot="card-header"]')).not.toBeNull()
    expect(tray.querySelector('[data-slot="card-content"]')).not.toBeNull()
    expect(tray.querySelector('[data-slot="separator"]')).not.toBeNull()
    expect(tray.querySelector('[data-slot="card-footer"]')).not.toBeNull()
    expect(within(tray).getByLabelText('Selected Tools').className).toContain('overflow-x-auto')
  })

  it('keeps the Presence child mounted until its exit animation finishes', async () => {
    vi.stubGlobal('CSS', { escape: (value: string) => value })
    const originalGetComputedStyle = window.getComputedStyle
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const styles = originalGetComputedStyle(element)
      return new Proxy(styles, {
        get(target, property, receiver) {
          if (property === 'animationName') {
            return element.getAttribute('data-state') === 'closed'
              ? 'ae-compare-tray-exit'
              : 'ae-compare-tray-enter'
          }
          return Reflect.get(target, property, receiver)
        },
      })
    })
    const fallbackFocusRef = createRef<HTMLButtonElement>()
    const { rerender } = render(
      <AeCompareTray
        tools={[tool(1), tool(2)]}
        onRemove={() => undefined}
        onClear={() => undefined}
        onCompare={() => undefined}
        fallbackFocusRef={fallbackFocusRef}
      />,
    )

    rerender(
      <AeCompareTray
        tools={[]}
        onRemove={() => undefined}
        onClear={() => undefined}
        onCompare={() => undefined}
        fallbackFocusRef={fallbackFocusRef}
      />,
    )

    const exitingTray = screen.getByRole('complementary', { name: 'Tool comparison' })
    expect(exitingTray.getAttribute('data-state')).toBe('closed')

    const animationEnd = new Event('animationend', { bubbles: true })
    Object.defineProperty(animationEnd, 'animationName', {
      value: 'ae-compare-tray-exit',
    })
    fireEvent(exitingTray, animationEnd)

    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'Tool comparison' })).toBeNull()
    })
  })

  it('shares the compare endpoint maximum instead of inventing a second UI limit', () => {
    const fourRefs = Array.from(
      { length: AE_COMPARE_MAX_TOOLS },
      (_, index) => toolRef(index + 1),
    )
    expect(AE_COMPARE_MAX_TOOLS).toBe(4)
    expect(toolCompareInputSchema.safeParse({ toolRefs: fourRefs }).success).toBe(true)
    expect(
      toolCompareInputSchema.safeParse({
        toolRefs: [...fourRefs, toolRef(AE_COMPARE_MAX_TOOLS + 1)],
      }).success,
    ).toBe(false)
  })
})

function tool(index: number): ToolCardViewModel {
  return {
    toolRef: toolRef(index),
    title: `Tool ${index.toLocaleString()}`,
    summary: `Summary ${index.toLocaleString()}`,
    providerName: `Provider ${index.toLocaleString()}`,
    providerSlug: `supplier-${index.toLocaleString()}`,
    providerInitials: `S${index.toLocaleString()}`,
    capabilityId: 'test.compare',
    capability: 'Test comparison',
    category: {
      id: 'other',
      label: 'Other',
      description: 'Other Tools.',
    },
    price: `USD ${index.toLocaleString()}.00`,
    authentication: 'No connection required',
    lastVerifiedAt: 1_700_000_000_000 + index,
    callLabel: 'Use capability',
    readiness: 'Routeable',
    readinessLabel: 'Ready now',
    trustFact: 'Ready to run through Agentic Economy',
    rating: {
      kind: 'unrated',
      count: 0,
      display: 'No ratings yet',
      definition: 'No authenticated ratings.',
    },
    popularity: {
      kind: 'observed',
      completedCalls: 0,
      display: 'No completed calls yet',
      definition: 'Completed calls.',
    },
    latency: {
      kind: 'insufficient_sample',
      sampleSize: 0,
      minimumSampleSize: 5,
      display: 'Not enough data',
      definition: 'Latency needs more samples.',
    },
  }
}

function toolRef(index: number): `operation:v1:${string}` {
  return `operation:v1:${index.toString(16).padStart(64, '0')}`
}
