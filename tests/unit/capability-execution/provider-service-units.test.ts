import { describe, expect, it } from 'vitest'
import { decodeProviderUnits, providerUnitProfile, summarizeProviderUnits, providerUnitMaterial, verifiedProviderObservation, observationRef } from '@/modules/capability-execution/provider-service-units'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { blockrunTool, blockrunChatReceipt, blockrunSpeechReceipt } from './fixtures/blockrun-service-unit-evidence'

describe('documented provider service units', () => {
  it('uses exact admitted POST bindings and versioned decoder profiles', () => {
    const tool = blockrunTool()
    expect(providerUnitProfile(tool)).toBe('blockrun_chat:v1')
    for (const url of ['https://blockrun.ai.evil.invalid/api/v1/chat/completions', 'https://api.blockrun.ai/api/v1/chat/completions', 'https://blockrun.ai/api/v1/chat/completions?token=secret']) {
      expect(providerUnitProfile({...tool, identity: {...tool.identity, endpoint: {...tool.identity.endpoint, url}}, binding: {...tool.binding, endpointUrl: url}})).toBeNull()
    }
    expect(providerUnitProfile({...tool, identity: {...tool.identity, endpoint: {...tool.identity.endpoint, method: 'GET'}}})).toBeNull()
    expect(providerUnitProfile({...tool, identity: {...tool.identity, adapterId: 'mcp-jsonrpc:v1'}})).toBeNull()
  })
  it('does not double count cache or reasoning details', () => {
    const output = {...blockrunChatReceipt, usage: {...blockrunChatReceipt.usage, prompt_tokens_details: {cached_tokens: 10}, cache_read_input_tokens: 10, reasoning_tokens: 7}}
    expect(decodeProviderUnits('blockrun_chat:v1', output).units.map(unit => unit.quantityUnits)).toEqual(['12','8'])
  })
  it.each([undefined, {prompt_tokens: 1.5, completion_tokens: 2,total_tokens:3.5}, {prompt_tokens: -1, completion_tokens:2,total_tokens:1}, {prompt_tokens: Number.MAX_SAFE_INTEGER + 1, completion_tokens:0,total_tokens: Number.MAX_SAFE_INTEGER + 1}, {prompt_tokens:'12',completion_tokens:8,total_tokens:20}, {prompt_tokens:12,completion_tokens:8,total_tokens:21}])('keeps absent or invalid token quantities unknown: %j', usage => {
    expect(decodeProviderUnits('blockrun_chat:v1', {...blockrunChatReceipt, usage}).units.every(unit => unit.state === 'unknown' && unit.quantityUnits === null)).toBe(true)
  })
  it('preserves observed zero and exact safe integers', () => {
    expect(decodeProviderUnits('blockrun_chat:v1', {...blockrunChatReceipt, usage:{prompt_tokens:0,completion_tokens:Number.MAX_SAFE_INTEGER,total_tokens:Number.MAX_SAFE_INTEGER}}).units.map(unit => unit.quantityUnits)).toEqual(['0','9007199254740991'])
  })
  it('keeps upstream character credits distinct from input character counts and money', () => {
    expect(decodeProviderUnits('blockrun_elevenlabs_speech:v1', {...blockrunSpeechReceipt, data:[{characters:500,credits:51}]}).units).toEqual([{unitDefinitionRef:'blockrun_elevenlabs_character_credit:v1',quantityExponent:0,state:'observed',quantityUnits:'51',reason:'provider_reported'}])
    for(const output of [{...blockrunSpeechReceipt,data:[{characters:51}]},{...blockrunSpeechReceipt,model:'bytedance/seed-audio-1.0'},{...blockrunSpeechReceipt,data:[{credits:51},{credits:51}]}]) expect(decodeProviderUnits('blockrun_elevenlabs_speech:v1',output).units[0]?.quantityUnits).toBeNull()
  })
  it('pins source, model, attempt and exact quantities without copying payloads', () => {
    const tool=blockrunTool(), call={callRef:'call:synthetic',ownerId:'account:one',principalId:'principal:one',credentialId:'credential:one',applicationRef:'application:one',toolRef:tool.operationId,environment:'sandbox' as const,
      requestDigest:canonicalDigest('logical'),inputJson:'{"model":"requested-model"}',state:'completed',result:{kind:'completed',output:blockrunChatReceipt,evidenceHash:canonicalDigest('response')},attemptRef:'operation-attempt:call:synthetic:1'}
    const material=providerUnitMaterial(call,tool,{attemptRef:call.attemptRef,attemptNumber:1,effectGeneration:1,operationKeyDigest:canonicalDigest('operation')})!
    const linkage={sourceDigest:material.sourceDigest,previousObservationRef:null,previousAttemptObservationRef:null,sequence:1}
    const observation={...material,...linkage,observationRef:observationRef(linkage),change:'initial_attempt' as const,occurredAt:10,effectiveAt:10,observedAt:20,timeBasis:'call_updated' as const}
    expect(verifiedProviderObservation(call,tool,observation,observation.observationRef)).toEqual(observation)
    expect(verifiedProviderObservation({...call,result:{...call.result,output:{...blockrunChatReceipt,usage:{prompt_tokens:14,completion_tokens:8,total_tokens:22}}}},tool,observation,observation.observationRef)).toBeNull()
    expect(JSON.stringify(observation)).not.toContain('SYNTHETIC_PRIVATE_OUTPUT')
    expect(observation).toMatchObject({requestedModel:'requested-model',responseModel:'gpt-5.5'})
    const totals=summarizeProviderUnits([{observation,verified:true},{verified:false}])
    expect(totals.map(row=>row.observedQuantityUnits)).toEqual(['12','8'])
    expect(totals[0]).toMatchObject({coverageBasis:'captured_profile_receipts_only',aggregationBasis:'current_selected_call_receipts'})
    expect(summarizeProviderUnits([{observation:{...observation,units:observation.units.map(unit=>({...unit,state:'estimated'}))},verified:true}]).every(row=>row.observedReceiptCountUnits==='0' && row.unknownReceiptCountUnits==='1')).toBe(true)
    expect(summarizeProviderUnits([{observation,verified:false}]).every(row=>row.observedQuantityUnits==='0' && row.unknownReceiptCountUnits==='1')).toBe(true)
  })
})
