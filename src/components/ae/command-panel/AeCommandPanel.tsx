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
import { ToolsSearchPage } from './pages/ToolsSearchPage'
import { ToolDetailPage } from './pages/ToolDetailPage'
import { useCommandPanelHotKeys } from './useCommandPanelHotKeys'

const PANEL_CONTENT_ID = 'ae-command-panel-content'

/**
 * Operator-chrome command router: a stacked modal over the shell.
 * Cmd/Ctrl-k toggles, Escape pops one layer, and the page deck survives the
 * toggle so a quick open-close-open never discards an inspection.
 */
export function AeCommandPanel() {
  const panel = useCommandPanel()
  const [searchQuery, setSearchQuery] = useState('')
  const updateSearchQuery = (nextQuery: string) => {
    setSearchQuery(nextQuery)
  }
  const completeNavigation = () => {
    updateSearchQuery('')
    panel.completeNavigation()
  }
  const handleEscape = () => {
    if (panel.pageCount > 1) panel.popPage()
    else if (searchQuery.trim() !== '') updateSearchQuery('')
    else panel.close()
  }
  useCommandPanelHotKeys({
    isOpen: panel.isOpen,
    onEscape: handleEscape,
    onOpen: panel.open,
    onToggle: panel.toggle,
  })

  return (
    <Dialog
      open={panel.isOpen}
      onOpenChange={(nextOpen) => (nextOpen ? panel.open() : panel.close())}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-touch justify-start rounded-none bg-background px-3 shadow-none sm:min-w-56"
          aria-label="Find Tools"
          aria-controls={PANEL_CONTENT_ID}
        >
          <SearchIcon aria-hidden="true" />
          <span className="hidden font-mono text-xs font-medium uppercase tracking-wide sm:inline">Find Tools</span>
          <kbd className="ms-auto hidden border-s border-border ps-2 font-mono text-[0.6875rem] text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        </Button>
      </DialogTrigger>
      <DialogContent
        id={PANEL_CONTENT_ID}
        showCloseButton={panel.pageCount === 1}
        className="flex h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-lg p-0 duration-base ease-emphasized motion-reduce:animate-none motion-reduce:duration-0 sm:h-[min(42rem,calc(100dvh-3rem))] sm:w-full sm:max-w-3xl"
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
          Search the Tool catalog, describe one Tool, and take its next action.
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
            hidden={panel.topPage.kind !== 'tools-search'}
            className="contents"
            aria-hidden={panel.topPage.kind !== 'tools-search'}
          >
            <ToolsSearchPage
              isActive={panel.topPage.kind === 'tools-search'}
              query={searchQuery}
              onQueryChange={updateSearchQuery}
              onSelectTool={panel.pushToolDetail}
            />
          </div>
          {panel.topPage.kind === 'tool-detail' ? (
            <ToolDetailPage
              toolRef={panel.topPage.toolRef}
              onNavigate={completeNavigation}
            />
          ) : null}
        </div>
        <p className="shrink-0 border-t border-border px-gutter py-intra text-xs text-muted-foreground">
          Esc pops a layer · Enter inspects
        </p>
      </DialogContent>
    </Dialog>
  )
}
