import { afterEach,describe,expect,it,vi } from 'vitest'
import { recordGatewayTelemetry } from '@/lib/server/gateway-telemetry'
const vendors=vi.hoisted(()=>({posthog:vi.fn(),count:vi.fn(),distribution:vi.fn(),init:vi.fn().mockReturnValue(true)}))
vi.mock('@/lib/observability/posthog.server',()=>({captureServerGatewayEvent:vendors.posthog}))
vi.mock('@/lib/observability/sentry.server',()=>({initSentryServer:vendors.init,Sentry:{metrics:{count:vendors.count,distribution:vendors.distribution}}}))
afterEach(()=>vi.clearAllMocks())
describe('configured gateway observability boundary',()=>{
  it('supplies the production default sink, hashes identifiers and limits metric cardinality',()=>{
    recordGatewayTelemetry(undefined,{correlationId:'request:one',credentialId:'credential:one',principalId:'principal:one',applicationRef:'application:one',invocationRef:'call:one',operationRef:'tool:one',durationMs:37,outcome:'refused',refusalCode:'scope_required',stage:'pre_admission',transport:'http',operation:'admission'})
    const emitted=JSON.stringify(vendors.posthog.mock.calls)
    for(const raw of ['request:one','credential:one','principal:one','application:one','call:one','tool:one'])expect(emitted).not.toContain(raw)
    expect(vendors.posthog).toHaveBeenCalledWith(expect.stringMatching(/^sha256:/u),expect.objectContaining({credentialIdDigest:expect.stringMatching(/^sha256:/u),outcome:'refused'}))
    const attributes=vendors.count.mock.calls[0]?.[2]?.attributes
    expect(attributes).toEqual({outcome:'refused',transport:'http',operation:'admission',stage:'pre_admission',refusalCode:'scope_required'})
    expect(JSON.stringify(attributes)).not.toContain('Digest')
  })
  it('does not create an unbounded metric series from adapter refusal codes',()=>{
    recordGatewayTelemetry(undefined,{durationMs:0,outcome:'refused',refusalCode:'provider_error_12345'})
    expect(vendors.count.mock.calls[0]?.[2]?.attributes.refusalCode).toBe('other')
  })
  it('cannot let sink or vendor failure change admission behavior',()=>{
    expect(()=>recordGatewayTelemetry({record(){throw new Error('reporting_failure')}},{durationMs:0,outcome:'refused'})).not.toThrow()
    vendors.posthog.mockImplementationOnce(()=>{throw new Error('vendor_unavailable')})
    expect(()=>recordGatewayTelemetry(undefined,{durationMs:0,outcome:'refused'})).not.toThrow()
  })
})
