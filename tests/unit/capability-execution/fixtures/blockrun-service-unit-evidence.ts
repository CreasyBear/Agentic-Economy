import { isRecord } from '@/modules/common/is-record'
import { defineCapabilityContract } from '@/modules/capability-contract/public'
import { admitRegisteredTransport, defineCapabilityTransportBindingRegistration, defineCapabilityOfferingRegistration,
  capabilityBindingRegistrationHash, capabilityOfferingRegistrationHash, capabilityToolId, createPublicToolRef, materializePublishedTool } from '@/modules/capability-supply/public'
import { buildDevelopmentPublishedToolEvidence, createDevelopmentProviderConnectionAuthority } from '../../capability-supply/fixtures/development-published-tool-evidence'

/** Documented shapes only. Never invokes BlockRun, signs a payment or proves live admission. */
export const blockrunChatReceipt = {id: 'chatcmpl-synthetic', object: 'chat.completion', created: 1703123456, model: 'gpt-5.5',
  choices: [{index: 0, message: {role: 'assistant', content: 'SYNTHETIC_PRIVATE_OUTPUT'}}], usage: {prompt_tokens: 12, completion_tokens: 8, total_tokens: 20}}
export const blockrunSpeechReceipt = {created: 1733443200, model: 'elevenlabs/flash-v2.5', data: [{url: 'https://synthetic.invalid/audio?token=PRIVATE_AUDIO', format: 'mp3', characters: 51, credits: 51}]}
export function blockrunTool(kind: 'chat' | 'speech' = 'chat') {
  const base = buildDevelopmentPublishedToolEvidence(), source = base.sourceMaterial
  const {ref: _ref, ...document} = source.contract
  const pointer = kind === 'chat' ? '/choices' : '/data'
  const contract = defineCapabilityContract({...document, capabilityId: `synthetic.blockrun.${kind}`, name: `Synthetic BlockRun ${kind}`,
    inputSchema: {$schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: {model: {type: 'string'}}, required: ['model'], additionalProperties: false},
    outputSchema: {$schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: {choices: {type: 'array', items: {type: 'object'}}, usage: {type: 'object'}, data: {type: 'array', items: {type: 'object'}}}, additionalProperties: true, required: [kind === 'chat' ? 'choices' : 'data']},
    customerAnnotations: [{annotationId: 'model', document: 'input', pointer: '/model', label: 'Model', role: 'request'}, {annotationId: 'units', document: 'output', pointer, label: 'Provider units', role: 'completion_evidence'}],
    dataUse: document.dataUse.map(row => ({...row, inputPointer: '/model'})).slice(0,1), evidence: [{evidenceId: 'units', outputPointer: pointer, purpose: 'completion'}]})
  const offering = defineCapabilityOfferingRegistration({...source.offering, contractRef: contract.ref})
  const endpointUrl = `https://blockrun.ai/api/v1/${kind === 'chat' ? 'chat/completions' : 'audio/speech'}`
  if (!isRecord(source.binding.adapter.config)) throw new Error('synthetic_config_invalid')
  const {query: _query, ...oldConfig} = source.binding.adapter.config
  const challenge = JSON.parse(oldConfig.paymentRequiredJson as string)
  const binding = defineCapabilityTransportBindingRegistration({...source.binding, contractRef: contract.ref, endpointUrl,
    adapter: {adapterId: 'x402-fetch:v2', config: {...oldConfig, method: 'POST', paymentRequiredJson: JSON.stringify({...challenge, resource: {...challenge.resource, url: endpointUrl}})}}})
  const admission = admitRegisteredTransport({adapterId: binding.adapter.adapterId, endpointUrl, authority: binding.authority, continuation: binding.continuation, cancellation: binding.cancellation, config: binding.adapter.config})
  if (admission.kind !== 'admitted' || binding.authority.kind !== 'provider_connection') throw new Error('synthetic_transport_invalid')
  const qualification = {...source.qualification, candidate: {...source.qualification.candidate, contractRef: contract.ref},
    sources: source.qualification.sources.map(row => ({...row, digest: row.kind === 'contract' ? contract.ref.contractDigest : row.kind === 'offering' ? capabilityOfferingRegistrationHash(offering) : row.kind === 'binding' ? capabilityBindingRegistrationHash(binding, admission.transport) : row.digest}))}
  const toolRef = createPublicToolRef({operationId: capabilityToolId(contract.ref.capabilityId), publicationRef: source.publication.publicationRef, publicationRevision: source.publication.revision, contractRef: contract.ref})
  const connectionAuthority = createDevelopmentProviderConnectionAuthority({connectionRef: binding.authority.connectionRef, businessId: offering.businessId, providerRef: binding.authority.providerRef, adapterId: binding.adapter.adapterId, toolRef, grantedScopes: [], grantedResources: [], observedAt: source.publication.readinessObservedAt})
  return materializePublishedTool({...source, contract, offering, binding, qualification, admittedTransport: admission.transport, connectionAuthority})
}
