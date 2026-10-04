import { ActivityUsageForecast } from './ActivityUsageForecast'
import { requestOwnerUsageReportServer } from '@/lib/server/durable-usage-report.functions'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/arc/button/button'
import { BillingHistory } from '@/components/arc/blocks/billing-overview/billing-overview'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import { downloadCsv, downloadJson } from '@/lib/export/csv-export'
import { generateCallUsageExportCsv } from '@/lib/export/call-usage-export'
import { assembleUsageReport, type UsageReportManifest } from '@/lib/export/durable-usage-report'
import { listOwnerUsageReportsServer, readOwnerUsageReportServer, readOwnerUsageReportPartsServer } from '@/lib/server/durable-usage-report.functions'

/** The licensed Arc panel supplies presentation; the existing source functions
 * and durable report own state. A file is released only after verification. */
export function ActivityUsageReports({request}:{request?:{reportRef:string;format:'CSV'|'JSON'}}){
  const [reports,setReports]=useState<UsageReportManifest[]>([]),[cursor,setCursor]=useState<string|null>(null)
  const [selected,setSelected]=useState<UsageReportManifest|null>(null),[message,setMessage]=useState('')
  const [pending,setPending]=useState(false),[failed,setFailed]=useState(false)
  const generation=useRef(0),inFlight=useRef(false)
  useEffect(()=>{const ref=generation;return()=>{ref.current++}},[])
  async function list(nextCursor:string|null){
    if(inFlight.current)return
    inFlight.current=true;setPending(true);setFailed(false)
    const current=++generation.current
    try{const page=await listOwnerUsageReportsServer({data:{cursor:nextCursor}})
      if(current!==generation.current)return
      setReports(previous=>nextCursor===null?page.page:[...previous,...page.page]);setCursor(page.isDone?null:page.continueCursor)
    }catch{if(current===generation.current){setFailed(true);setMessage('Saved reports could not be read. Retry when the service is available.')}}
    finally{inFlight.current=false;setPending(false)}
  }
  useEffect(()=>{void list(null)},[])
  useEffect(()=>{
    if(request===undefined)return
    const current=++generation.current
    setSelected(null);setMessage('The full-period report is being prepared. Refresh its status to download it when ready.')
    void readOwnerUsageReportServer({data:{reportRef:request.reportRef}}).then(result=>{
      if(current!==generation.current)return
      if(result.kind==='available')setSelected(result.report)
      else setMessage('The requested report is unavailable for this account.')
    }).catch(()=>{if(current===generation.current)setMessage('Report status could not be read. Refresh saved reports to retry.')})
  },[request])
  async function read(reportRef:string){
    if(inFlight.current)return
    inFlight.current=true;setPending(true)
    const current=++generation.current
    try{const result=await readOwnerUsageReportServer({data:{reportRef}})
      if(current!==generation.current)return
      if(result.kind==='available'){setSelected(result.report);setMessage('')}
      else setMessage('The report is unavailable for this account.')
    }catch{if(current===generation.current)setMessage('Report status could not be read. Retry the same report.')}
    finally{inFlight.current=false;setPending(false)}
  }
  async function prepareForecast(){
    if(inFlight.current)return
    inFlight.current=true;setPending(true);const current=++generation.current
    const now=new Date(),periodStartAt=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1),periodEndAt=Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1),reportRef=`call-usage-export:${crypto.randomUUID()}`
    try{const result=await requestOwnerUsageReportServer({data:{reportRef,periodStartAt,periodEndAt,status:'all'}})
      const read=await readOwnerUsageReportServer({data:{reportRef:result.reportRef}})
      if(current!==generation.current)return
      if(read.kind==='available'){setSelected(read.report);setMessage('Current-month history is being captured. Refresh the selected report when ready.')}
      else setMessage('The forecast report is unavailable for this account.')
    }catch{if(current===generation.current)setMessage('A complete forecast report could not be prepared. No estimate is shown from loaded rows.')}
    finally{inFlight.current=false;setPending(false)}
  }
  async function download(format:'CSV'|'JSON'){
    if(inFlight.current||selected===null||selected.state!=='complete')return
    inFlight.current=true;setPending(true);setMessage('Verifying all report pages…')
    const report=selected,current=++generation.current
    try{const document=await assembleUsageReport(report,cursor=>readOwnerUsageReportPartsServer({data:{reportRef:report.reportRef,cursor}}))
      if(current!==generation.current)return
      const name=`call-usage-${new Date(report.periodStartAt).toISOString().slice(0,10)}-${report.reportRef.slice(-36)}`
      if(format==='CSV')downloadCsv(`${name}.csv`,generateCallUsageExportCsv(document))
      else downloadJson(`${name}.json`,document)
      setMessage(`Downloaded ${document.recordCountUnits} Calls as ${format}.`)
    }catch{if(current===generation.current)setMessage('The complete report could not be verified. No partial file was downloaded. Retry the same report.')}
    finally{inFlight.current=false;setPending(false)}
  }
  return <BillingHistory title="Saved full-period reports" description="Complete Call history captured at a fixed time. Downloads include service units and financial evidence; these reports do not issue invoices.">
    <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={pending} onClick={()=>void prepareForecast()}>Prepare current-month forecast</Button><Button type="button" variant="secondary" disabled={pending} onClick={()=>void list(null)}>{failed?'Retry saved reports':'Refresh saved reports'}</Button>
      {cursor===null?null:<Button type="button" variant="secondary" disabled={pending} onClick={()=>void list(cursor)}>Older reports</Button>}
      {selected===null?null:<Button type="button" variant="secondary" disabled={pending} onClick={()=>void read(selected.reportRef)}>Refresh selected report</Button>}
      {selected===null&&request!==undefined?<Button type="button" variant="secondary" disabled={pending} onClick={()=>void read(request.reportRef)}>Read requested report</Button>:null}
    </div>
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{message}</p>
    {reports.length===0?<p className="text-sm text-muted-foreground">{failed?'Saved report history is unavailable.':'No saved reports are currently shown.'}</p>:<ul className="grid gap-2">{reports.map(report=><li key={report.reportRef}><Button type="button" variant="ghost" disabled={pending} onClick={()=>void read(report.reportRef)}>{formatUtcTimestamp(report.createdAt)} · {report.state} · {report.recordCountUnits} Calls</Button></li>)}</ul>}
    {selected===null?null:<>
      <ActivityUsageForecast report={selected} />
      <AeFactList facts={[{label:'State',value:selected.state},{label:'Period starts (UTC)',value:formatUtcTimestamp(selected.periodStartAt)},{label:'Period ends, exclusive (UTC)',value:formatUtcTimestamp(selected.periodEndAt)},
        {label:'Scope',value:`${selected.principalRef??'All Agents'} · ${selected.status}`},{label:'Captured through (UTC)',value:formatUtcTimestamp(selected.snapshotAt)},
        {label:'Calls / scanned records',value:`${selected.recordCountUnits} / ${selected.scannedCountUnits}`},{label:'Failure',value:selected.failureCode??'None'},
        {label:'Immutable evidence chain',value:selected.recordsChainDigest,mono:true}]} />
      {selected.state==='failed'?<p className="text-sm text-muted-foreground">This capture could not finish. Request a new report for the same filters after current activity settles.</p>:null}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={pending||selected.state!=='complete'} onClick={()=>void download('CSV')}>Download full CSV</Button>
        <Button type="button" variant="secondary" disabled={pending||selected.state!=='complete'} onClick={()=>void download('JSON')}>Download full JSON</Button>
        <Button type="button" variant="secondary" disabled={pending||selected.state!=='complete'} onClick={()=>downloadJson(`usage-report-manifest-${selected.reportRef.slice(-36)}.json`,selected)}>Download report manifest</Button></div>
    </>}
  </BillingHistory>
}
