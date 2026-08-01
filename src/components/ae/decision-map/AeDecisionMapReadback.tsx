import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useDecisionMap } from '@/modules/decision-map/decision-map-client'
import { AeDecisionMapJourney } from './AeDecisionMapJourney'

export type AeDecisionMapReadbackProps = Readonly<{ threadId: string | undefined; fallback?: ReactNode }>

export function AeDecisionMapReadback({ threadId, fallback }: AeDecisionMapReadbackProps) {
  const readback = useDecisionMap(threadId)
  if (readback.status === 'loading') {
    return <Card aria-busy="true" className="border border-border bg-card"><CardContent><p role="status" className="text-sm text-muted-foreground">Loading your decision map…</p></CardContent></Card>
  }
  if (readback.status === 'empty') {
    return fallback ?? <Card className="border border-border bg-card"><CardHeader><CardTitle>Your decision map is not ready yet.</CardTitle><CardDescription>Nothing has been locked. Start with your request and the map will appear here.</CardDescription></CardHeader></Card>
  }
  if (readback.status === 'error') {
    return <Card role="alert" className="border border-destructive/50 bg-card"><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>{readback.certainty === 'definite' ? 'The decision map could not be found.' : 'The decision map could not be loaded.'}</CardTitle><Badge variant="outline">{readback.certainty === 'definite' ? 'Needs a new map' : 'Try again'}</Badge></div><CardDescription>{readback.certainty === 'definite' ? 'This request has no current map. Nothing was changed.' : 'The latest map is temporarily unavailable. Nothing was changed.'}</CardDescription></CardHeader><CardFooter><Button type="button" variant="secondary" className="min-h-11" onClick={readback.retry}>Load the latest map</Button></CardFooter></Card>
  }
  return <AeDecisionMapJourney snapshot={readback.snapshot} recordChoice={readback.recordChoice} recordConstraintChange={readback.recordConstraintChange} />
}
