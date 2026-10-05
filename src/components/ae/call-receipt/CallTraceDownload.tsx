import { useState } from 'react'
import { Button } from '@/components/arc/button/button'
import { downloadJson } from '@/lib/export/csv-export'
import { createCallTraceExport } from '@/lib/export/call-trace'
import type { FoundCallStatus } from '@/lib/call-recovery/call-status-page-types'
export function CallTraceDownload({result}:{result:FoundCallStatus}){
  const [failed,setFailed]=useState(false)
  if(result.ownerContext===undefined||result.ownerContext===null)return null
  return <div className="grid gap-2"><Button type="button" variant="secondary" onClick={()=>{try{const trace=createCallTraceExport(result);downloadJson(`call-trace-${trace.callDigest.slice(-24)}.json`,trace);setFailed(false)}catch{setFailed(true)}}}>Download safe execution trace</Button>
    <p className="text-xs text-muted-foreground">Identifiers are hashed. The trace contains execution and measurement history, exact money facts and explicit evidence coverage.</p>
    {failed?<p role="status" className="text-sm text-muted-foreground">The trace evidence could not be verified. No file was downloaded.</p>:null}</div>
}
