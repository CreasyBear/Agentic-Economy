'use client'

import { useEffect, useRef } from 'react'

import { SearchIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

import { useCommandPanel } from './CommandPanelProvider'
import { OperationsSearchPage } from './pages/OperationsSearchPage'
import { OperationInspectPage } from './pages/OperationInspectPage'
import { useCommandPanelHotKeys } from './useCommandPanelHotKeys'

const PANEL_CONTENT_ID = 'ae-command-panel-content'

/**
 * Operator-chrome command router: a stacked side panel over the shell.
 * Cmd/Ctrl-k toggles, Escape pops one layer, and the page deck survives the
 * toggle so a quick open-close-open never discards an inspection.
 */
export function AeCommandPanel() {
  const panel = useCommandPanel()
  useCommandPanelHotKeys(panel.toggle)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (wasOpenRef.current && !panel.isOpen) {
      triggerRef.current?.focus()
    }
    wasOpenRef.current = panel.isOpen
  }, [panel.isOpen])

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        size="sm"
        className="min-h-touch"
        aria-label="Search"
        aria-expanded={panel.isOpen}
        aria-controls={PANEL_CONTENT_ID}
        onClick={panel.open}
      >
        <SearchIcon aria-hidden="true" />
        <span>Search</span>
        <kbd className="ml-1 hidden rounded border border-border px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </Button>
      <Sheet
        open={panel.isOpen}
        onOpenChange={(nextOpen) => (nextOpen ? panel.open() : panel.close())}
      >
        <SheetContent
          id={PANEL_CONTENT_ID}
          side="right"
          showCloseButton={false}
          className="w-full gap-0 p-0 sm:max-w-md data-[state=closed]:duration-150 data-[state=open]:duration-150"
          onEscapeKeyDown={(event) => {
            // Layered: Escape pops one inspect layer before it may close.
            if (panel.pageCount > 1) {
              event.preventDefault()
              panel.popPage()
            }
          }}
          onKeyDown={(event) => {
            if (
              event.key === '/' &&
              !(event.target instanceof HTMLInputElement) &&
              !(event.target instanceof HTMLTextAreaElement)
            ) {
              event.preventDefault()
              event.currentTarget.querySelector<HTMLInputElement>('input')?.focus()
            }
          }}
        >
          <SheetTitle className="sr-only">Command console</SheetTitle>
          <SheetDescription className="sr-only">
            Search the operation catalog and inspect one operation.
          </SheetDescription>
          <div className="flex min-h-0 flex-1 flex-col" data-testid="command-panel-body">
            {panel.topPage.kind === 'operations-search' ? (
              <OperationsSearchPage onSelectOperation={panel.pushInspect} />
            ) : (
              <OperationInspectPage operationRef={panel.topPage.operationRef} />
            )}
          </div>
          <p className="border-t border-border px-gutter py-intra text-xs text-muted-foreground">
            Esc pops a layer · Enter inspects
          </p>
        </SheetContent>
      </Sheet>
    </>
  )
}
