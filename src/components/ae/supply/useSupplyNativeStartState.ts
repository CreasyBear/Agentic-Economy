import { useRef, useState } from 'react'

import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import type { SupplySourcePreview, SupplyToolCandidate } from '@/modules/capability-supply/source-preview'
import {
  buildPublishInput,
  eligibleSupplyConnections,
  pricingInput,
  publicationError,
  publicationValidationMessage,
  requiredAdapterIdForSourceKind,
  sourceInput,
  sourceInputError,
  type AttestationKey,
  type Environment,
  type SourceKind,
  type SupplyNativeStartProps,
} from './supply-source-native-start-presentation'

export type { SupplyNativeStartProps } from './supply-source-native-start-presentation'

/** Owns every piece of native-start form state plus the discover/select/connect/publish calls. */
export function useSupplyNativeStartState({
  businessRef,
  connections = [],
  initial,
  onPreview,
  onConnect,
  onSelectCandidate,
  onDraftSaved,
  onPublish,
}: SupplyNativeStartProps) {
  const initialCandidate = initial?.preview?.candidates.find(({ candidateRef }) => candidateRef === initial.candidateRef)
  const [sourceKind, setSourceKind] = useState<SourceKind>(initial?.source.kind ?? 'openapi')
  const [environment, setEnvironment] = useState<Environment>(initial?.source.environment ?? 'sandbox')
  const [definitionUrl, setDefinitionUrl] = useState(initial?.source.kind === 'openapi' ? initial.source.definitionUrl : '')
  const [mcpLocator, setMcpLocator] = useState<'url' | 'registry'>(initial?.source.kind === 'mcp' && initial.source.registryName !== undefined ? 'registry' : 'url')
  const [serverUrl, setServerUrl] = useState(initial?.source.kind === 'mcp' ? initial.source.serverUrl ?? '' : '')
  const [registryName, setRegistryName] = useState(initial?.source.kind === 'mcp' ? initial.source.registryName ?? '' : '')
  const [pluginJson, setPluginJson] = useState(initial?.source.kind === 'agent_plugin' ? JSON.stringify(initial.source.pluginJson, null, 2) : '')
  const [mcpJson, setMcpJson] = useState(initial?.source.kind === 'agent_plugin' ? JSON.stringify(initial.source.mcpJson, null, 2) : '')
  const [selectedRemoteRef, setSelectedRemoteRef] = useState(initial?.source.kind === 'mcp' || initial?.source.kind === 'agent_plugin' ? initial.source.remoteRef ?? '' : '')
  const [resourceUrl, setResourceUrl] = useState(initial?.source.kind === 'x402' ? initial.source.resourceUrl : '')
  const [x402Method, setX402Method] = useState<'GET' | 'POST'>(initial?.source.kind === 'x402' ? initial.source.method : 'POST')
  const [preview, setPreview] = useState<Extract<SupplySourcePreview, { kind: 'ready' }> | undefined>(initial?.preview)
  const [remoteSelection, setRemoteSelection] = useState<Extract<SupplySourcePreview, { kind: 'remote_selection_required' }>>()
  const [selectedRef, setSelectedRef] = useState(initial?.candidateRef ?? '')
  const [name, setName] = useState(initialCandidate?.title ?? '')
  const [description, setDescription] = useState(initialCandidate?.description ?? '')
  const [category, setCategory] = useState('')
  const [serviceArea, setServiceArea] = useState('')
  const [availability, setAvailability] = useState('')
  const [pricingKind, setPricingKind] = useState<'free' | 'fixed_aud' | 'source_x402'>(initialCandidate?.x402 === undefined ? 'free' : 'source_x402')
  const [price, setPrice] = useState('')
  const [connectionRef, setConnectionRef] = useState(initial?.connectionRef ?? '')
  const [externalEffect, setExternalEffect] = useState(false)
  const [dataRelease, setDataRelease] = useState(false)
  const [financialExposure, setFinancialExposure] = useState(false)
  const [dataClassification, setDataClassification] = useState<'public' | 'personal' | 'sensitive'>('public')
  const [attestation, setAttestation] = useState<Record<AttestationKey, boolean>>({
    authorisedToPublish: false,
    informationAccurate: false,
    publishAfterSuccessfulValidation: false,
  })
  const [pending, setPending] = useState<'preview' | 'select' | 'connect' | 'publish'>()
  const [error, setError] = useState<string>()
  const [requiredAction, setRequiredAction] = useState<Extract<SupplySourcePreview, { kind: 'action_required' }>['requiredAction']>()
  const [success, setSuccess] = useState<string>()
  const idempotencyKey = useRef(`owner-supply:${crypto.randomUUID()}`)
  const previewIdempotencyKey = useRef(`owner-supply-preview:${crypto.randomUUID()}`)
  const connectionIdempotencyKey = useRef(`owner-supply-connection:${crypto.randomUUID()}`)
  const selected = preview?.candidates.find(({ candidateRef }) => candidateRef === selectedRef)
  const source = sourceInput({
    sourceKind,
    environment,
    definitionUrl,
    mcpLocator,
    serverUrl,
    registryName,
    pluginJson,
    mcpJson,
    remoteRef: selectedRemoteRef,
    resourceUrl,
    x402Method,
  })
  const requiredAdapterId = requiredAdapterIdForSourceKind(sourceKind)
  const eligibleConnections = eligibleSupplyConnections({
    requiredAdapterId,
    hasSelectedCandidate: selected !== undefined,
    connections,
    businessRef,
  })

  function resetDiscoveryOnSourceEdit() {
    setRemoteSelection(undefined)
    setSelectedRemoteRef('')
  }

  function changeSourceKind(next: string) {
    setSourceKind(next as SourceKind)
    setPreview(undefined)
    resetDiscoveryOnSourceEdit()
    setSelectedRef('')
    setError(undefined)
    setRequiredAction(undefined)
    setSuccess(undefined)
  }

  async function findTools(remoteRefOverride?: string) {
    const currentSource = remoteRefOverride === undefined
      ? source
      : sourceInput({
          sourceKind, environment, definitionUrl, mcpLocator, serverUrl, registryName,
          pluginJson, mcpJson, remoteRef: remoteRefOverride, resourceUrl, x402Method,
        })
    if (currentSource === undefined) {
      setError(sourceInputError(sourceKind, mcpLocator))
      return
    }
    setPending('preview')
    setError(undefined)
    setSuccess(undefined)
    try {
      const result = await onPreview(currentSource, previewIdempotencyKey.current)
      if (result.kind === 'action_required') {
        setPreview(undefined)
        setRemoteSelection(undefined)
        setRequiredAction(result.requiredAction)
        return
      }
      if (result.kind === 'remote_selection_required') {
        setPreview(undefined)
        setRequiredAction(undefined)
        setRemoteSelection(result)
        setSelectedRemoteRef('')
        return
      }
      setRequiredAction(undefined)
      setRemoteSelection(undefined)
      setPreview(result)
      setSelectedRef('')
      if (result.candidates.length === 0) setError('No Tools were found in this source.')
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('AE could not inspect this source. Check the source and try again.')
    } finally {
      setPending(undefined)
    }
  }

  async function selectCandidate(candidate: SupplyToolCandidate) {
    if (source === undefined || preview === undefined || pending !== undefined) return
    setPending('select')
    setError(undefined)
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
        setError('AE could not save this selection. Discover endpoints again, then select the current source candidate.')
        return
      }
      setSelectedRef(candidate.candidateRef)
      setName(candidate.title)
      setDescription(candidate.description)
      setConnectionRef((current) => connections.some((connection) => (
        connection.connectionRef === current
        && connection.available
        && connection.businessId === businessRef
        && connection.adapterId === requiredAdapterId
      )) ? current : '')
      setPricingKind(candidate.x402 === undefined ? 'free' : 'source_x402')
      await onDraftSaved?.(candidate.candidateRef, connectionRef === '' ? undefined : connectionRef)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('AE could not save this selection. Discover endpoints again, then try again.')
    } finally {
      setPending(undefined)
    }
  }

  async function submit() {
    if (source === undefined || preview === undefined || selected === undefined) {
      setError('Select one supported Tool before submitting it.')
      return
    }
    const pricing = pricingInput(pricingKind, price)
    const validationMessage = publicationValidationMessage({
      category,
      pricing,
      requiresConnection: selected.authentication.kind !== 'public',
      connectionRef,
      attestation,
    })
    if (validationMessage !== undefined) {
      setError(validationMessage)
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
      environment,
      idempotencyKey: idempotencyKey.current,
    })
    setPending('publish')
    setError(undefined)
    try {
      const result = await onPublish(input)
      if (result.kind === 'refused') {
        setError(publicationError(result.reason))
        return
      }
      setSuccess(`Tool submitted for validation. AE will publish it after the required checks pass. Reference: ${result.toolRef}`)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('AE could not confirm submission. Reload Tools before trying again.')
    } finally {
      setPending(undefined)
    }
  }

  async function connectSelectedSource() {
    if (source === undefined || preview === undefined || selected === undefined || pending !== undefined) return
    setPending('connect')
    setError(undefined)
    try {
      const result = await onConnect({
        businessId: businessRef,
        source,
        expectedSourceDigest: preview.sourceDigest,
        candidateRef: selected.candidateRef,
        idempotencyKey: connectionIdempotencyKey.current,
      })
      if (result.kind !== 'action_required') {
        setError('This source no longer requires a connection. Discover endpoints again to continue with its current contract.')
        return
      }
      setRequiredAction(result.requiredAction)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('AE could not start this connection. Discover endpoints again, then retry the current source.')
    } finally {
      setPending(undefined)
    }
  }

  return {
    sourceKind, environment, definitionUrl, mcpLocator, serverUrl, registryName, pluginJson, mcpJson,
    resourceUrl, x402Method, preview, remoteSelection, selectedRemoteRef, selectedRef,
    name, description, category, serviceArea, availability,
    pricingKind, price, connectionRef, externalEffect, dataRelease, financialExposure, dataClassification, attestation,
    pending, error, requiredAction, success,
    selected, eligibleConnections,
    setEnvironment, setDefinitionUrl, setMcpLocator, setServerUrl, setRegistryName, setPluginJson, setMcpJson,
    setResourceUrl, setX402Method, setSelectedRemoteRef,
    setName, setDescription, setCategory, setServiceArea, setAvailability,
    setPricingKind, setPrice, setConnectionRef, setExternalEffect, setDataRelease, setFinancialExposure, setDataClassification,
    setAttestation, setError,
    resetDiscoveryOnSourceEdit, changeSourceKind, findTools, selectCandidate, submit, connectSelectedSource,
  }
}
