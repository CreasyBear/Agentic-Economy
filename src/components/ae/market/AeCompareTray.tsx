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
import type { ToolCardViewModel } from '@/modules/market/tool-view-model'

export const AE_COMPARE_MAX_TOOLS = 4 as const

export type AeCompareTrayProps = Readonly<{
  tools: readonly ToolCardViewModel[]
  onRemove: (toolRef: string) => void
  onClear: () => void
  onCompare: (toolRefs: readonly string[]) => void
  fallbackFocusRef: RefObject<HTMLElement | null>
}>

export function AeCompareTray({
  tools,
  onRemove,
  onClear,
  onCompare,
  fallbackFocusRef,
}: AeCompareTrayProps) {
  const removeButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const present = tools.length > 0
  const [lastSelectedTools, setLastSelectedTools] = useState(
    () => tools.slice(0, AE_COMPARE_MAX_TOOLS),
  )
  useEffect(() => {
    if (present) setLastSelectedTools(tools.slice(0, AE_COMPARE_MAX_TOOLS))
  }, [tools, present])
  const selectedTools = present
    ? tools.slice(0, AE_COMPARE_MAX_TOOLS)
    : lastSelectedTools
  const selectedCount = selectedTools.length

  const focusAfterUpdate = (toolRef?: string) => {
    queueMicrotask(() => {
      if (toolRef !== undefined) {
        const nextRemoveButton = removeButtonRefs.current.get(toolRef)
        if (nextRemoveButton !== undefined) {
          nextRemoveButton.focus()
          return
        }
      }
      fallbackFocusRef.current?.focus()
    })
  }

  const removeTool = (toolRef: string) => {
    const removedIndex = selectedTools.findIndex(
      (tool) => tool.toolRef === toolRef,
    )
    const nextFocusTool =
      selectedTools[removedIndex + 1] ?? selectedTools[removedIndex - 1]
    onRemove(toolRef)
    focusAfterUpdate(nextFocusTool?.toolRef)
  }

  const clearTools = () => {
    onClear()
    focusAfterUpdate()
  }

  return (
    <Presence present={present}>
      <aside
        data-state={present ? 'open' : 'closed'}
        aria-label="Tool comparison"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-gutter pb-[max(var(--spacing-related),env(safe-area-inset-bottom))] duration-base ease-emphasized data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2 motion-reduce:animate-none motion-reduce:duration-0"
      >
        <Card
          className="pointer-events-auto mx-auto w-full min-w-0 max-w-6xl"
        >
        <CardHeader className="gap-intra">
          <div className="flex min-w-0 items-center justify-between gap-related">
            <CardTitle>Compare Tools</CardTitle>
            <Badge
              variant="secondary"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-label={`${selectedCount.toLocaleString()} of ${AE_COMPARE_MAX_TOOLS.toLocaleString()} selected`}
            >
              {selectedCount.toLocaleString()} / {AE_COMPARE_MAX_TOOLS.toLocaleString()}
            </Badge>
          </div>
          <CardDescription>
            {selectionGuidance(selectedCount)}
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <div
            aria-label="Selected Tools"
            className="flex min-w-0 gap-intra overflow-x-auto overscroll-x-contain pb-1"
          >
            {selectedTools.map((tool) => (
              <Badge key={tool.toolRef} variant="outline" className="shrink-0 ps-3">
                <span>{tool.title}</span>
                <span className="text-muted-foreground">{tool.providerName}</span>
                <Button
                  ref={(node) => {
                    if (node === null) removeButtonRefs.current.delete(tool.toolRef)
                    else removeButtonRefs.current.set(tool.toolRef, node)
                  }}
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="-me-1"
                  aria-label={`Remove ${tool.title} by ${tool.providerName} from comparison`}
                  onClick={() => removeTool(tool.toolRef)}
                >
                  <XIcon data-icon="inline-end" aria-hidden="true" />
                </Button>
              </Badge>
            ))}
          </div>
        </CardContent>
        <Separator />
        <CardFooter className="flex-wrap justify-between gap-intra">
          <Button type="button" variant="ghost" size="sm" onClick={clearTools}>
            Clear all
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={selectedCount < 2}
            onClick={() => onCompare(selectedTools.map((tool) => tool.toolRef))}
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
  if (selectedCount === 1) return 'Select one more Tool to compare.'
  if (selectedCount === AE_COMPARE_MAX_TOOLS) {
    return `Maximum ${AE_COMPARE_MAX_TOOLS.toLocaleString()} Tools selected.`
  }
  return 'Compare current price, readiness, data use, and effects.'
}
