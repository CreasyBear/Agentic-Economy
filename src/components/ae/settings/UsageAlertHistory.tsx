import { useRef,useState } from 'react'
import { BillingHistory } from '@/components/ae/shared/arc-pro/billing-overview/billing-overview'
import { Button } from '@/components/arc/button/button'
import { readUsageAlertHistoryServer } from '@/lib/server/usage-alert-history.functions'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
type Page=Awaited<ReturnType<typeof readUsageAlertHistoryServer>>
export function UsageAlertHistory(){
  const [rows,setRows]=useState<Page['page']>([]),[cursor,setCursor]=useState<string|null>(null),[pending,setPending]=useState(false),[message,setMessage]=useState('Refresh to read recorded notification delivery states.')
  const inFlight=useRef(false)
  async function read(next:string|null){if(inFlight.current)return;inFlight.current=true;setPending(true)
    try{const result=await readUsageAlertHistoryServer({data:{cursor:next}});setRows(previous=>next===null?result.page:[...previous,...result.page]);setCursor(result.isDone?null:result.continueCursor);setMessage(result.page.length===0?'No recorded deliveries in this page.':'Recorded state is shown; pending does not mean delivered.')}
    catch{setMessage('Delivery history is unavailable. Retry when the service is available.')}
    finally{inFlight.current=false;setPending(false)}}
  return <BillingHistory title="Notification delivery history" description="Owner-scoped delivery states include retries exhausted, rate suppression and changed consent. Email addresses and vendor payloads are excluded.">
    <div className="flex gap-2"><Button type="button" variant="secondary" disabled={pending} onClick={()=>void read(null)}>Refresh delivery history</Button>{cursor===null?null:<Button type="button" variant="secondary" disabled={pending} onClick={()=>void read(cursor)}>Older deliveries</Button>}</div>
    <p role="status" className="text-sm text-muted-foreground">{message}</p><ul>{rows.map(row=><li key={row.deliveryRef} className="text-sm">{formatUtcTimestamp(row.createdAt)} UTC · {row.eventKind.replaceAll('_',' ')} · {row.state}{row.reason===null?'':` · ${row.reason}`}</li>)}</ul>
  </BillingHistory>
}
