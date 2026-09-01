'use client'

import { Presence } from '@radix-ui/react-presence'
import { XIcon } from 'lucide-react'
import {
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { OperationCardViewModel } from '@/modules/market/operation-view-model'

export const AE_COMPARE_MAX_OPERATIONS = 4 as const

export type AeCompareTrayProps = Readonly<{
  operations: readonly OperationCardViewModel[]
  onRemove: (operationRef: string) => void
  onClear: () => void
  onCompare: (operationRefs: readonly string[]) => void
  fallbackFocusRef: RefObject<HTMLElement | null>
}>

export function AeCompareTray({
  operations,
  onRemove,
  onClear,
  onCompare,
  fallbackFocusRef,
}: AeCompareTrayProps) {
  const removeButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const present = operations.length > 0
  const [lastSelectedOperations, setLastSelectedOperations] = useState(
    () => operations.slice(0, AE_COMPARE_MAX_OPERATIONS),
  )
  useEffect(() => {
    if (present) setLastSelectedOperations(operations.slice(0, AE_COMPARE_MAX_OPERATIONS))
  }, [operations, present])
  const selectedOperations = present
    ? operations.slice(0, AE_COMPARE_MAX_OPERATIONS)
    : lastSelectedOperations
  const selectedCount = selectedOperations.length

  const focusAfterUpdate = (operationRef?: string) => {
    queueMicrotask(() => {
      if (operationRef !== undefined) {
        const nextRemoveButton = removeButtonRefs.current.get(operationRef)
        if (nextRemoveButton !== undefined) {
          nextRemoveButton.focus()
          return
        }
      }
      fallbackFocusRef.current?.focus()
    })
  }

  const removeOperation = (operationRef: string) => {
    const removedIndex = selectedOperations.findIndex(
      (operation) => operation.operationRef === operationRef,
    )
    const nextFocusOperation =
      selectedOperations[removedIndex + 1] ?? selectedOperations[removedIndex - 1]
    onRemove(operationRef)
    focusAfterUpdate(nextFocusOperation?.operationRef)
  }

  const clearOperations = () => {
    onClear()
    focusAfterUpdate()
  }

  return (
    <Presence present={present}>
      <aside
        data-state={present ? 'open' : 'closed'}
        aria-label="Operation comparison"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-gutter pb-[max(var(--spacing-related),env(safe-area-inset-bottom))] duration-base ease-emphasized data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2 motion-reduce:animate-none motion-reduce:duration-0"
      >
        <Card
          className="pointer-events-auto mx-auto w-full min-w-0 max-w-6xl"
        >
        <CardHeader className="gap-intra">
          <div className="flex min-w-0 items-center justify-between gap-related">
            <CardTitle>Compare Operations</CardTitle>
            <Badge
              variant="secondary"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-label={`${selectedCount.toLocaleString()} of ${AE_COMPARE_MAX_OPERATIONS.toLocaleString()} selected`}
            >
              {selectedCount.toLocaleString()} / {AE_COMPARE_MAX_OPERATIONS.toLocaleString()}
            </Badge>
          </div>
          <CardDescription>
            {selectionGuidance(selectedCount)}
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <div
            aria-label="Selected Operations"
            className="flex min-w-0 gap-intra overflow-x-auto overscroll-x-contain pb-1"
          >
            {selectedOperations.map((operation) => (
              <Badge key={operation.operationRef} variant="outline" className="shrink-0 ps-3">
                <span>{operation.title}</span>
                <span className="text-muted-foreground">{operation.supplierName}</span>
                <Button
                  ref={(node) => {
                    if (node === null) removeButtonRefs.current.delete(operation.operationRef)
                    else removeButtonRefs.current.set(operation.operationRef, node)
                  }}
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="-me-1"
                  aria-label={`Remove ${operation.title} by ${operation.supplierName} from comparison`}
                  onClick={() => removeOperation(operation.operationRef)}
                >
                  <XIcon data-icon="inline-end" aria-hidden="true" />
                </Button>
              </Badge>
            ))}
          </div>
        </CardContent>
        <Separator />
        <CardFooter className="flex-wrap justify-between gap-intra">
          <Button type="button" variant="ghost" size="sm" onClick={clearOperations}>
            Clear all
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={selectedCount < 2}
            onClick={() => onCompare(selectedOperations.map((operation) => operation.operationRef))}
          >
            Compare {selectedCount.toLocaleString()}
          </Button>
        </CardFooter>
        </Card>
      </aside>
    </Presence>
  )
}

function selectionGuidance(selectedCount: number): string {
  if (selectedCount === 1) return 'Select one more Operation to compare.'
  if (selectedCount === AE_COMPARE_MAX_OPERATIONS) {
    return `Maximum ${AE_COMPARE_MAX_OPERATIONS.toLocaleString()} Operations selected.`
  }
  return 'Compare current price, readiness, data use, and effects.'
}
