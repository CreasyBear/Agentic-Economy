import { describe, expect, it } from 'vitest'
import { defineCapabilityContract, serviceUnitDefinitionRef, type ServiceUnitDefinition } from '@/modules/capability-contract/public'
import { decodeDeclaredServiceUnits, declaredQuantityUnits } from '@/modules/capability-execution/declared-service-units'
import { providerUnitProfile, decodeProviderUnits, providerUnitMaterial, providerUnitObservationSchema, observationRef, verifiedProviderObservation, summarizeProviderUnits, providerUnitQuantity } from '@/modules/capability-execution/provider-service-units'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { blockrunTool } from './fixtures/blockrun-service-unit-evidence'

const duration: ServiceUnitDefinition = {unitId:'audio_duration',version:1,label:'Audio seconds',dimension:'second',quantityExponent:6,outputPointer:'/usage/duration',encoding:'decimal_string',relationship:'independent'}
const bytes: ServiceUnitDefinition = {unitId:'processed_bytes',version:1,label:'Processed bytes',dimension:'byte',quantityExponent:0,outputPointer:'/usage/bytes',encoding:'integer_string',relationship:'independent'}
function contract(units: ServiceUnitDefinition[] = [duration, bytes]) {
  const {ref: _ref, ...document} = blockrunTool().contract
  return defineCapabilityContract({...document, outputSchema: {...document.outputSchema, properties:{choices:{type:'array',items:{type:'object'}},usage:{type:'object',properties:{duration:{type:'string'},bytes:{type:'string'}}}}}, serviceUnits:units})
}
describe('declared service units on the existing admitted contract', () => {
  it('retains unchanged legacy digests and makes definition changes material', () => {
    const source=blockrunTool().contract, {ref: _ref,...document}=source
    expect(defineCapabilityContract(document).ref).toEqual(source.ref)
    const first=contract(), second=contract([{...duration,quantityExponent:3},bytes])
    expect(first.ref.contractDigest).not.toBe(second.ref.contractDigest)
    expect(serviceUnitDefinitionRef(duration)).not.toBe(serviceUnitDefinitionRef({...duration,version:2}))
    expect(() => contract([duration,duration])).toThrow('capability_service_unit_definition_invalid')
    expect(() => contract([{...duration,outputPointer:'/absent'}])).toThrow('capability_service_unit_definition_invalid')
    expect(() => contract([{...duration,relationship:'subset',parentUnitId:duration.unitId}])).toThrow('capability_service_unit_definition_invalid')
  })
  it('preserves fractional duration and quantities larger than JSON safe integers', () => {
    const output={usage:{duration:'1.234567',bytes:'18446744073709551615'},privatePayload:'PRIVATE'}
    const units=decodeDeclaredServiceUnits([duration,bytes],output)
    expect(units.map(unit=>unit.quantityUnits)).toEqual(['1234567','18446744073709551615'])
    expect(providerUnitQuantity(units[0]!.quantityUnits,6)).toBe('1.234567')
    expect(JSON.stringify(units)).not.toContain('PRIVATE')
    for(const value of [1.234567,'1.2345671','-1','01.2','Infinity','1e6','1.2\n']) expect(declaredQuantityUnits(value,duration)).toBeNull()
    expect(declaredQuantityUnits('0',duration)).toBe('0')
    expect(declaredQuantityUnits(Number.MAX_SAFE_INTEGER+1,{...bytes,encoding:'integer_number'})).toBeNull()
  })
  it('requires canonical completed attempt evidence and keeps unknown distinct from zero', () => {
    const tool={...blockrunTool(),contract:contract()}
    const call={callRef:'call:declared',ownerId:'account:one',principalId:'principal:one',credentialId:'credential:one',applicationRef:'application:one',toolRef:tool.operationId,environment:'sandbox' as const,
      requestDigest:canonicalDigest('logical'),state:'completed',result:{kind:'completed',output:{choices:[],usage:{duration:'1.234567',bytes:'18446744073709551615'}},evidenceHash:canonicalDigest('response')},attemptRef:'operation-attempt:call:declared:1'}
    const attempt={attemptRef:call.attemptRef,attemptNumber:1,effectGeneration:1,operationKeyDigest:canonicalDigest('operation')}
    const material=providerUnitMaterial(call,tool,attempt)!
    const linkage={sourceDigest:material.sourceDigest,previousObservationRef:null,previousAttemptObservationRef:null,sequence:1}
    const observation=providerUnitObservationSchema.parse({...material,...linkage,observationRef:observationRef(linkage),change:'initial_attempt',occurredAt:10,effectiveAt:10,observedAt:20,timeBasis:'call_updated'})
    expect(verifiedProviderObservation(call,tool,observation,observation.observationRef)).toEqual(observation)
    expect(providerUnitMaterial({...call,state:'outcome_unknown'},tool,attempt)).toBeNull()
    expect(verifiedProviderObservation({...call,credentialId:'credential:other'},tool,observation,observation.observationRef)).toBeNull()
    const totals=summarizeProviderUnits([{observation,verified:true},{observation,verified:false}])
    expect(totals[0]).toMatchObject({observedQuantityUnits:'1234567',quantityExponent:6,unknownReceiptCountUnits:'1',coverage:'incomplete'})
    expect(totals[1]).toMatchObject({observedQuantityUnits:'18446744073709551615'})
    expect(decodeProviderUnits('declared_service_units:v1',{usage:{}},[duration]).units[0]).toMatchObject({state:'unknown',quantityUnits:null,reason:'usage_missing'})
  })
  it('uses the same measurement profile for supported MCP/API/HTTPS bindings without inferring transport units', () => {
    const tool={...blockrunTool(),contract:contract()}
    for(const adapterId of ['mcp-jsonrpc:v1','http-json:v1','x402-fetch:v2']) expect(providerUnitProfile({...tool,identity:{...tool.identity,adapterId}})).toBe('declared_service_units:v1')
    expect(providerUnitProfile({...tool,identity:{...tool.identity,adapterId:'unknown'}})).toBeNull()
  })
})
