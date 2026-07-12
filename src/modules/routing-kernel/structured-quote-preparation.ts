import { canonicalAuthorityDigest } from './internal/authority-digest'
import type { CapabilityBinding, CapabilityBindingAdapter, KernelCaller, StructuredBindingQuote } from './internal/model'
import type { IncidentEvaluator } from './incident-control'
import {
  createPreparationCandidateSet,
  createProviderOffer,
  createQuotePreparationCommand,
  type ProviderOffer,
  type PreparationCandidateCoverage,
  type PreparationCandidate,
  type QuotePreparationAttempt,
  type StructuredQuotePreparationStore,
} from './structured-quote-preparation-store'

type Scalar = string | number | boolean
type StructuredAdapter = CapabilityBindingAdapter & Readonly<{
  binding: CapabilityBinding & Required<Pick<CapabilityBinding, 'registrationHash' | 'environment'>>
  quoteStructured: NonNullable<CapabilityBindingAdapter['quoteStructured']>
}>

export type StructuredPreparationReleaseResult =
  | Readonly<{ kind: 'released'; allocationId: string; providerEvidenceRef: string; releasedAt: number }>
  | Readonly<{ kind: 'uncertain'; allocationId: string; nextAction: string }>
  | Readonly<{ kind: 'refused'; reason: string; nextAction: string }>

export type StructuredPreparationInput = Readonly<{
  preparationRequestId: string
  customerRequestId: string
  planRevisionId: string
  actionId: string
  generation: number
  networkId: string
  caller: KernelCaller
  capabilityContractId: string
  capabilityContractVersion: string
  currency: string
  maximumSpendMinor: number
  purpose: string
  protectedFieldNames: readonly string[]
  allowedExecutionDataFields: readonly string[]
  requiredOfferOutputs: readonly Readonly<{ field: string; valueType: 'string' | 'integer' | 'boolean' | 'url' | 'money_minor' }>[]
  resolveCandidatePresentation?: (input: Readonly<{ bindingId: string; nodeId: string }>) => Promise<Readonly<{
    recipientName: string
    presentationEvidenceDigest: string
  }> | undefined>
  releaseForCandidate: (input: Readonly<{
    releaseKey: string
    recipient: Readonly<{ bindingId: string; nodeId: string; businessId: string; name: string }>
    purpose: string
    fields: readonly string[]
    release: (input: Readonly<{ allocationId: string; protectedValues: Readonly<Record<string, Scalar>> }>) => Promise<Readonly<{
      kind: 'released'
      providerEvidenceRef: string
    }>>
  }>) => Promise<StructuredPreparationReleaseResult>
  reconcileCandidateRelease?: (input: Readonly<{ allocationId: string; providerEvidenceRef: string }>) => Promise<void>
}>

export type StructuredPreparedCandidate = Readonly<{
  offer: ProviderOffer
  expectedCost: Readonly<{ currency: string; amountMinor: number }>
  maximumCost: Readonly<{ currency: string; amountMinor: number }>
  expectedLatencyMs: number
  executionDataFields: readonly string[]
  disclosures: readonly string[]
}>

export type StructuredPreparationResult =
  | Readonly<{
    kind: 'preparation_pending'
    candidateSetDigest: string
    attempts: readonly QuotePreparationAttempt[]
    coverage: readonly PreparationCandidateCoverage[]
  }>
  | Readonly<{
    kind: 'candidates_prepared'
    candidateSetDigest: string
    candidates: readonly StructuredPreparedCandidate[]
    attempts: readonly QuotePreparationAttempt[]
    coverage: readonly PreparationCandidateCoverage[]
    frozenCandidates: readonly PreparationCandidate[]
  }>
  | Readonly<{
    kind: 'insufficient_options'
    candidateSetDigest?: string
    attempts: readonly QuotePreparationAttempt[]
    reason: string
  }>

export type CurrentStructuredBindingEvidence = Readonly<{
  bindingId: string
  nodeId: string
  networkId: string
  capabilityContractId: string
  admission: 'admitted' | 'not_admitted'
  conformance: 'conformant' | 'not_conformant'
  registrationHash: string
  environment: string
  quotePreparation: 'public_query' | 'structured_authorized'
}>

export function createStructuredQuotePreparationOperation(input: Readonly<{
  bindings: readonly CapabilityBindingAdapter[]
  store: StructuredQuotePreparationStore
  incidentControl: IncidentEvaluator
  now: () => number
  resolveCurrentBinding?: (bindingId: string) => Promise<CurrentStructuredBindingEvidence | undefined>
}>): (request: StructuredPreparationInput) => Promise<StructuredPreparationResult> {
  return async (request) => {
    const existingCandidateSet = await input.store.getCandidateSet(request.preparationRequestId)
    const discovered = existingCandidateSet === undefined
      ? await discoverCandidates(request, input.bindings, input.incidentControl)
      : []
    if (existingCandidateSet === undefined && discovered.length === 0) return { kind: 'insufficient_options', attempts: [], reason: 'no_eligible_binding' }
    const discoveredCandidates = await Promise.all(discovered.map(async ({ adapter, incidentEpochDigest }) => {
      const presentation = await request.resolveCandidatePresentation?.({
        bindingId: adapter.binding.bindingId, nodeId: adapter.binding.nodeId,
      })
      return {
        bindingId: adapter.binding.bindingId, nodeId: adapter.binding.nodeId, businessId: adapter.binding.nodeId,
        recipientName: presentation?.recipientName ?? adapter.binding.nodeId,
        presentationEvidenceDigest: presentation?.presentationEvidenceDigest
          ?? canonicalAuthorityDigest({ bindingId: adapter.binding.bindingId, nodeId: adapter.binding.nodeId }),
        capabilityContractId: request.capabilityContractId, capabilityContractVersion: request.capabilityContractVersion,
        registrationEnvironment: adapter.binding.environment, registrationHash: adapter.binding.registrationHash,
        registrationEvidenceDigest: registrationEvidenceDigest(adapter), incidentEpochDigest, incidentEvidenceDigest: incidentEpochDigest,
      }
    }))
    const candidateSet = existingCandidateSet ?? createPreparationCandidateSet({
      preparationRequestId: request.preparationRequestId,
      customerRequestId: request.customerRequestId,
      planRevisionId: request.planRevisionId,
      actionId: request.actionId,
      generation: request.generation,
      capabilityContractId: request.capabilityContractId,
      capabilityContractVersion: request.capabilityContractVersion,
      createdAt: input.now(),
      candidates: discoveredCandidates,
    })
    const stored = await input.store.putCandidateSet(candidateSet)
    if (stored.kind === 'conflict') return { kind: 'insufficient_options', attempts: [], reason: 'candidate_set_conflict' }
    const existingCoverage = new Set((await input.store.listCandidateCoverage(candidateSet.candidateSetDigest)).map((item) => item.bindingId))
    await Promise.all(candidateSet.candidates.filter((candidate) => !existingCoverage.has(candidate.bindingId)).map(async (candidate) => {
      await input.store.recordCandidateCoverage({
        candidateSetDigest: candidateSet.candidateSetDigest, bindingId: candidate.bindingId, nodeId: candidate.nodeId,
        disposition: 'eligible_not_contacted', protectedData: 'not_released', providerContact: 'none',
        reasonCode: 'eligible_not_contacted', recordedAt: candidateSet.createdAt,
      })
    }))

    const candidates = candidateSet.candidates.flatMap((candidate) => {
      const adapter = input.bindings.find((entry) => entry.binding.bindingId === candidate.bindingId)
      return adapter === undefined ? [] : [{ adapter: adapter as StructuredAdapter, incidentEpochDigest: candidate.incidentEpochDigest }]
    })
    await Promise.all(candidateSet.candidates.filter((candidate) => !candidates.some(({ adapter }) => adapter.binding.bindingId === candidate.bindingId)).map(async (candidate) => {
      await input.store.recordCandidateCoverage({
        candidateSetDigest: candidateSet.candidateSetDigest, bindingId: candidate.bindingId, nodeId: candidate.nodeId,
        disposition: 'registration_stale', protectedData: 'not_released', providerContact: 'none',
        reasonCode: 'binding_no_longer_registered', recordedAt: input.now(),
      })
    }))
    let reconciliationPending = false
    const ensureCandidateRelease = async (allocationId: string, providerEvidenceRef: string) => {
      try {
        await request.reconcileCandidateRelease?.({ allocationId, providerEvidenceRef })
        return true
      } catch {
        reconciliationPending = true
        return false
      }
    }
    const results = await Promise.all(candidates.map(async ({ adapter, incidentEpochDigest }) => {
      const frozenCandidate = candidateSet.candidates.find((candidate) => candidate.bindingId === adapter.binding.bindingId)
      if (frozenCandidate === undefined) throw new Error('structured_quote_frozen_candidate_missing')
      const quoteAttemptId = `structured-quote:${canonicalAuthorityDigest({
        preparationRequestId: request.preparationRequestId,
        candidateSetDigest: candidateSet.candidateSetDigest,
        bindingId: adapter.binding.bindingId,
      })}`
      const currentBinding = await (input.resolveCurrentBinding === undefined
        ? Promise.resolve(currentBindingEvidence(adapter))
        : input.resolveCurrentBinding(adapter.binding.bindingId))
      if (!sameBindingEvidence(currentBinding, adapter)) {
        await recordCoverage(input.store, candidateSet.candidateSetDigest, adapter, 'registration_stale', 'not_released', 'none', 'registration_evidence_changed', input.now())
        return undefined
      }
      const preReleaseIncident = await input.incidentControl.evaluate(bindingScope(request, adapter), 'data_release')
      if (preReleaseIncident.kind === 'frozen' || preReleaseIncident.epochDigest !== incidentEpochDigest) {
        await recordCoverage(input.store, candidateSet.candidateSetDigest, adapter, 'incident_frozen', 'not_released', 'none', 'incident_epoch_changed', input.now())
        return undefined
      }
      const existing = await input.store.getQuoteAttempt(quoteAttemptId)
      if (existing !== undefined) {
        if (existing.disposition === 'quoted') {
          const released = await ensureCandidateRelease(existing.command.allocationId, existing.offer.providerOfferId)
          return released ? candidateFromAttempt(existing) : undefined
        }
        if ((existing.disposition !== 'dispatched' && existing.disposition !== 'uncertain')
          || adapter.reconcileStructuredQuote === undefined) return candidateFromAttempt(existing)
        const reconciled = await adapter.reconcileStructuredQuote({
          quoteAttemptId,
          allocationId: existing.command.allocationId,
          recipient: { bindingId: adapter.binding.bindingId, nodeId: adapter.binding.nodeId },
          capabilityContractId: request.capabilityContractId,
          capabilityContractVersion: request.capabilityContractVersion,
          registrationHash: adapter.binding.registrationHash,
          environment: adapter.binding.environment,
        })
        const resolvedAt = input.now()
        if (reconciled.kind === 'refused') {
          await input.store.resolveQuoteAttempt({
            quoteAttemptId, commandDigest: existing.commandDigest, disposition: 'refused', resolvedAt, reasonCode: reconciled.reason,
          })
          await ensureCandidateRelease(existing.command.allocationId,
            `provider-refusal:${canonicalAuthorityDigest({ quoteAttemptId, reason: reconciled.reason })}`)
          return undefined
        }
        if (reconciled.kind !== 'quoted' || !structuredQuoteMatchesCandidate(reconciled, adapter, request, resolvedAt)
          || reconciled.providerQuoteRef === undefined || reconciled.providerQuoteExpiresAt === undefined) return undefined
        const offer = providerOfferFromQuote(reconciled, existing.command, candidateSet.candidateSetDigest, adapter.binding.nodeId, resolvedAt)
        await input.store.resolveQuoteAttempt({
          quoteAttemptId, commandDigest: existing.commandDigest, disposition: 'quoted', resolvedAt, offer,
        })
        if (!await ensureCandidateRelease(existing.command.allocationId, offer.providerOfferId)) return undefined
        const resolved = await input.store.getQuoteAttempt(quoteAttemptId)
        return resolved === undefined ? undefined : candidateFromAttempt(resolved)
      }
      let quote: StructuredBindingQuote | undefined
      const released = await request.releaseForCandidate({
        releaseKey: quoteAttemptId,
        recipient: {
          bindingId: adapter.binding.bindingId, nodeId: adapter.binding.nodeId,
          businessId: adapter.binding.nodeId, name: frozenCandidate.recipientName,
        },
        purpose: request.purpose,
        fields: request.protectedFieldNames,
        release: async ({ allocationId, protectedValues }) => {
          const releaseBinding = await (input.resolveCurrentBinding === undefined
            ? Promise.resolve(currentBindingEvidence(adapter))
            : input.resolveCurrentBinding(adapter.binding.bindingId))
          if (!sameBindingEvidence(releaseBinding, adapter)) {
            await recordCoverage(input.store, candidateSet.candidateSetDigest, adapter, 'registration_stale', 'not_released', 'none', 'registration_evidence_changed', input.now())
            throw new Error('structured_quote_registration_stale')
          }
          const currentIncident = await input.incidentControl.evaluate(bindingScope(request, adapter), 'data_release')
          if (currentIncident.kind === 'frozen' || currentIncident.epochDigest !== incidentEpochDigest) {
            await recordCoverage(input.store, candidateSet.candidateSetDigest, adapter, 'incident_frozen', 'not_released', 'none', 'incident_epoch_changed', input.now())
            throw new Error('structured_quote_incident_epoch_stale')
          }
          const command = createQuotePreparationCommand({
            quoteAttemptId,
            preparationRequestId: request.preparationRequestId,
            candidateSetDigest: candidateSet.candidateSetDigest,
            recipient: { bindingId: adapter.binding.bindingId, nodeId: adapter.binding.nodeId, businessId: adapter.binding.nodeId },
            purpose: request.purpose,
            fieldNames: request.protectedFieldNames,
            capabilityContractId: request.capabilityContractId,
            capabilityContractVersion: request.capabilityContractVersion,
            registrationHash: adapter.binding.registrationHash,
            registrationEnvironment: adapter.binding.environment,
            registrationEvidenceDigest: registrationEvidenceDigest(adapter),
            allocationId,
            claimedAt: input.now(),
          })
          const claim = await input.store.claimQuoteAttempt(command)
          if (claim.kind === 'conflict' || claim.kind === 'candidate_set_not_found' || claim.kind === 'candidate_not_bound' || claim.kind === 'candidate_evidence_stale') {
            throw new Error(`structured_quote_${claim.kind}`)
          }
          if (!('attempt' in claim)) throw new Error('structured_quote_claim_invalid')
          const attempt = claim.attempt
          if (attempt.disposition === 'quoted') return { kind: 'released', providerEvidenceRef: attempt.offer.providerOfferId }
          if (attempt.disposition !== 'allocated') throw new Error(`structured_quote_attempt_${attempt.disposition}`)
          await recordCoverage(input.store, candidateSet.candidateSetDigest, adapter, 'allocated', 'not_released', 'none', 'release_allocated', input.now())
          const dispatched = await input.store.markDispatched({ quoteAttemptId, commandDigest: command.commandDigest, dispatchedAt: input.now() })
          if (dispatched.kind !== 'updated' && dispatched.kind !== 'existing') throw new Error(`structured_quote_dispatch_${dispatched.kind}`)
          await recordCoverage(input.store, candidateSet.candidateSetDigest, adapter, 'dispatch_attempted', 'released', 'attempted', 'provider_contact_attempted', input.now())
          const response = adapter.quoteStructured === undefined
            ? { kind: 'refused' as const, reason: 'structured_quote_unsupported' }
            : await adapter.quoteStructured({
              quoteAttemptId,
              allocationId,
              recipient: { bindingId: adapter.binding.bindingId, nodeId: adapter.binding.nodeId },
              capabilityContractId: request.capabilityContractId,
              capabilityContractVersion: request.capabilityContractVersion,
              registrationHash: adapter.binding.registrationHash,
              environment: adapter.binding.environment,
              data: protectedValues,
            })
          const resolvedAt = input.now()
          if (response.kind === 'quoted') {
            const providerOfferRef = response.providerQuoteRef
            const providerQuoteExpiresAt = response.providerQuoteExpiresAt
            if (providerOfferRef === undefined || providerQuoteExpiresAt === undefined) {
              await input.store.resolveQuoteAttempt({
                quoteAttemptId, commandDigest: command.commandDigest, disposition: 'refused', resolvedAt,
                reasonCode: 'provider_quote_identity_missing',
              })
              return { kind: 'released', providerEvidenceRef: quoteAttemptId }
            }
            if (!structuredQuoteMatchesCandidate(response, adapter, request, resolvedAt)) {
              await input.store.resolveQuoteAttempt({
                quoteAttemptId, commandDigest: command.commandDigest, disposition: 'refused', resolvedAt,
                reasonCode: 'provider_quote_contract_mismatch',
              })
              return { kind: 'released', providerEvidenceRef: quoteAttemptId }
            }
            quote = response
            const offer = providerOfferFromQuote(response, command, candidateSet.candidateSetDigest, adapter.binding.nodeId, resolvedAt)
            await input.store.resolveQuoteAttempt({ quoteAttemptId, commandDigest: command.commandDigest, disposition: 'quoted', resolvedAt, offer })
            return { kind: 'released', providerEvidenceRef: offer.providerOfferId }
          }
          await input.store.resolveQuoteAttempt({
            quoteAttemptId,
            commandDigest: command.commandDigest,
            disposition: response.kind === 'uncertain' ? 'uncertain' : 'refused',
            resolvedAt,
            reasonCode: response.reason,
          })
          if (response.kind === 'uncertain') throw new Error(response.reason)
          return { kind: 'released', providerEvidenceRef: quoteAttemptId }
        },
      })
      if (released.kind !== 'released') {
        const currentCoverage = (await input.store.listCandidateCoverage(candidateSet.candidateSetDigest))
          .find((item) => item.bindingId === adapter.binding.bindingId)
        if (currentCoverage?.disposition !== 'registration_stale' && currentCoverage?.disposition !== 'incident_frozen') {
          await recordCoverage(
            input.store, candidateSet.candidateSetDigest, adapter,
            released.kind === 'uncertain' ? 'uncertain' : 'release_refused',
            released.kind === 'uncertain' ? 'uncertain' : 'not_released',
            released.kind === 'uncertain' ? 'attempted' : 'none',
            released.kind === 'uncertain' ? 'release_uncertain' : released.reason, input.now(),
          )
        }
        return undefined
      }
      const attempt = await input.store.getQuoteAttempt(quoteAttemptId)
      if (attempt === undefined) return undefined
      return quote === undefined ? candidateFromAttempt(attempt) : candidateFromQuote(attempt, quote)
    }))
    const attempts = (await Promise.all(candidateSet.candidates.map((candidate) => input.store.getQuoteAttempt(`structured-quote:${canonicalAuthorityDigest({
      preparationRequestId: request.preparationRequestId,
      candidateSetDigest: candidateSet.candidateSetDigest,
      bindingId: candidate.bindingId,
    })}`)))).filter((attempt): attempt is QuotePreparationAttempt => attempt !== undefined)
    const prepared = results.filter((result): result is StructuredPreparedCandidate => result !== undefined && 'offer' in result)
    await Promise.all(attempts.map(async (attempt) => {
      const disposition = attempt.disposition === 'quoted' ? 'option_received'
        : attempt.disposition === 'refused' ? 'provider_refused'
          : attempt.disposition === 'uncertain' ? 'uncertain'
            : attempt.disposition === 'allocated' ? 'allocated' : 'dispatch_attempted'
      await input.store.recordCandidateCoverage({
        candidateSetDigest: candidateSet.candidateSetDigest, bindingId: attempt.command.recipient.bindingId,
        nodeId: attempt.command.recipient.nodeId, disposition,
        protectedData: attempt.disposition === 'allocated' ? 'not_released' : attempt.disposition === 'uncertain' ? 'uncertain' : 'released',
        providerContact: attempt.disposition === 'allocated' ? 'none' : 'attempted',
        reasonCode: 'reasonCode' in attempt ? attempt.reasonCode : attempt.disposition,
        recordedAt: 'resolvedAt' in attempt ? attempt.resolvedAt : 'dispatchedAt' in attempt ? attempt.dispatchedAt : attempt.command.claimedAt,
      })
    }))
    const coverage = await input.store.listCandidateCoverage(candidateSet.candidateSetDigest)
    return prepared.length === 0
      ? reconciliationPending || attempts.some((attempt) => attempt.disposition === 'dispatched' || attempt.disposition === 'uncertain')
        ? { kind: 'preparation_pending', candidateSetDigest: candidateSet.candidateSetDigest, attempts, coverage }
        : { kind: 'insufficient_options', candidateSetDigest: candidateSet.candidateSetDigest, attempts, reason: 'no_structured_offer' }
      : {
          kind: 'candidates_prepared', candidateSetDigest: candidateSet.candidateSetDigest,
          candidates: prepared, attempts, coverage, frozenCandidates: candidateSet.candidates,
        }
  }
}

async function recordCoverage(
  store: StructuredQuotePreparationStore,
  candidateSetDigest: string,
  adapter: StructuredAdapter,
  disposition: PreparationCandidateCoverage['disposition'],
  protectedData: PreparationCandidateCoverage['protectedData'],
  providerContact: PreparationCandidateCoverage['providerContact'],
  reasonCode: string,
  recordedAt: number,
) {
  await store.recordCandidateCoverage({
    candidateSetDigest, bindingId: adapter.binding.bindingId, nodeId: adapter.binding.nodeId,
    disposition, protectedData, providerContact, reasonCode, recordedAt,
  })
}

function providerOfferFromQuote(
  quote: StructuredBindingQuote,
  command: ReturnType<typeof createQuotePreparationCommand>,
  candidateSetDigest: string,
  issuerBusinessId: string,
  issuedAt: number,
): ProviderOffer {
  const providerOfferRef = quote.providerQuoteRef
  const expiresAt = quote.providerQuoteExpiresAt
  if (providerOfferRef === undefined || expiresAt === undefined) throw new Error('provider_quote_identity_missing')
  return createProviderOffer({
    providerOfferId: `provider-offer:${canonicalAuthorityDigest({ quoteAttemptId: command.quoteAttemptId, providerOfferRef })}`,
    quoteAttemptId: command.quoteAttemptId, commandDigest: command.commandDigest, candidateSetDigest,
    issuerBindingId: quote.issuerBindingId, issuerNodeId: quote.issuerNodeId, issuerBusinessId,
    capabilityContractId: command.capabilityContractId, capabilityContractVersion: command.capabilityContractVersion,
    providerOfferRef, expectedCost: quote.expectedCost, maximumCost: quote.maximumCost,
    expectedLatencyMs: quote.expectedLatencyMs, executionDataFields: quote.dataFields,
    materialTerms: quote.materialTerms.map((term) => `${term.label}: ${term.value}`),
    offerOutputs: quote.offerOutputs, priceComponents: quote.priceComponents, cancellation: quote.cancellation,
    offerOutputsDigest: canonicalAuthorityDigest({ outputs: quote.offerOutputs }),
    termsDigest: canonicalAuthorityDigest({ materialTerms: quote.materialTerms, priceComponents: quote.priceComponents }),
    cancellationTermsDigest: canonicalAuthorityDigest(quote.cancellation),
    providerEvidenceDigest: canonicalAuthorityDigest(quote), issuedAt, expiresAt,
  })
}

function structuredQuoteMatchesCandidate(
  quote: StructuredBindingQuote,
  adapter: CapabilityBindingAdapter,
  request: StructuredPreparationInput,
  now: number,
): boolean {
  return quote.issuerBindingId === adapter.binding.bindingId
    && quote.issuerNodeId === adapter.binding.nodeId
    && quote.capabilityContractId === request.capabilityContractId
    && quote.capabilityContractVersion === request.capabilityContractVersion
    && quote.registrationHash === adapter.binding.registrationHash
    && quote.environment === adapter.binding.environment
    && quote.expectedCost.currency === request.currency
    && quote.maximumCost.currency === request.currency
    && quote.expectedCost.amountMinor <= quote.maximumCost.amountMinor
    && quote.maximumCost.amountMinor <= request.maximumSpendMinor
    && quote.dataFields.every((field) => request.allowedExecutionDataFields.includes(field))
    && requiredOfferOutputsMatch(quote.offerOutputs, request.requiredOfferOutputs)
    && quote.priceComponents.reduce((total, component) => total + component.amountMinor, 0) <= quote.maximumCost.amountMinor
    && quote.materialTerms.length > 0 && quote.cancellation.summary.trim().length > 0
    && (quote.providerQuoteExpiresAt ?? 0) > now
}

function requiredOfferOutputsMatch(
  outputs: StructuredBindingQuote['offerOutputs'],
  required: StructuredPreparationInput['requiredOfferOutputs'],
): boolean {
  if (new Set(outputs.map((output) => output.field)).size !== outputs.length) return false
  const byField = new Map(outputs.map((output) => [output.field, output]))
  return required.every((definition) => {
    const output = byField.get(definition.field)
    if (output?.valueType !== definition.valueType) return false
    if (definition.valueType === 'integer' || definition.valueType === 'money_minor') return typeof output.value === 'number' && Number.isSafeInteger(output.value)
    if (definition.valueType === 'boolean') return typeof output.value === 'boolean'
    if (definition.valueType === 'url') {
      if (typeof output.value !== 'string') return false
      try { return new URL(output.value).protocol === 'https:' } catch { return false }
    }
    return typeof output.value === 'string' && output.value.trim().length > 0
  })
}

async function discoverCandidates(
  request: StructuredPreparationInput,
  bindings: readonly CapabilityBindingAdapter[],
  incidentControl: IncidentEvaluator,
) {
  const eligible = bindings.filter((adapter): adapter is StructuredAdapter => adapter.quoteStructured !== undefined
    && adapter.binding.adapterFeatures?.quotePreparation === 'structured_authorized'
    && adapter.binding.registrationHash !== undefined && adapter.binding.environment !== undefined
    && adapter.binding.networkId === request.networkId
    && adapter.binding.capabilityContractId === request.capabilityContractId
    && adapter.binding.admission === 'admitted'
    && adapter.binding.conformance === 'conformant')
  const evaluated = await Promise.all(eligible.map(async (adapter) => ({
    adapter,
    incident: await incidentControl.evaluate(bindingScope(request, adapter), 'route'),
  })))
  return evaluated.filter((entry): entry is Readonly<{ adapter: StructuredAdapter; incident: Readonly<{ kind: 'allowed'; epochDigest: string }> }> => entry.incident.kind === 'allowed')
    .map(({ adapter, incident }) => ({ adapter, incidentEpochDigest: incident.epochDigest }))
    .sort((left, right) => left.adapter.binding.bindingId.localeCompare(right.adapter.binding.bindingId))
}

function bindingScope(request: StructuredPreparationInput, adapter: CapabilityBindingAdapter) {
  return {
    networkId: request.networkId,
    principalId: request.caller.principalId,
    agentId: request.caller.agentId,
    bindingId: adapter.binding.bindingId,
    capabilityContractId: request.capabilityContractId,
  }
}

function registrationEvidenceDigest(adapter: StructuredAdapter): string {
  return canonicalAuthorityDigest({
    bindingId: adapter.binding.bindingId,
    nodeId: adapter.binding.nodeId,
    networkId: adapter.binding.networkId,
    capabilityContractId: adapter.binding.capabilityContractId,
    registrationHash: adapter.binding.registrationHash,
    environment: adapter.binding.environment,
  })
}

function currentBindingEvidence(adapter: StructuredAdapter): CurrentStructuredBindingEvidence {
  return {
    bindingId: adapter.binding.bindingId,
    nodeId: adapter.binding.nodeId,
    networkId: adapter.binding.networkId,
    capabilityContractId: adapter.binding.capabilityContractId,
    admission: adapter.binding.admission,
    conformance: adapter.binding.conformance,
    registrationHash: adapter.binding.registrationHash,
    environment: adapter.binding.environment,
    quotePreparation: adapter.binding.adapterFeatures?.quotePreparation ?? 'public_query',
  }
}

function sameBindingEvidence(current: CurrentStructuredBindingEvidence | undefined, frozen: StructuredAdapter): boolean {
  if (current === undefined) return false
  const expected = currentBindingEvidence(frozen)
  return canonicalAuthorityDigest(current) === canonicalAuthorityDigest(expected)
    && current.admission === 'admitted' && current.conformance === 'conformant'
    && current.quotePreparation === 'structured_authorized'
}

function candidateFromAttempt(attempt: QuotePreparationAttempt): StructuredPreparedCandidate | undefined {
  if (attempt.disposition !== 'quoted') return undefined
  return {
    offer: attempt.offer,
    expectedCost: attempt.offer.expectedCost,
    maximumCost: attempt.offer.maximumCost,
    expectedLatencyMs: attempt.offer.expectedLatencyMs,
    executionDataFields: attempt.offer.executionDataFields,
    disclosures: attempt.offer.materialTerms,
  }
}

function candidateFromQuote(attempt: QuotePreparationAttempt, quote: StructuredBindingQuote): StructuredPreparedCandidate | undefined {
  if (attempt.disposition !== 'quoted') return undefined
  return {
    offer: attempt.offer,
    expectedCost: quote.expectedCost,
    maximumCost: quote.maximumCost,
    expectedLatencyMs: quote.expectedLatencyMs,
    executionDataFields: Object.freeze([...quote.dataFields]),
    disclosures: Object.freeze([...attempt.offer.materialTerms]),
  }
}
