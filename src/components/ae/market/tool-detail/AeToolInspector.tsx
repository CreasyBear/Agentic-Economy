import { useEffect, useRef, useState } from 'react'

import { FileCode2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
    `${tool.listing.label} ${model.summary}`,
  )
  const fullInspectorRef = useRef<HTMLElement>(null)
  const [technicalContractOpen, setTechnicalContractOpen] = useState(false)

  useEffect(() => {
    if (variant === 'full') fullInspectorRef.current?.focus()
  }, [tool.toolRef, variant])

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
      className="flex min-h-0 min-w-0 flex-col gap-0 bg-card lg:h-full"
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
        className="min-h-0 overscroll-contain lg:overflow-y-auto"
      >
        <AeToolDecision tool={tool} model={model} />
        <AeToolTrackRecord evidence={trackRecord} />
        <AeToolFacts tool={tool} model={model} variant="full" />
      </TabsContent>

      <TabsContent
        value="contract"
        className="min-h-0 overscroll-contain px-gutter py-6 lg:overflow-y-auto"
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
      aria-label={`${tool.listing.label} Tool details`}
      data-tool-inspector="full"
      className="ae-nav flex min-h-0 w-full flex-1 flex-col overflow-hidden pb-3 focus:outline-none"
    >
      <div
        data-tool-layout="responsive"
        className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto overscroll-contain bg-card lg:grid-cols-[minmax(0,7fr)_minmax(18rem,3fr)] lg:overflow-hidden"
      >
        <div className="order-2 min-h-0 lg:order-1 lg:overflow-hidden">
          {researchPanel}
        </div>
        <div className="order-1 border-b border-border lg:order-2 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-l">
          {runTicket}
        </div>
      </div>

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
