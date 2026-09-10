import { useEffect, useRef, useState } from 'react'

import { FileCode2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import {
  emptyMarketListingEvidence,
  type MarketListingEvidenceProjection,
} from '@/modules/market/listing-evidence'

import {
  AeToolCompactContract,
  AeToolContractSections,
  AeToolTechnicalContract,
} from './AeToolContractSections'
import { AeToolCompactDecision } from './AeToolCompactDecision'
import { AeToolNextAction } from './AeToolNextAction'
import { AeToolDecision } from './AeToolDecision'
import { AeToolFacts } from './AeToolFacts'
import { AeToolIdentity } from './AeToolIdentity'
import { AeToolPosition } from './AeToolPosition'
import { AeToolTrackRecord } from './AeToolTrackRecord'
import { toToolInspectorModel } from './tool-inspector-model'

export function AeToolInspector({
  tool,
  evidence,
  onNavigate,
  variant,
}: Readonly<{
  tool: PublicToolDescriptor
  evidence?: MarketListingEvidenceProjection
  onNavigate?: () => void
  variant: 'compact' | 'full'
}>) {
  const model = toToolInspectorModel(tool)
  const trackRecord = evidence ?? emptyMarketListingEvidence(
    tool.toolRef,
    tool.contract.capabilityId,
    `${tool.offering.label} ${model.summary}`,
  )
  const fullInspectorRef = useRef<HTMLElement>(null)
  const [technicalContractOpen, setTechnicalContractOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    if (variant === 'full') fullInspectorRef.current?.focus()
  }, [tool.toolRef, variant])

  useEffect(() => {
    if (variant !== 'full') return
    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const syncViewport = () => setIsDesktop(mediaQuery.matches)
    syncViewport()
    mediaQuery.addEventListener('change', syncViewport)
    return () => mediaQuery.removeEventListener('change', syncViewport)
  }, [variant])

  if (variant === 'compact') {
    return (
      <article data-tool-inspector="compact" className="grid min-w-0">
        <AeToolIdentity tool={tool} variant="compact" />
        <div className="grid gap-related px-gutter py-related">
          <p className="text-pretty text-sm text-foreground">{model.summary}</p>
          <AeToolCompactDecision
            tool={tool}
            model={model}
            {...(onNavigate === undefined ? {} : { onNavigate })}
          />
          <AeToolPosition
            tool={tool}
            {...(onNavigate === undefined ? {} : { onNavigate })}
          />
          <AeToolCompactContract tool={tool} model={model} />
        </div>
      </article>
    )
  }

  const runTicket = <AeToolNextAction model={model} variant="full" />

  const researchPanel = (
    <Tabs
      defaultValue="overview"
      className={cn(
        'flex min-h-0 min-w-0 flex-col gap-0 bg-card',
        isDesktop ? 'h-full' : 'h-auto',
      )}
    >
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-gutter">
        <TabsList variant="line" aria-label="Tool views" className="h-12 p-0 max-sm:!h-12">
          <TabsTrigger value="overview" className="min-h-touch px-3">Overview</TabsTrigger>
          <TabsTrigger value="contract" className="min-h-touch px-3">Contract</TabsTrigger>
        </TabsList>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Open schemas and references"
          className="min-h-touch shrink-0"
          onClick={() => setTechnicalContractOpen(true)}
        >
          <FileCode2Icon aria-hidden="true" />
          <span>Schemas</span>
        </Button>
      </div>

      <TabsContent
        value="overview"
        className={cn('min-h-0 overscroll-contain', isDesktop && 'overflow-y-auto')}
      >
        <AeToolDecision tool={tool} model={model} />
        <AeToolTrackRecord evidence={trackRecord} />
        <AeToolFacts tool={tool} model={model} variant="full" />
      </TabsContent>

      <TabsContent
        value="contract"
        className={cn(
          'min-h-0 overscroll-contain px-gutter py-6',
          isDesktop && 'overflow-y-auto',
        )}
      >
        <AeToolContractSections
          tool={tool}
          model={model}
          onOpenTechnicalContract={() => setTechnicalContractOpen(true)}
        />
      </TabsContent>
    </Tabs>
  )

  return (
    <article
      ref={fullInspectorRef}
      tabIndex={-1}
      aria-label={`${tool.offering.label} Tool details`}
      data-tool-inspector="full"
      className="ae-nav flex min-h-0 w-full flex-1 flex-col overflow-hidden pb-3 focus:outline-none"
    >
      {isDesktop ? (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1 overflow-hidden bg-card"
        >
          <ResizablePanel defaultSize="70%" minSize="52%">
            {researchPanel}
          </ResizablePanel>
          <ResizableHandle
            withHandle
            className="[&>div]:h-7 [&>div]:w-3.5 [&>div]:rounded-sm [&>div]:border-border-strong [&>div]:bg-card [&>div]:text-muted-foreground [&>div]:shadow-soft [&>div>svg]:size-3"
          />
          <ResizablePanel defaultSize="30%" minSize="22%" maxSize="42%">
            <div className="h-full overflow-y-auto overscroll-contain">
              {runTicket}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-card">
          <div className="border-b border-border">
            {runTicket}
          </div>
          {researchPanel}
        </div>
      )}

      <Sheet open={technicalContractOpen} onOpenChange={setTechnicalContractOpen}>
        <SheetContent
          side="right"
          className="left-0 right-0 w-auto max-w-none gap-0 p-0 sm:left-auto sm:w-[min(100vw,46rem)] sm:max-w-2xl"
        >
          <SheetHeader className="shrink-0 border-b border-border px-gutter py-related">
            <SheetTitle>Schemas and references</SheetTitle>
            <SheetDescription>
              Exact transport, provenance, payment, data-use, effect, and JSON Schema facts for this Tool.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-gutter">
            <AeToolTechnicalContract tool={tool} />
          </div>
        </SheetContent>
      </Sheet>
    </article>
  )
}
