'use client'

import { lazy, Suspense, useState } from 'react'

import { useRouter } from '@tanstack/react-router'
import { ArrowLeftIcon, SearchIcon, XIcon } from 'lucide-react'

import { useAppearance } from '@/components/ae/theme/ThemeProvider'
import { AeRenderErrorBoundary } from '@/components/ae/feedback/AeObservabilityErrorBoundary'

import { Button } from '@/components/arc/button/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

import { useCommandPanel } from './CommandPanelProvider'
import { useCommandPanelHotKeys } from './useCommandPanelHotKeys'
import { ToolsSearchPageSkeleton } from './tools-search-page/ToolsSearchPageSkeleton'
import { ToolDetailPageSkeleton } from './pages/ToolDetailPageSkeleton'
import './CommandPanelComposition.css'

const PANEL_CONTENT_ID = 'ae-command-panel-content'
const ToolsSearchPage = lazy(() => import('./tools-search-page/ToolsSearchPage').then(module => ({ default: module.ToolsSearchPage })))
const ToolDetailPage = lazy(() => import('./pages/ToolDetailPage').then(module => ({ default: module.ToolDetailPage })))

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
            variant="secondary"
            size="md"
            className="arc-market arc-command-trigger"
            aria-label="Find tools"
            aria-controls={PANEL_CONTENT_ID}
          >
            <SearchIcon aria-hidden="true" />
            <span className="arc-command-trigger-label">Find tools</span>
            <kbd className="arc-command-trigger-key">
              ⌘K
            </kbd>
          </Button>
        }
      />
      <DialogContent
        id={PANEL_CONTENT_ID}
        showCloseButton={false}
        instant
        className="arc-market arc-command-panel"
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
        {panel.pageCount === 1 ? (
          <DialogClose render={<Button type="button" variant="ghost" size="md" className="arc-command-search-close" aria-label="Close"><XIcon aria-hidden="true" /></Button>} />
        ) : null}
        {panel.pageCount > 1 ? (
          <div className="arc-command-layer-bar">
            <Button type="button" variant="ghost" size="md" onClick={panel.popPage}>
              <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
              Back
            </Button>
            <DialogClose
              render={
                <Button type="button" variant="ghost" size="md">
                  <XIcon data-icon="inline-start" aria-hidden="true" />
                  Close
                </Button>
              }
            />
          </div>
        ) : null}
        <div className="arc-command-body" data-testid="command-panel-body">
          <AeRenderErrorBoundary fallback={<p role="alert">Tool search could not load. <a href="/market?view=tools">Browse Tools</a></p>}>
          <div
            hidden={panel.topPage.kind !== 'tools-search'}
            className="contents"
            aria-hidden={panel.topPage.kind !== 'tools-search'}
          >
            <Suspense fallback={<ToolsSearchPageSkeleton />}>
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
            </Suspense>
          </div>
          {panel.topPage.kind === 'tool-detail' ? (
            <Suspense fallback={<ToolDetailPageSkeleton />}>
            <ToolDetailPage
              toolRef={panel.topPage.toolRef}
              onNavigate={completeNavigation}
            />
            </Suspense>
          ) : null}
          </AeRenderErrorBoundary>
        </div>
        <footer
          aria-label="Keyboard shortcuts"
          className="arc-command-footer"
        >
          <div className="arc-command-footer-hints">
            <span className="arc-command-footer-hint">
              <kbd>
                ↑↓
              </kbd>
              <span>Navigate</span>
            </span>
            <span className="arc-command-footer-hint">
              <kbd>
                ↵
              </kbd>
              <span>Select</span>
            </span>
            <span className="arc-command-footer-hint">
              <kbd>
                esc
              </kbd>
              <span>Back / Close</span>
            </span>
          </div>
          <span className="arc-command-footer-hint arc-command-footer-search-hint">
            <kbd>
              /
            </kbd>
            <span>Search</span>
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
