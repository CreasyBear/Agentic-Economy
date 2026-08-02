import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'

export type CreditTopupResult = Readonly<{
  kind: 'refused'
  code: 'stripe_setup_required'
}>

export type CreditTopupPort = Readonly<{
  begin: () => Promise<CreditTopupResult>
}>

const setupPendingPort: CreditTopupPort = {
  begin: async () => ({ kind: 'refused', code: 'stripe_setup_required' }),
}

export type AeCreditTopUpPanelProps = Readonly<{
  port?: CreditTopupPort
}>

export function AeCreditTopUpPanel({ port = setupPendingPort }: AeCreditTopUpPanelProps) {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<CreditTopupResult>()

  async function beginTopUp() {
    setPending(true)
    try {
      setResult(await port.begin())
    } catch {
      setResult({ kind: 'refused', code: 'stripe_setup_required' })
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="border border-border bg-card">
      <CardHeader>
        <CardTitle>Add credit for paid calls</CardTitle>
        <CardDescription>Paid calls use this credit. Any fee and the total charge are shown before payment.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {result?.code === 'stripe_setup_required' ? (
          <Alert>
            <AlertTitle>Adding credit is unavailable right now</AlertTitle>
            <AlertDescription>No payment started and your balance did not change. Try again later.</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => void beginTopUp()}
          className="min-h-11"
        >
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {pending ? 'Checking credit availability…' : 'Add credit for paid calls'}
        </Button>
      </CardFooter>
    </Card>
  )
}
