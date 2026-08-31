'use client'

import { useState } from 'react'

import { ArrowLeftIcon, SearchIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

import { useCommandPanel } from './CommandPanelProvider'
import { OperationsSearchPage } from './pages/OperationsSearchPage'
import { OperationInspectPage } from './pages/OperationInspectPage'
import { useCommandPanelHotKeys } from './useCommandPanelHotKeys'

const PANEL_CONTENT_ID = 'ae-command-panel-content'

/**
 * Operator-chrome command router: a stacked modal over the shell.
 * Cmd/Ctrl-k toggles, Escape pops one layer, and the page deck survives the
 * toggle so a quick open-close-open never discards an inspection.
 */
export function AeCommandPanel() {
  const panel = useCommandPanel()
  useCommandPanelHotKeys(panel.toggle)

  const [searchQuery, setSearchQuery] = useState('')

  return (
    <Dialog
      open={panel.isOpen}
      onOpenChange={(nextOpen) => (nextOpen ? panel.open() : panel.close())}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-touch"
          aria-label="Search"
          aria-controls={PANEL_CONTENT_ID}
        >
          <SearchIcon aria-hidden="true" />
          <span>Search</span>
          <kbd className="ml-1 hidden rounded border border-border px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        </Button>
      </DialogTrigger>
      <DialogContent
        id={PANEL_CONTENT_ID}
        showCloseButton={panel.pageCount === 1}
        className="flex h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-lg p-0 duration-base ease-emphasized motion-reduce:animate-none motion-reduce:duration-0 sm:h-[min(42rem,calc(100dvh-3rem))] sm:w-full sm:max-w-3xl"
        onEscapeKeyDown={(event) => {
          // Layered: Escape pops one inspect layer before it may close.
          if (panel.pageCount > 1) {
            event.preventDefault()
            panel.popPage()
          } else if (searchQuery.trim() !== '') {
            event.preventDefault()
            setSearchQuery('')
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
        <DialogTitle className="sr-only">Command console</DialogTitle>
        <DialogDescription className="sr-only">
          Search the Operation catalog, inspect one Operation, and take its next action.
        </DialogDescription>
        {panel.pageCount > 1 ? (
          <div className="flex min-h-touch shrink-0 items-center justify-between border-b border-border px-gutter">
            <Button type="button" variant="ghost" size="sm" className="min-h-touch" onClick={panel.popPage}>
              <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
              Back
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm" className="min-h-touch">
                <XIcon data-icon="inline-start" aria-hidden="true" />
                Close
              </Button>
            </DialogClose>
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col" data-testid="command-panel-body">
          <div
            hidden={panel.topPage.kind !== 'operations-search'}
            className="contents"
            aria-hidden={panel.topPage.kind !== 'operations-search'}
          >
            <OperationsSearchPage
              isActive={panel.topPage.kind === 'operations-search'}
              query={searchQuery}
              onQueryChange={setSearchQuery}
              onSelectOperation={panel.pushInspect}
            />
          </div>
          {panel.topPage.kind === 'operation-inspect' ? (
            <OperationInspectPage operationRef={panel.topPage.operationRef} />
          ) : null}
        </div>
        <p className="shrink-0 border-t border-border px-gutter py-intra text-xs text-muted-foreground">
          Esc pops a layer · Enter inspects
        </p>
      </DialogContent>
    </Dialog>
  )
}
