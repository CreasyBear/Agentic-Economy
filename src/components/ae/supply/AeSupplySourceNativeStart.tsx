import { CheckIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { AeInlineState } from '@/components/ae/feedback/AeInlineState'
import { Button } from '@/components/arc/button/button'
import buttonStyles from '@/components/arc/button/button.module.css'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
    if (stage === 'source') {
      focusedStageRef.current = stage
      return
    }
    if (focusedStageRef.current === stage) return
    focusedStageRef.current = stage
    stageHeadingRef.current?.focus()
  }, [stage])

  return (
    <div className="arc-market arc-supply-journey">
      <SupplyProgress current={stage} />
      <SupplyFlowFeedback error={vm.error} requiredAction={vm.requiredAction} success={vm.success} continuation={vm.continuation} publicationLocked={vm.publicationLocked} />

      {stage === 'source' ? (
        <SupplySourceTypeSection
          resourceUrl={vm.resourceUrl}
          x402Method={vm.x402Method}
          askMethod={vm.requiredAction?.title === 'Choose the request method'}
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
          <CompletedStageSummary step="Source" detail={sourceSummary(vm.source)} disabled={vm.pending !== undefined} onEdit={vm.editSource} />
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
          <div className="arc-supply-summaries sticky top-20 z-10">
            <CompletedStageSummary step="Source" detail={sourceSummary(vm.source)} disabled={vm.pending !== undefined || vm.publicationLocked} onEdit={vm.editSource} />
            <CompletedStageSummary step="Tool" detail={vm.selected.title} disabled={vm.pending !== undefined || vm.publicationLocked} onEdit={vm.editTool} />
            {stage === 'review' ? <CompletedStageSummary step="Terms" detail={termsSummary(vm)} disabled={vm.pending !== undefined || vm.publicationLocked} onEdit={vm.editTerms} /> : null}
          </div>
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
    </div>
  )
}

const stages: readonly SupplyStage[] = ['source', 'tool', 'terms', 'review']

function SupplyProgress({ current }: Readonly<{ current: SupplyStage }>) {
  const currentIndex = stages.indexOf(current)
  return (
    <nav aria-label="Add Tool progress">
      <ol className="arc-supply-progress">
        {stages.map((stage, index) => {
          const complete = index < currentIndex
          const active = index === currentIndex
          return (
            <li key={stage} aria-current={active ? 'step' : undefined} data-complete={complete || undefined} className="arc-supply-progress-item">
              <span className="arc-supply-progress-stage">
                <span className="arc-supply-progress-index">
                  {complete ? <CheckIcon aria-hidden="true" className="size-3" /> : index + 1}
                </span>
                <span className="arc-supply-progress-label">{stage}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function CompletedStageSummary({ step, detail, disabled, onEdit }: Readonly<{ step: string; detail: string; disabled: boolean; onEdit: () => void }>) {
  return (
    <div className="arc-supply-summary">
      <span className="arc-supply-summary-copy">
        <span className="arc-supply-summary-label">{step} complete</span>
        <span className="arc-supply-summary-detail" data-numeric={step === 'Terms' || undefined} title={detail}>{detail}</span>
      </span>
      <Button type="button" size="md" variant="ghost" className="arc-supply-summary-edit" disabled={disabled} onClick={onEdit}>Edit {step}</Button>
    </div>
  )
}

function SupplyFlowFeedback({ error, requiredAction, success, continuation, publicationLocked }: Readonly<{
  error: string | undefined
  requiredAction: ReturnType<typeof useSupplyNativeStartState>['requiredAction']
  success: string | undefined
  continuation: SupplyJourneyContinuation | undefined
  publicationLocked: boolean
}>) {
  return (
    <>
      {error === undefined ? null : <Alert id={SUPPLY_PUBLICATION_ERROR_ID} variant="destructive" role="alert" className="arc-supply-feedback"><AlertTitle>Action required</AlertTitle><AlertDescription className="arc-supply-feedback-description"><p>{error}</p>{publicationLocked ? <a href="/owner/operations" className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md} arc-supply-feedback-action`}>Open Tools</a> : null}</AlertDescription></Alert>}
      {requiredAction === undefined ? null : (
        <Alert role="status" className="arc-supply-feedback">
          <AlertTitle>{requiredAction.title}</AlertTitle>
          <AlertDescription className="arc-supply-feedback-description">
            <p>{requiredAction.description}</p>
            {requiredAction.cta === null ? null : (
              <a
                href={requiredAction.cta}
                className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md} arc-supply-feedback-action`}
              >
                {requiredAction.ctaLabel}
              </a>
            )}
          </AlertDescription>
        </Alert>
      )}
      {success === undefined ? null : (
        <Alert className="arc-supply-feedback">
          <AlertTitle>Submitted</AlertTitle>
          <AlertDescription className="arc-supply-feedback-description">
            <p>{success}</p>
            {continuation === undefined ? null : (
              <a
                href={continuation.to}
                className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md} arc-supply-feedback-action`}
              >
                {continuation.label}
              </a>
            )}
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}

function termsSummary(vm: ReturnType<typeof useSupplyNativeStartState>): string {
  const price = publicationPriceSummary(pricingInput(vm.pricingKind, vm.price))
  return `${vm.category || 'Category needed'} · ${price}`
}
