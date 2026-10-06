import { useEffect, useRef, useState } from 'react'

import { FileCode2Icon } from 'lucide-react'

import { Button } from '@/components/arc/button/button'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ae/shared/arc/drawer/AeDrawerContent'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import {
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
  const fullInspectorRef = useRef<HTMLElement>(null)
  const drawerReturnFocusRef = useRef<HTMLElement | null>(null)
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

  const researchPanel = (
    <Tabs
      defaultValue="overview"
      className="flex min-w-0 flex-col gap-0"
    >
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-gutter">
        <TabsList aria-label="Tool views" className="h-12 p-0 max-sm:!h-12">
          <TabsTrigger value="overview" className="min-h-touch px-3">Overview</TabsTrigger>
          <TabsTrigger value="contract" className="min-h-touch px-3">Contract</TabsTrigger>
        </TabsList>
        <DrawerTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Open schemas and references"
            className="min-h-touch shrink-0"
          >
            <FileCode2Icon aria-hidden="true" />
            <span>Schemas</span>
          </Button>
        </DrawerTrigger>
      </div>

      <TabsContent
        value="overview"
        className="min-w-0"
      >
        <AeToolDecision tool={tool} model={model} />
        <AeToolTrackRecord {...(evidence === undefined ? {} : { evidence })} />
        <AeToolFacts tool={tool} model={model} variant="full" />
      </TabsContent>

      <TabsContent
        value="contract"
        className="min-w-0 px-gutter py-6"
      >
        <AeToolContractSections
          tool={tool}
          model={model}
          onOpenTechnicalContract={() => setTechnicalContractOpen(true)}
        />
      </TabsContent>
    </Tabs>
  )

  const continuation = <AeToolNextAction model={model} variant="full" />

  return (
    <article
      ref={fullInspectorRef}
      tabIndex={-1}
      aria-label={`${tool.listing.label} Tool details`}
      data-tool-inspector="full"
      className="min-w-0 outline-none focus:outline-solid focus:outline-2 focus:outline-offset-2 focus:outline-ring"
    >
      <Drawer open={technicalContractOpen} onOpenChange={setTechnicalContractOpen}>
        <div data-tool-layout="responsive" className="min-w-0">
          {researchPanel}
          {continuation}
        </div>

        <DrawerContent
          side="right"
          title="Schemas and references"
          description="Exact transport, provenance, payment, data-use, effect, and JSON Schema facts for this Tool."
          closeLabel="Close schemas and references"
          onOpenAutoFocus={() => {
            const activeElement = document.activeElement
            drawerReturnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null
          }}
          onCloseAutoFocus={event => {
            event.preventDefault()
            const returnTarget = drawerReturnFocusRef.current
            drawerReturnFocusRef.current = null
            if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true })
          }}
        >
          <AeToolTechnicalContract tool={tool} />
        </DrawerContent>
      </Drawer>
    </article>
  )
}
