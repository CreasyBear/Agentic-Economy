import { EventSourceParserStream, StreamingToolCallTracker, secureJsonParse, type StreamingToolCallDelta } from '@ai-sdk/provider-utils'
import { z } from 'zod'
import { isBoundedJsonValue } from '@/modules/common/bounded-json'
import { isRecord } from '@/modules/common/is-record'

const chunkSchema = z.object({id:z.string().min(1).max(200),object:z.literal('chat.completion.chunk'),created:z.number().int().nonnegative().safe(),model:z.string().min(1).max(200),
  choices:z.array(z.object({index:z.number().int().min(0).max(15),delta:z.object({role:z.literal('assistant').optional(),content:z.string().nullable().optional(),
    tool_calls:z.array(z.object({index:z.number().int().min(0).max(15),id:z.string().min(1).max(200).optional(),type:z.literal('function').optional(),function:z.object({name:z.string().max(200).optional(),arguments:z.string().optional()}).optional()})).max(16).optional()}).passthrough(),
    finish_reason:z.string().min(1).max(50).nullable().optional()}).passthrough()).max(16),usage:z.unknown().optional()}).passthrough()

function parsePrivateJson(text:string):unknown|undefined {
  try {const value:unknown=secureJsonParse(text);return isBoundedJsonValue(value)?value:undefined} catch {return undefined}
}

export function isChatCompletionStreamRequest(endpoint: URL, inputJson: string): boolean {
  const routes=new Map([['https://blockrun.ai','/api/v1/chat/completions'],['https://openrouter.ai','/api/v1/chat/completions'],['https://api.openai.com','/v1/chat/completions']])
  const input=parsePrivateJson(inputJson)
  return !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash
    && routes.get(endpoint.origin) === endpoint.pathname && isRecord(input) && input.stream === true
}

/** Existing byte/deadline bounds apply before SDK parsing. This produces one
 * completion receipt only after all choices terminate and the provider DONE
 * marker arrives. It never reconnects, dispatches tools or signs a payment. */
export async function completedStreamingChatReceipt(text: string): Promise<unknown | undefined> {
  const events=new ReadableStream<string>({start(controller){controller.enqueue(text);controller.close()}})
    .pipeThrough(new EventSourceParserStream({onError:'terminate',maxBufferSize:512*1024})).getReader()
  type Choice={index:number;content:string;finishReason:string|null;tools:Array<{id:string;type:'function';function:{name:string;arguments:string}}>;tracker:StreamingToolCallTracker}
  const choices=new Map<number,Choice>()
  let identity: {id:string;model:string;created:number}|undefined, usage:unknown, usageSeen=false, done=false, count=0
  try {
    for (;;) {
      const item=await events.read()
      if(item.done) break
      if(++count>2048 || done || (item.value.event !== undefined && item.value.event !== 'message')) return undefined
      if(item.value.data === '[DONE]'){done=true;continue}
      const parsed=chunkSchema.safeParse(parsePrivateJson(item.value.data))
      if(!parsed.success || 'error' in parsed.data) return undefined
      const chunk=parsed.data
      const hasUsage=chunk.usage !== null && chunk.usage !== undefined
      if(usageSeen) return undefined
      if(identity === undefined) identity={id:chunk.id,model:chunk.model,created:chunk.created}
      if(identity.id !== chunk.id || identity.model !== chunk.model || identity.created !== chunk.created) return undefined
      if(hasUsage){
        if(choices.size === 0 || [...choices.values()].some(choice=>choice.finishReason === null)
          || chunk.choices.some(choice=>Object.values(choice.delta).some(value=>value !== null && value !== '' && value !== undefined))) return undefined
        usage=chunk.usage;usageSeen=true
      }
      for(const delta of chunk.choices){
        if(Object.keys(delta).some(key=>!['index','delta','finish_reason'].includes(key))) return undefined
        let choice=choices.get(delta.index)
        if(choice === undefined){
          const tools:Choice['tools']=[]
          const tracker=new StreamingToolCallTracker({enqueue(part){if(part?.type === 'tool-call'){
            if(!isRecord(parsePrivateJson(part.input))) throw new Error('stream_tool_input_invalid')
            tools.push({id:part.toolCallId,type:'function',function:{name:part.toolName,arguments:part.input}})
          }}},{typeValidation:'if-present',generateId(){throw new Error('stream_tool_id_missing')}})
          choice={index:delta.index,content:'',finishReason:null,tools,tracker};choices.set(delta.index,choice)
        }
        // OpenRouter repeats the terminal finish reason in its one final usage
        // frame. It carries no content and must not create another completion.
        if(choice.finishReason !== null){
          if(!hasUsage || delta.finish_reason !== choice.finishReason || Object.keys(delta.delta).some(key=>!['content'].includes(key))) return undefined
          continue
        }
        // Retain the complete declared response; unfamiliar content requires a
        // dedicated SDK adapter rather than silently losing a delivered field.
        if(Object.keys(delta.delta).some(key=>!['role','content','tool_calls'].includes(key))) return undefined
        choice.content += delta.delta.content ?? ''
        for(const tool of delta.delta.tool_calls ?? []) choice.tracker.processDelta(tool as StreamingToolCallDelta)
        if(delta.finish_reason != null){choice.tracker.flush();choice.finishReason=delta.finish_reason}
      }
    }
    if(!done || identity === undefined || choices.size === 0 || [...choices.values()].some(choice=>choice.finishReason === null)) return undefined
    return {...identity,object:'chat.completion',choices:[...choices.values()].sort((a,b)=>a.index-b.index).map(choice=>({index:choice.index,
      message:{role:'assistant',content:choice.content,...(choice.tools.length === 0 ? {} : {tool_calls:choice.tools})},finish_reason:choice.finishReason})),
      ...(usageSeen ? {usage} : {})}
  } catch { return undefined } finally {await events.cancel().catch(()=>undefined);events.releaseLock()}
}
