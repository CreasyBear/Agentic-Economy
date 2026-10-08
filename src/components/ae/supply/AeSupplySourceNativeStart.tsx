import { useEffect, useRef } from 'react'
import { ownerInventoryHref } from '@/lib/operator/owner-inventory-search'

import { AeInlineState } from '@/components/ae/feedback/AeInlineState'
import { AeProviderSetupWizard, type ProviderSetupCompletedStep } from './AeProviderSetupWizard'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { SupplyCandidateSection } from './SupplyCandidateSection'
import { SupplySourceSuggestion } from './SupplySourceSuggestion'
import { SupplyPublicationFlow } from './SupplyPublicationFlow'
import { SupplySourceTypeSection } from './SupplySourceTypeSection'
import {
  SUPPLY_PUBLICATION_ERROR_ID,
  pricingInput,
  publicationPriceSummary,
  sourceSummary,
} from './supply-source-native-start-presentation'
import type { SupplyJourneyContinuation } from './supply-source-native-start-presentation'
import { supplyPublishAuthorityRequired, useReportSupplyNavigationSafety } from './supply-navigation-safety'
import { useSupplyNativeStartState, type SupplyNativeStartProps } from './useSupplyNativeStartState'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import './SupplyJourneyComposition.css'

type SupplyStage = 'source' | 'tool' | 'terms' | 'review'

export function AeSupplySourceNativeStart(props: SupplyNativeStartProps) {
  const vm = useSupplyNativeStartState(props)
  const stage: SupplyStage = vm.selected === undefined
    ? vm.preview === undefined ? 'source' : 'tool'
    : vm.reviewing ? 'review' : 'terms'
  const stageHeadingRef = useRef<HTMLHeadingElement>(null)
  const focusedStageRef = useRef<SupplyStage | null>(null)

  const publishAuthorityRequired = supplyPublishAuthorityRequired(vm)
  useReportSupplyNavigationSafety(props.onNavigationSafetyChange, vm)

  useEffect(() => {
    if (focusedStageRef.current === null) {
      focusedStageRef.current = stage
      return
    }
    if (focusedStageRef.current === stage) return
    focusedStageRef.current = stage
    stageHeadingRef.current?.focus()
  }, [stage])

  const completedSteps: readonly ProviderSetupCompletedStep[] = stage === 'source' ? [] : [
    { id: 'source', title: 'Source', detail: sourceSummary(vm.source), disabled: vm.pending !== undefined || vm.publicationLocked, onEdit: vm.editSource },
    ...(vm.selected === undefined ? [] : [
      { id: 'tool', title: 'Tool', detail: vm.selected.title, disabled: vm.pending !== undefined || vm.publicationLocked, onEdit: vm.editTool },
    ]),
    ...(stage !== 'review' ? [] : [
      { id: 'terms', title: 'Terms', detail: termsSummary(vm), disabled: vm.pending !== undefined || vm.publicationLocked, onEdit: vm.editTerms },
    ]),
  ]

  return (
    <AeProviderSetupWizard
      steps={supplySteps}
      activeStep={stage}
      busy={vm.pending !== undefined}
      completedSteps={completedSteps}
      progressLabel="Add Tool progress"
      feedback={<SupplyFlowFeedback returnToolsHref={ownerInventoryHref(props.returnInventoryQuery ?? {})} error={vm.error} ownerHandoff={vm.ownerHandoff} success={vm.success} continuation={vm.continuation} publicationLocked={vm.publicationLocked} />}
    >

      {stage === 'source' ? (
        <SupplySourceTypeSection
          headingRef={stageHeadingRef}
          resourceUrl={vm.resourceUrl}
          x402Method={vm.x402Method}
          askMethod={vm.ownerHandoff?.title === 'Choose the request method'}
          disabled={vm.pending !== undefined}
          discovering={vm.pending === 'preview'}
          onResourceUrlChange={(next) => {
            vm.setResourceUrl(next)
            vm.setX402Method(undefined)
          }}
          onX402MethodChange={vm.setX402Method}
          onDiscover={() => void vm.findTools()}
        />
      ) : null}

      {stage !== 'tool' || vm.preview === undefined ? null : (
        <div className="grid gap-related">
          <SupplyCandidateSection
            candidates={vm.preview.candidates}
            selectedRef={vm.selectedRef}
            headingRef={stageHeadingRef}
            {...(vm.invalidField === undefined ? {} : { invalidField: vm.invalidField })}
            {...(vm.error === undefined ? {} : { fieldError: vm.error })}
            onSelect={(value) => {
              const candidate = vm.preview?.candidates.find(({ candidateRef }) => candidateRef === value)
              if (candidate !== undefined && candidate.disposition.kind === 'supported') void vm.selectCandidate(candidate)
            }}
          />
        </div>
      )}

      {vm.selected === undefined || (stage !== 'terms' && stage !== 'review') ? null : (
        <div className="grid gap-section">
          {props.initial !== undefined && stage === 'terms' ? (
            <p className="text-sm text-muted-foreground">
              {publishAuthorityRequired
                ? 'Review the restored terms and confirm publication authority before submitting.'
                : 'Review the restored terms. Publication stays under review until Provider authority is established.'}
            </p>
          ) : null}
          <SupplyPublicationFlow
            reviewing={stage === 'review'}
            name={vm.name}
            description={vm.description}
            descriptionSuggestion={props.onAssess === undefined || vm.preview === undefined || vm.source === undefined ? undefined : (
              <SupplySourceSuggestion
                key={`${vm.preview.sourceDigest}:${vm.selected.candidateRef}:${vm.connectionRef}:${vm.description}:${vm.pending ?? ''}:${vm.publicationLocked}`}
                input={{ businessId: props.businessRef, source: vm.source,
                  expectedSourceDigest: vm.preview.sourceDigest, expectedSourceRevision: vm.preview.sourceRevision,
                  candidateRef: vm.selected.candidateRef,
                  ...(vm.connectionRef ? { connectionRef: vm.connectionRef } : {}) }}
                disabled={vm.pending !== undefined || vm.publicationLocked}
                onAssess={props.onAssess}
                onUse={vm.setDescription}
              />
            )}
            category={vm.category}
            serviceArea={vm.serviceArea}
            availability={vm.availability}
            selected={vm.selected}
            pricingKind={vm.pricingKind}
            price={vm.price}
            connectionRef={vm.connectionRef}
            eligibleConnections={vm.eligibleConnections}
            connecting={vm.pending === 'connect'}
            externalEffect={vm.externalEffect}
            dataRelease={vm.dataRelease}
            financialExposure={vm.financialExposure}
            dataClassification={vm.dataClassification}
            attestation={vm.attestation}
            saving={vm.pending === 'publish'}
            disabled={vm.pending !== undefined || vm.publicationLocked}
            headingRef={stageHeadingRef}
            {...(vm.invalidField === undefined ? {} : { invalidField: vm.invalidField })}
            {...(vm.error === undefined ? {} : { fieldError: vm.error })}
            onNameChange={vm.setName}
            onDescriptionChange={vm.setDescription}
            onCategoryChange={vm.setCategory}
            onServiceAreaChange={vm.setServiceArea}
            onAvailabilityChange={vm.setAvailability}
            onPricingKindChange={vm.setPricingKind}
            onPriceChange={vm.setPrice}
            onConnectionRefChange={vm.setConnectionRef}
            onConnect={() => void vm.connectSelectedSource()}
            onExternalEffectChange={vm.setExternalEffect}
            onDataReleaseChange={vm.setDataRelease}
            onFinancialExposureChange={vm.setFinancialExposure}
            onDataClassificationChange={vm.setDataClassification}
            onAttestationChange={(key, checked) => vm.setAttestation((current) => ({ ...current, [key]: checked }))}
            onContinueToReview={vm.continueToReview}
            onEditTerms={vm.editTerms}
            onSubmit={() => void vm.submit()}
            publishAuthorityRequired={publishAuthorityRequired}
          />
        </div>
      )}
      {vm.pending === 'select' ? <div role="status" aria-live="polite"><AeInlineState state="saving" description="Saving the selected Tool so you can return later." /></div> : null}
    </AeProviderSetupWizard>
  )
}

const supplySteps = [
  { id: 'source', title: 'Source' },
  { id: 'tool', title: 'Tool' },
  { id: 'terms', title: 'Terms' },
  { id: 'review', title: 'Review' },
] as const

function SupplyFlowFeedback({ returnToolsHref, error, ownerHandoff, success, continuation, publicationLocked }: Readonly<{
  returnToolsHref: string
  error: string | undefined
  ownerHandoff: ReturnType<typeof useSupplyNativeStartState>['ownerHandoff']
  success: string | undefined
  continuation: SupplyJourneyContinuation | undefined
  publicationLocked: boolean
}>) {
  return (
    <>
      {error === undefined ? null : <AeAlert tone="danger" title="Action required" id={SUPPLY_PUBLICATION_ERROR_ID} role="alert" className="arc-supply-feedback"><div className="arc-supply-feedback-description"><p>{error}</p>{publicationLocked ? <a href={returnToolsHref} className={`${actionLinkClassName('secondary', 'md')} arc-supply-feedback-action`}>Open Tools</a> : null}</div></AeAlert>}
      {ownerHandoff === undefined ? null : (
        <AeAlert tone="info" title={ownerHandoff.title} role="status" className="arc-supply-feedback"><div className="arc-supply-feedback-description">
            <p>{ownerHandoff.description}</p>
            <a
                href={ownerHandoff.destination}
                className={`${actionLinkClassName('secondary', 'md')} arc-supply-feedback-action`}
              >
                {ownerHandoff.ctaLabel}
              </a>
          </div></AeAlert>
      )}
      {success === undefined ? null : (
        <AeAlert role="alert" tone="info" title="Submitted" className="arc-supply-feedback"><div className="arc-supply-feedback-description">
            <p>{success}</p>
            {continuation === undefined ? null : (
              <a
                href={continuation.to}
                className={`${actionLinkClassName('secondary', 'md')} arc-supply-feedback-action`}
              >
                {continuation.label}
              </a>
            )}
          </div></AeAlert>
      )}
    </>
  )
}

function termsSummary(vm: ReturnType<typeof useSupplyNativeStartState>): string {
  const price = publicationPriceSummary(pricingInput(vm.pricingKind, vm.price))
  return `${vm.category || 'Category needed'} · ${price}`
}
