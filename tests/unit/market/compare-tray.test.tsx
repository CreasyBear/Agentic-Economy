// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createRef, useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AE_COMPARE_MAX_OPERATIONS,
  AeCompareTray,
} from '@/components/ae/market/AeCompareTray'
import { operationCompareInputSchema } from '@/modules/capability-supply/public'
import type { OperationCardViewModel } from '@/modules/market/operation-view-model'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AeCompareTray', () => {
  it('stays absent with no selection and requires a second Operation before comparison', () => {
    const fallbackFocusRef = createRef<HTMLButtonElement>()
    const { rerender } = render(
      <>
        <button type="button" ref={fallbackFocusRef}>Catalog table</button>
        <AeCompareTray
          operations={[]}
          onRemove={() => undefined}
          onClear={() => undefined}
          onCompare={() => undefined}
          fallbackFocusRef={fallbackFocusRef}
        />
      </>,
    )

    expect(screen.queryByRole('complementary', { name: 'Operation comparison' })).toBeNull()

    rerender(
      <>
        <button type="button" ref={fallbackFocusRef}>Catalog table</button>
        <AeCompareTray
          operations={[operation(1)]}
          onRemove={() => undefined}
          onClear={() => undefined}
          onCompare={() => undefined}
          fallbackFocusRef={fallbackFocusRef}
        />
      </>,
    )

    const tray = screen.getByRole('complementary', { name: 'Operation comparison' })
    expect(within(tray).getByText('Select one more Operation to compare.')).toBeTruthy()
    expect(within(tray).getByLabelText('1 of 4 selected').getAttribute('data-slot')).toBe('badge')
    expect(within(tray).getByRole<HTMLButtonElement>('button', { name: 'Compare 1' }).disabled).toBe(true)
    expect(
      within(tray).getByRole('button', {
        name: 'Remove Operation 1 by Supplier 1 from comparison',
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
          operations={Array.from({ length: 5 }, (_, index) => operation(index + 1))}
          onRemove={() => undefined}
          onClear={() => undefined}
          onCompare={onCompare}
          fallbackFocusRef={fallbackFocusRef}
        />
      </>,
    )

    const tray = screen.getByRole('complementary', { name: 'Operation comparison' })
    expect(within(tray).getByLabelText('4 of 4 selected')).toBeTruthy()
    expect(within(tray).getByText('Maximum 4 Operations selected.')).toBeTruthy()
    expect(within(tray).queryByText('Operation 5')).toBeNull()

    fireEvent.click(within(tray).getByRole('button', { name: 'Compare 4' }))

    expect(onCompare).toHaveBeenCalledOnce()
    expect(onCompare).toHaveBeenCalledWith([
      operationRef(1),
      operationRef(2),
      operationRef(3),
      operationRef(4),
    ])
  })

  it('moves focus to the nearest remove control, then restores fallback focus when cleared', async () => {
    function Harness() {
      const [selected, setSelected] = useState(() => [operation(1), operation(2), operation(3)])
      const fallbackFocusRef = useRef<HTMLButtonElement>(null)
      return (
        <>
          <button type="button" ref={fallbackFocusRef}>Catalog table</button>
          <AeCompareTray
            operations={selected}
            onRemove={(operationRef) => {
              setSelected((current) => current.filter((item) => item.operationRef !== operationRef))
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
      name: 'Remove Operation 2 by Supplier 2 from comparison',
    }))

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', {
        name: 'Remove Operation 3 by Supplier 3 from comparison',
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))

    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'Operation comparison' })).toBeNull()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Catalog table' }))
    })
  })

  it('uses the unchanged shadcn composition and contains mobile overflow inside the tray', () => {
    const fallbackFocusRef = createRef<HTMLButtonElement>()
    render(
      <AeCompareTray
        operations={[operation(1), operation(2)]}
        onRemove={() => undefined}
        onClear={() => undefined}
        onCompare={() => undefined}
        fallbackFocusRef={fallbackFocusRef}
      />,
    )

    const tray = screen.getByRole('complementary', { name: 'Operation comparison' })
    expect(tray.className).toContain('safe-area-inset-bottom')
    expect(tray.className).toContain('motion-reduce:animate-none')
    const card = tray.querySelector('[data-slot="card"]')
    expect(card).not.toBeNull()
    expect(tray.querySelector('[data-slot="card-header"]')).not.toBeNull()
    expect(tray.querySelector('[data-slot="card-content"]')).not.toBeNull()
    expect(tray.querySelector('[data-slot="separator"]')).not.toBeNull()
    expect(tray.querySelector('[data-slot="card-footer"]')).not.toBeNull()
    expect(within(tray).getByLabelText('Selected Operations').className).toContain('overflow-x-auto')
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
        operations={[operation(1), operation(2)]}
        onRemove={() => undefined}
        onClear={() => undefined}
        onCompare={() => undefined}
        fallbackFocusRef={fallbackFocusRef}
      />,
    )

    rerender(
      <AeCompareTray
        operations={[]}
        onRemove={() => undefined}
        onClear={() => undefined}
        onCompare={() => undefined}
        fallbackFocusRef={fallbackFocusRef}
      />,
    )

    const exitingTray = screen.getByRole('complementary', { name: 'Operation comparison' })
    expect(exitingTray.getAttribute('data-state')).toBe('closed')

    const animationEnd = new Event('animationend', { bubbles: true })
    Object.defineProperty(animationEnd, 'animationName', {
      value: 'ae-compare-tray-exit',
    })
    fireEvent(exitingTray, animationEnd)

    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'Operation comparison' })).toBeNull()
    })
  })

  it('shares the compare endpoint maximum instead of inventing a second UI limit', () => {
    const fourRefs = Array.from(
      { length: AE_COMPARE_MAX_OPERATIONS },
      (_, index) => operationRef(index + 1),
    )
    expect(AE_COMPARE_MAX_OPERATIONS).toBe(4)
    expect(operationCompareInputSchema.safeParse({ operationRefs: fourRefs }).success).toBe(true)
    expect(
      operationCompareInputSchema.safeParse({
        operationRefs: [...fourRefs, operationRef(AE_COMPARE_MAX_OPERATIONS + 1)],
      }).success,
    ).toBe(false)
  })
})

function operation(index: number): OperationCardViewModel {
  return {
    operationRef: operationRef(index),
    title: `Operation ${index.toLocaleString()}`,
    summary: `Summary ${index.toLocaleString()}`,
    supplierName: `Supplier ${index.toLocaleString()}`,
    supplierSlug: `supplier-${index.toLocaleString()}`,
    supplierInitials: `S${index.toLocaleString()}`,
    capabilityId: 'test.compare',
    capability: 'Test comparison',
    category: {
      id: 'other',
      label: 'Other',
      description: 'Other Operations.',
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
      completedInvocations: 0,
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

function operationRef(index: number): `operation:v1:${string}` {
  return `operation:v1:${index.toString(16).padStart(64, '0')}`
}
