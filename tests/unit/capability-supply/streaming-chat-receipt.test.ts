import { describe, expect, it } from 'vitest'
import { completedStreamingChatReceipt, isChatCompletionStreamRequest } from '@/modules/capability-supply/internal/streaming-chat-receipt'
import { normalizeJsonResponse } from '@/modules/capability-supply/internal/route-transport-http-json'
import { decodeProviderUnits } from '@/modules/capability-execution/provider-service-units'
const chunk=(choices:unknown[], extra:Record<string,unknown>={})=>`data: ${JSON.stringify({id:'chatcmpl-synthetic',object:'chat.completion.chunk',created:1,model:'gpt-5.5',choices,...extra})}\n\n`
const first=chunk([{index:0,delta:{role:'assistant',content:'Hello '},finish_reason:null}])
const last=chunk([{index:0,delta:{content:'world'},finish_reason:'stop'}])
const usage=chunk([],{usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20}})
const complete=first+last+usage+'data: [DONE]\n\n'
describe('SDK parsed bounded streaming completion receipts',()=>{
  it('produces one complete response and one final token report, independent of comment heartbeats',async()=>{
    const output=await completedStreamingChatReceipt(': heartbeat\n\n'+complete)
    expect(output).toMatchObject({object:'chat.completion',choices:[{message:{content:'Hello world'}}]})
    expect(decodeProviderUnits('blockrun_chat:v1',output).units.map(unit=>unit.quantityUnits)).toEqual(['12','8'])
  })
  it.each([first,first+last,first+'data: [DONE]\n\n',complete+usage,first+last+usage+usage+'data: [DONE]\n\n',first+chunk([{index:0,delta:{content:'x'},finish_reason:'stop'}],{id:'chatcmpl-other'})+'data: [DONE]\n\n',first+'event: error\ndata: {}\n\n',first+'data: {"error":{"code":"provider_error"}}\n\n',first+last+'unknown: lost\n\ndata: [DONE]\n\n'])('keeps partial, duplicate, inconsistent or failed streams unknown',async text=>{
    expect(await completedStreamingChatReceipt(text)).toBeUndefined()
    const response=new Response(text,{headers:{'content-type':'text/event-stream'}})
    expect(await normalizeJsonResponse('http',response,'sha256:synthetic',true,undefined,undefined,[],true)).toMatchObject({disposition:'unknown',failureCode:'response_stream_incomplete'})
  })
  it('keeps a completed response with missing usage distinct from zero',async()=>{
    const output=await completedStreamingChatReceipt(first+last+'data: [DONE]\n\n')
    expect(output).toBeDefined()
    expect(decodeProviderUnits('blockrun_chat:v1',output).units.every(unit=>unit.quantityUnits === null)).toBe(true)
  })
  it('accepts the documented OpenRouter final usage choice repeating the finish reason without counting another completion',async()=>{
    const text=first+last+chunk([{index:0,delta:{},finish_reason:'stop'}],{usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20}})+'data: [DONE]\n\n'
    expect(await completedStreamingChatReceipt(text)).toMatchObject({choices:[{message:{content:'Hello world'},finish_reason:'stop'}],usage:{total_tokens:20}})
    expect(await completedStreamingChatReceipt(first+last+chunk([{index:0,delta:{content:'extra'},finish_reason:'stop'}],{usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20}})+'data: [DONE]\n\n')).toBeUndefined()
  })
  it('uses the installed SDK tool delta tracker without dispatching tool calls',async()=>{
    const text=chunk([{index:0,delta:{role:'assistant',tool_calls:[{index:0,id:'call-synthetic',type:'function',function:{name:'weather',arguments:'{"city":'}}]},finish_reason:null}])
      +chunk([{index:0,delta:{tool_calls:[{index:0,function:{arguments:'"Perth"}'}}]},finish_reason:'tool_calls'}])+usage+'data: [DONE]\n\n'
    expect(await completedStreamingChatReceipt(text)).toMatchObject({choices:[{message:{tool_calls:[{id:'call-synthetic',function:{name:'weather',arguments:'{"city":"Perth"}'}}]}}]})
  })
  it('requires an exact admitted provider route and explicit stream request',()=>{
    expect(isChatCompletionStreamRequest(new URL('https://blockrun.ai/api/v1/chat/completions'),'{"stream":true}')).toBe(true)
    for(const url of ['https://evil.invalid/api/v1/chat/completions','https://blockrun.ai/api/v1/chat/completions?token=x']) expect(isChatCompletionStreamRequest(new URL(url),'{"stream":true}')).toBe(false)
    expect(isChatCompletionStreamRequest(new URL('https://blockrun.ai/api/v1/chat/completions'),'{"stream":false}')).toBe(false)
  })
  it('retains byte bounds, expected content type and sensitive-value refusal',async()=>{
    expect(await normalizeJsonResponse('http',new Response(complete,{headers:{'content-type':'text/event-stream'}}),'digest',true,undefined,'application/json',[],true)).toMatchObject({disposition:'unknown',failureCode:'response_content_type_invalid'})
    expect(await normalizeJsonResponse('http',new Response(complete,{headers:{'content-type':'text/event-stream'}}),'digest',true,undefined,undefined,['Hello world'],true)).toMatchObject({disposition:'unknown',failureCode:'response_output_invalid'})
    expect(await normalizeJsonResponse('http',new Response('x'.repeat(512*1024+1),{headers:{'content-type':'text/event-stream'}}),'digest',true,undefined,undefined,[],true)).toMatchObject({disposition:'unknown',failureCode:'response_unreadable'})
  })
})
