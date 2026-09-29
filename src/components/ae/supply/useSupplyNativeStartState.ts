import { useRef, useState } from 'react'

import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { appDestination } from '@/lib/navigation/app-navigation'
import type { SupplySourcePreview, SupplyToolCandidate } from '@/modules/capability-supply/source-preview'
import {
  buildPublishInput,
  eligibleSupplyConnections,
  pricingInput,
  publicationError,
  publicationInvalidFieldForMessage,
  publicationTermsValidationMessage,
  publicationValidationMessage,
  requiredAdapterIdForSourceKind,
  sourceInput,
  sourceInputError,
  type AttestationKey,
  type Environment,
  type SupplyJourneyContinuation,
  type SupplyNativeStartProps,
  type SupplyPublicationInvalidField,
} from './supply-source-native-start-presentation'

export type { SupplyNativeStartProps } from './supply-source-native-start-presentation'
const OPEN_TOOLS_CONTINUATION = {
  label: 'Open Tools',
  to: appDestination('tools').to,
} as const satisfies SupplyJourneyContinuation

/** Owns every piece of native-start form state plus the discover/select/connect/publish calls. */
export function useSupplyNativeStartState({
  businessRef,
  connections = [],
  initial,
  onPreview,
  onConnect,
  onSelectCandidate,
  onSaveTerms,
  onDraftSaved,
  onPublish,
}: SupplyNativeStartProps) {
  const initialCandidate = initial?.preview?.candidates.find(({ candidateRef }) => candidateRef === initial.candidateRef)
  const [environment, setEnvironment] = useState<Environment>(initial?.source.environment)
  const [resourceUrl, setResourceUrl] = useState(initial?.source.kind === 'x402' ? initial.source.resourceUrl : '')
  const [x402Method, setX402Method] = useState<'GET' | 'POST' | undefined>(initial?.source.method)
  const [preview, setPreview] = useState<Extract<SupplySourcePreview, { kind: 'ready' }> | undefined>(initial?.preview)
  const [selectedRef, setSelectedRef] = useState(initial?.candidateRef ?? '')
  const [name, setName] = useState(initial?.terms?.name ?? initialCandidate?.title ?? '')
  const [description, setDescription] = useState(initial?.terms?.description ?? initialCandidate?.description ?? '')
  const [category, setCategory] = useState(initial?.terms?.category ?? '')
  const [serviceArea, setServiceArea] = useState(initial?.terms?.serviceArea ?? '')
  const [availability, setAvailability] = useState(initial?.terms?.availability ?? '')
  const [pricingKind, setPricingKind] = useState<'free' | 'fixed_aud' | 'source_x402'>(initial?.terms?.pricingKind ?? (initialCandidate?.x402 === undefined ? 'free' : 'source_x402'))
  const [price, setPrice] = useState(initial?.terms?.price ?? '')
  const [connectionRef, setConnectionRef] = useState(initial?.connectionRef ?? '')
  const [externalEffect, setExternalEffect] = useState(initial?.terms?.externalEffect ?? false)
  const [dataRelease, setDataRelease] = useState(initial?.terms?.dataRelease ?? false)
  const [financialExposure, setFinancialExposure] = useState(initial?.terms?.financialExposure ?? false)
  const [dataClassification, setDataClassification] = useState<'public' | 'personal' | 'sensitive'>(initial?.terms?.dataClassification ?? 'public')
  const [attestation, setAttestation] = useState<Record<AttestationKey, boolean>>({
    authorisedToPublish: false,
    informationAccurate: false,
    publishAfterSuccessfulValidation: false,
  })
  const [pending, setPending] = useState<'preview' | 'select' | 'connect' | 'terms' | 'publish'>()
  const [error, setError] = useState<string>()
  const [invalidField, setInvalidField] = useState<SupplyPublicationInvalidField>()
  const [requiredAction, setRequiredAction] = useState<Extract<SupplySourcePreview, { kind: 'action_required' }>['requiredAction']>()
  const [success, setSuccess] = useState<string>()
  const continuation = success === undefined ? undefined : OPEN_TOOLS_CONTINUATION
  const [reviewing, setReviewing] = useState(false)
  const [publicationLocked, setPublicationLocked] = useState(false)
  const [termsSaveOutcome, setTermsSaveOutcome] = useState<'idle' | 'saved' | 'failed' | 'outcome_unknown'>('idle')
  const termsKey = supplyTermsKey({
    name, description, category, serviceArea, availability, pricingKind, price, connectionRef,
    externalEffect, dataRelease, financialExposure, dataClassification,
  })
  const [savedTermsKey, setSavedTermsKey] = useState(termsKey)
  const termsDirty = success === undefined && termsKey !== savedTermsKey

  function clearFieldError() {
    setError(undefined)
    setInvalidField(undefined)
  }

  function setFieldError(message: string) {
    setError(message)
    setInvalidField(publicationInvalidFieldForMessage(message))
  }
  const operationInFlight = useRef(false)
  const publicationCommandLocked = useRef(false)
  const idempotencyKey = useRef(`owner-supply:${crypto.randomUUID()}`)
  const previewIdempotencyKey = useRef(`owner-supply-preview:${crypto.randomUUID()}`)
  const connectionIdempotencyKey = useRef(`owner-supply-connection:${crypto.randomUUID()}`)
  const selected = preview?.candidates.find(({ candidateRef }) => candidateRef === selectedRef)
  const source = sourceInput({ resourceUrl, x402Method, ...(environment === undefined ? {} : { environment }) })
  const requiredAdapterId = requiredAdapterIdForSourceKind('x402')
  const eligibleConnections = eligibleSupplyConnections({
    requiredAdapterId,
    hasSelectedCandidate: selected !== undefined,
    connections,
    businessRef,
  })

  function beginOperation(next: NonNullable<typeof pending>): boolean {
    if (operationInFlight.current || publicationCommandLocked.current) return false
    operationInFlight.current = true
    setPending(next)
    return true
  }

  function endOperation() {
    operationInFlight.current = false
    setPending(undefined)
  }

  function clearAttestation() {
    setAttestation({
      authorisedToPublish: false,
      informationAccurate: false,
      publishAfterSuccessfulValidation: false,
    })
  }

  function editSource() {
    if (operationInFlight.current || publicationCommandLocked.current) return
    setPreview(undefined)
    setSelectedRef('')
    setRequiredAction(undefined)
    setSuccess(undefined)
    clearFieldError()
    setReviewing(false)
    clearAttestation()
  }

  function editTool() {
    if (operationInFlight.current || publicationCommandLocked.current) return
    setSelectedRef('')
    setConnectionRef('')
    setRequiredAction(undefined)
    setSuccess(undefined)
    clearFieldError()
    setReviewing(false)
    clearAttestation()
  }

  function editTerms() {
    if (operationInFlight.current || publicationCommandLocked.current) return
    setReviewing(false)
    clearFieldError()
    clearAttestation()
  }

  async function findTools() {
    if (source === undefined) {
      clearFieldError()
      setError(sourceInputError({ resourceUrl }))
      return
    }
    if (!beginOperation('preview')) return
    clearFieldError()
    setSuccess(undefined)
    try {
      const result = await onPreview(source, previewIdempotencyKey.current)
      if (result.kind === 'action_required') {
        setPreview(undefined)
        setRequiredAction(result.requiredAction)
        return
      }
      setRequiredAction(undefined)
      setPreview(result)
      const derived = result.candidates.find((candidate) => candidate.disposition.kind === 'supported')?.x402
      if (derived !== undefined) setEnvironment(derived.environment)
      const derivedMethod = result.candidates[0]?.sourceSelector.method
      if (derivedMethod === 'GET' || derivedMethod === 'POST') setX402Method(derivedMethod)
      setSelectedRef('')
      if (result.candidates.length === 0) setError('No Tools were found in this source. Find Tools again.')
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('Agentic Economy could not inspect this source. Check the source and try again.')
    } finally {
      endOperation()
    }
  }

  async function selectCandidate(candidate: SupplyToolCandidate) {
    if (source === undefined || preview === undefined || !beginOperation('select')) return
    clearFieldError()
    try {
      const saved = await onSelectCandidate({
        businessRef,
        source,
        sourceDigest: preview.sourceDigest,
        sourceRevision: preview.sourceRevision,
        candidate: {
          candidateRef: candidate.candidateRef,
          sourceSelector: candidate.sourceSelector,
          title: candidate.title,
          description: candidate.description,
        },
      })
      if (saved.kind === 'refused') {
        setError('Agentic Economy could not save this selection. Find Tools again, then select the current source candidate.')
        return
      }
      setSelectedRef(candidate.candidateRef)
      setName(candidate.title)
      setDescription(candidate.description)
      const nextConnectionRef = connections.some((connection) => (
        connection.connectionRef === connectionRef
        && connection.available
        && connection.businessId === businessRef
        && connection.adapterId === requiredAdapterId
      )) ? connectionRef : ''
      setConnectionRef(nextConnectionRef)
      const nextPricingKind = 'source_x402' as const
      setSavedTermsKey(supplyTermsKey({
        name: candidate.title,
        description: candidate.description,
        category, serviceArea, availability, pricingKind: nextPricingKind, price,
        connectionRef: nextConnectionRef,
        externalEffect, dataRelease, financialExposure, dataClassification,
      }))
      setPricingKind(nextPricingKind)
      setReviewing(false)
      await onDraftSaved?.(candidate.candidateRef, nextConnectionRef === '' ? undefined : nextConnectionRef)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('Agentic Economy could not save this selection. Find Tools again, then try again.')
    } finally {
      endOperation()
    }
  }

  async function continueToReview() {
    if (selected === undefined || preview === undefined || source === undefined
      || operationInFlight.current || publicationCommandLocked.current) return
    const validationMessage = publicationTermsValidationMessage({
      category,
      pricing: pricingInput(pricingKind, price),
      requiresConnection: selected.authentication.kind !== 'public',
      connectionRef,
    })
    if (validationMessage !== undefined) {
      setFieldError(validationMessage)
      return
    }
    if (onSaveTerms === undefined) {
      clearFieldError()
      setReviewing(true)
      return
    }
    if (!beginOperation('terms')) return
    setTermsSaveOutcome('idle')
    clearFieldError()
    try {
      const saved = await onSaveTerms({
        businessRef,
        source,
        sourceDigest: preview.sourceDigest,
        sourceRevision: preview.sourceRevision,
        candidate: {
          candidateRef: selected.candidateRef,
          sourceSelector: selected.sourceSelector,
          title: selected.title,
          description: selected.description,
        },
        terms: {
          name, description, category, serviceArea, availability, pricingKind, price,
          externalEffect, dataRelease, financialExposure, dataClassification,
        },
      })
      if (saved?.kind === 'refused') {
        setTermsSaveOutcome('failed')
        setError(saved.reason === 'authorization_denied'
          ? 'Sign in again, return to this saved Tool draft, then continue.'
          : saved.reason === 'candidate_changed'
            ? 'Source changed. Edit Source and find the current Tool again.'
            : 'Could not save these terms. Keep editing or try Continue to review again.')
        return
      }
      setSavedTermsKey(supplyTermsKey({
        name, description, category, serviceArea, availability, pricingKind, price, connectionRef,
        externalEffect, dataRelease, financialExposure, dataClassification,
      }))
      setTermsSaveOutcome('saved')
      setReviewing(true)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setTermsSaveOutcome('failed')
      setError('Could not save these terms. Keep editing or try Continue to review again.')
    } finally {
      endOperation()
    }
  }

  async function submit() {
    if (source === undefined || preview === undefined || selected === undefined) {
      setFieldError('Select one supported Tool before submitting it.')
      return
    }
    if (selected.x402 === undefined) {
      setFieldError('The payment challenge did not include a payee.')
      return
    }
    const pricing = { kind: 'source_x402' as const }
    const publishAuthorityRequired = selected.authentication.kind !== 'public'
      
    const validationMessage = publicationValidationMessage({
      category,
      pricing,
      requiresConnection: selected.authentication.kind !== 'public',
      connectionRef,
      attestation,
      publishAuthorityRequired,
    })
    if (validationMessage !== undefined) {
      setFieldError(validationMessage)
      return
    }
    const input = buildPublishInput({
      businessRef,
      source,
      selected,
      sourceDigest: preview.sourceDigest,
      connectionRef,
      name,
      description,
      category,
      serviceArea,
      availability,
      externalEffect,
      dataRelease,
      financialExposure,
      dataClassification,
      pricing: pricing as NonNullable<typeof pricing>,
      environment: selected.x402.environment,
      idempotencyKey: idempotencyKey.current,
      attestation: {
        authorisedToPublish: attestation.authorisedToPublish,
        informationAccurate: true,
        publishAfterSuccessfulValidation: true,
      },
    })
    if (!beginOperation('publish')) return
    publicationCommandLocked.current = true
    setPublicationLocked(true)
    clearFieldError()
    try {
      const result = await onPublish(input)
      if (result.kind === 'refused') {
        publicationCommandLocked.current = false
        setPublicationLocked(false)
        idempotencyKey.current = `owner-supply:${crypto.randomUUID()}`
        setTermsSaveOutcome('failed')
        setError(publicationError(result.reason))
        return
      }
      setTermsSaveOutcome('saved')
      setSuccess(result.state === 'Submitted'
        ? 'The Tool is recorded. It is not callable yet: readiness has not been observed.'
        : 'This Tool is listed and callable.')
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setTermsSaveOutcome('outcome_unknown')
      setError('Agentic Economy could not confirm submission. Reload Tools before trying again.')
    } finally {
      endOperation()
    }
  }

  async function connectSelectedSource() {
    if (source === undefined || preview === undefined || selected === undefined || !beginOperation('connect')) return
    clearFieldError()
    try {
      const result = await onConnect({
        businessId: businessRef,
        source,
        expectedSourceDigest: preview.sourceDigest,
        candidateRef: selected.candidateRef,
        idempotencyKey: connectionIdempotencyKey.current,
      })
      if (result.kind !== 'action_required') {
        setError('This source no longer requires a connection. Find Tools again to continue with its current contract.')
        return
      }
      setRequiredAction(result.requiredAction)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('Agentic Economy could not start this connection. Find Tools again, then retry the current source.')
    } finally {
      endOperation()
    }
  }

  return {
    resourceUrl, x402Method, preview, selectedRef,
    name, description, category, serviceArea, availability,
    pricingKind, price, connectionRef, externalEffect, dataRelease, financialExposure, dataClassification, attestation,
    pending, error, invalidField, requiredAction, success, continuation, reviewing, publicationLocked,
    source, selected, eligibleConnections,
    setResourceUrl, setX402Method,
    setName, setDescription, setCategory, setServiceArea, setAvailability,
    setPricingKind, setPrice, setConnectionRef, setExternalEffect, setDataRelease, setFinancialExposure, setDataClassification,
    setAttestation, setError,
    editSource, editTool, editTerms, continueToReview,
    findTools, selectCandidate, submit, connectSelectedSource,
    termsDirty, termsSaveOutcome,
  }
}

function supplyTermsKey(terms: Readonly<{
  name: string
  description: string
  category: string
  serviceArea: string
  availability: string
  pricingKind: 'free' | 'fixed_aud' | 'source_x402'
  price: string
  connectionRef: string
  externalEffect: boolean
  dataRelease: boolean
  financialExposure: boolean
  dataClassification: 'public' | 'personal' | 'sensitive'
}>): string {
  return JSON.stringify(terms)
}
