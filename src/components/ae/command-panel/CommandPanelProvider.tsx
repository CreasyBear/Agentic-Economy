'use client'

import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'

import {
  readPublicOperationDetailRouteServer,
  type PublicOperationDetailRouteResult,
} from '@/modules/registry/operation-detail-route.functions'

import {
  initialCommandPanelPages,
  popCommandPanelPage,
  pushCommandPanelPage,
  topCommandPanelPage,
  type CommandPanelPage,
  type CommandPanelStack,
} from './command-panel-state'

/** Reader for one operation's canonical detail; injectable for tests. */
export type OperationDetailReader = (
  operationRef: string,
) => Promise<PublicOperationDetailRouteResult>

export type BuyerCredentialPresenceReader = () => Promise<boolean>

export function readCanonicalOperationDetail(
  operationRef: string,
): Promise<PublicOperationDetailRouteResult> {
  return readPublicOperationDetailRouteServer({ data: { operationRef } })
}

const OperationDetailReaderContext =
  createContext<OperationDetailReader | undefined>(undefined)
const BuyerCredentialPresenceReaderContext =
  createContext<BuyerCredentialPresenceReader | undefined>(undefined)
const missingBuyerCredentialReader: BuyerCredentialPresenceReader = async () => false

/**
 * Resolves the detail reader the current subtree was given, falling back to
 * the canonical `/operations/$operationRef` server function.
 */
export function useOperationDetailReader(): OperationDetailReader {
  const injected = use(OperationDetailReaderContext)
  return injected ?? readCanonicalOperationDetail
}

export function useBuyerCredentialPresenceReader(): BuyerCredentialPresenceReader {
  const injected = use(BuyerCredentialPresenceReaderContext)
  return injected ?? missingBuyerCredentialReader
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
  popPage(): void
  pushInspect(operationRef: string): void
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
  readBuyerCredentialPresence,
  children,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Injectable so harnesses never hit the network for detail reads. */
  readDetail?: OperationDetailReader
  /** Existing owner-key read projected to the one credential fact the panel needs. */
  readBuyerCredentialPresence?: BuyerCredentialPresenceReader
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

  const popPage = useCallback(() => {
    const next = popCommandPanelPage(pages)
    setPages(next.pages)
    if (next.closeRequested) onOpenChange(false)
  }, [onOpenChange, pages])

  const pushInspect = useCallback((operationRef: string) => {
    setPages((currentPages) =>
      pushCommandPanelPage(currentPages, { kind: 'operation-inspect', operationRef }),
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
      popPage,
      pushInspect,
    }),
    [closePanel, openPanel, open, pages, popPage, pushInspect, toggle],
  )

  return (
    <BuyerCredentialPresenceReaderContext.Provider value={readBuyerCredentialPresence}>
      <OperationDetailReaderContext.Provider value={readDetail}>
        <CommandPanelContext.Provider value={value}>{children}</CommandPanelContext.Provider>
      </OperationDetailReaderContext.Provider>
    </BuyerCredentialPresenceReaderContext.Provider>
  )
}
