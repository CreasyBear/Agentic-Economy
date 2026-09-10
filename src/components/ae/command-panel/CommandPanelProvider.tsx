'use client'

import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'

import {
  readPublicToolDetailRouteServer,
  type PublicToolDetailRouteResult,
} from '@/modules/registry/tool-detail-route.functions'

import {
  initialCommandPanelPages,
  popCommandPanelPage,
  pushCommandPanelPage,
  topCommandPanelPage,
  type CommandPanelPage,
  type CommandPanelStack,
} from './command-panel-state'

/** Reader for one Tool's canonical detail; injectable for tests. */
export type ToolDetailReader = (
  toolRef: string,
) => Promise<PublicToolDetailRouteResult>

export function readCanonicalToolDetail(
  toolRef: string,
): Promise<PublicToolDetailRouteResult> {
  return readPublicToolDetailRouteServer({ data: { toolRef } })
}

const ToolDetailReaderContext =
  createContext<ToolDetailReader | undefined>(undefined)

/**
 * Resolves the detail reader the current subtree was given, falling back to
 * the canonical `/tools/$toolRef` server function.
 */
export function useToolDetailReader(): ToolDetailReader {
  const injected = use(ToolDetailReaderContext)
  return injected ?? readCanonicalToolDetail
}

type CommandPanelContextValue = Readonly<{
  /** Open flag from the operator shell; independent of the page deck. */
  isOpen: boolean
  /** Page deck; unaffected by toggling so ⌘K flicker keeps context. */
  pages: CommandPanelStack
  pageCount: number
  topPage: CommandPanelPage
  toggle(): void
  open(): void
  close(): void
  completeNavigation(): void
  popPage(): void
  pushToolDetail(toolRef: string): void
}>

const CommandPanelContext = createContext<CommandPanelContextValue | null>(null)

export function useCommandPanel(): CommandPanelContextValue {
  const value = use(CommandPanelContext)
  if (value === null) throw new Error('useCommandPanel must run inside CommandPanelProvider')
  return value
}

/**
 * Controlled by the operator shell's `commandOpen` flag (the sidebar quick
 * action and the header trigger both live there) while owning the page deck.
 */
export function CommandPanelProvider({
  open,
  onOpenChange,
  readDetail,
  children,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Injectable so harnesses never hit the network for detail reads. */
  readDetail?: ToolDetailReader
  children: ReactNode
}>) {
  const [pages, setPages] = useState<CommandPanelStack>(initialCommandPanelPages)

  const toggle = useCallback(() => {
    onOpenChange(!open)
  }, [onOpenChange, open])
  const openPanel = useCallback(() => {
    onOpenChange(true)
  }, [onOpenChange])
  const closePanel = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])
  const completeNavigation = useCallback(() => {
    setPages(initialCommandPanelPages)
    onOpenChange(false)
  }, [onOpenChange])

  const popPage = useCallback(() => {
    const next = popCommandPanelPage(pages)
    setPages(next.pages)
    if (next.closeRequested) onOpenChange(false)
  }, [onOpenChange, pages])

  const pushToolDetail = useCallback((toolRef: string) => {
    setPages((currentPages) =>
      pushCommandPanelPage(currentPages, { kind: 'tool-detail', toolRef }),
    )
  }, [])

  const value = useMemo<CommandPanelContextValue>(
    () => ({
      isOpen: open,
      pages,
      pageCount: pages.length,
      topPage: topCommandPanelPage(pages),
      toggle,
      open: openPanel,
      close: closePanel,
      completeNavigation,
      popPage,
      pushToolDetail,
    }),
    [closePanel, completeNavigation, openPanel, open, pages, popPage, pushToolDetail, toggle],
  )

  return (
    <ToolDetailReaderContext.Provider value={readDetail}>
      <CommandPanelContext.Provider value={value}>{children}</CommandPanelContext.Provider>
    </ToolDetailReaderContext.Provider>
  )
}
