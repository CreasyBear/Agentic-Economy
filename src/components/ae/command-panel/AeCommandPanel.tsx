'use client'

import { useState } from 'react'

import { useRouter } from '@tanstack/react-router'
import { ArrowLeftIcon, SearchIcon, XIcon } from 'lucide-react'

import { useAppearance } from '@/components/ae/theme/ThemeProvider'

import { TACTILE } from '@/components/ae/feedback/AeEmptyState'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

import { useCommandPanel } from './CommandPanelProvider'
import { ToolsSearchPage } from './tools-search-page/ToolsSearchPage'
import { ToolDetailPage } from './pages/ToolDetailPage'
import { useCommandPanelHotKeys } from './useCommandPanelHotKeys'

const PANEL_CONTENT_ID = 'ae-command-panel-content'

/**
 * Operator-chrome command router: a stacked modal over the shell.
 * Cmd/Ctrl-k toggles, Escape pops one layer, and the page deck survives the
 * toggle so a quick open-close-open never discards an inspection.
 */
export function AeCommandPanel({
  onOpenSettings,
}: Readonly<{
  onOpenSettings?: (scope: 'personal' | 'workspace') => void
}> = {}) {
  const panel = useCommandPanel()
  const router = useRouter()
  const { setPreference, preference } = useAppearance()
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
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'min-h-touch justify-start rounded-full px-3 shadow-none sm:min-w-40',
              TACTILE,
            )}
            aria-label="Find Tools"
            aria-controls={PANEL_CONTENT_ID}
          >
            <SearchIcon aria-hidden="true" />
            <span className="hidden text-sm font-medium sm:inline">Find Tools</span>
            <kbd className="ms-auto hidden border-s border-border ps-2 font-mono text-[0.6875rem] text-muted-foreground sm:inline">
              ⌘K
            </kbd>
          </Button>
        }
      />
      <DialogContent
        id={PANEL_CONTENT_ID}
        showCloseButton={panel.pageCount === 1}
        className="flex h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-lg p-0 duration-150 ease-standard motion-reduce:animate-none motion-reduce:duration-0 sm:h-[min(42rem,calc(100dvh-3rem))] sm:w-full sm:max-w-3xl"
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
            <DialogClose
              render={
                <Button type="button" variant="ghost" size="sm" className="min-h-touch">
                  <XIcon data-icon="inline-start" aria-hidden="true" />
                  Close
                </Button>
              }
            />
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
              onNavigate={(href) => {
                completeNavigation()
                void router.navigate({ to: href })
              }}
              onOpenSettings={(scope) => {
                completeNavigation()
                onOpenSettings?.(scope)
              }}
              onToggleTheme={() => {
                setPreference(preference === 'dark' ? 'light' : 'dark')
              }}
            />
          </div>
          {panel.topPage.kind === 'tool-detail' ? (
            <ToolDetailPage
              toolRef={panel.topPage.toolRef}
              onNavigate={completeNavigation}
            />
          ) : null}
        </div>
        <footer
          aria-label="Keyboard shortcuts"
          className="flex shrink-0 flex-wrap items-center justify-between gap-y-1 border-t border-border px-gutter py-intra text-xs text-foreground/80"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">
                ↑↓
              </kbd>
              <span>Navigate</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">
                ↵
              </kbd>
              <span>Select</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">
                esc
              </kbd>
              <span>Back / Close</span>
            </span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">
              /
            </kbd>
            <span>Search</span>
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
