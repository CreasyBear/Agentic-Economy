import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeOperationPrice } from '@/components/ae/market/AeOperationPrice'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Marker, MarkerContent } from '@/components/ui/marker'
import { Skeleton } from '@/components/ui/skeleton'
import {
  chatBrowseMarket,
  chatChoiceLinkName,
  chatShowingOperations,
  chatToolStatus,
  chatViewOperation,
} from '@/lib/public/chat-ia'
import {
  operationCardState,
  type OperationCardProjection,
  type OperationChoiceRow,
} from '@/modules/chat/tool-card'

const READINESS_VARIANT = {
  'Ready now': 'success',
  'Setup required': 'warning',
  Unavailable: 'outline',
} as const

function inspectHref(operationRef: string): string {
  return `/operations/${encodeURIComponent(operationRef)}`
}

function choiceInitial(title: string): string {
  return title.trim().charAt(0).toUpperCase() || 'O'
}

function readinessVariant(readiness: string | undefined): 'success' | 'warning' | 'outline' | undefined {
  if (readiness === 'Ready now') return READINESS_VARIANT['Ready now']
  if (readiness === 'Setup required') return READINESS_VARIANT['Setup required']
  if (readiness === 'Unavailable') return READINESS_VARIANT.Unavailable
  return undefined
}

function ChoiceRow({ choice }: { choice: OperationChoiceRow }) {
  const badgeVariant = readinessVariant(choice.readiness)
  return (
    <Item asChild variant="muted" size="sm">
      <a href={inspectHref(choice.operationRef)} aria-label={chatChoiceLinkName(choice.title, choice.readiness)}>
        <ItemMedia variant="icon" aria-hidden="true" className="font-mono text-xs font-semibold">
          {choiceInitial(choice.title)}
        </ItemMedia>
        <ItemContent>
          <ItemHeader>
            <ItemTitle>{choice.title}</ItemTitle>
            {choice.readiness === undefined || badgeVariant === undefined ? null : (
              <Badge variant={badgeVariant}>{choice.readiness}</Badge>
            )}
          </ItemHeader>
          {choice.supplier === undefined ? null : (
            <ItemDescription>{choice.supplier}</ItemDescription>
          )}
          {choice.access === undefined ? null : (
            <ItemFooter className="text-muted-foreground">{choice.access}</ItemFooter>
          )}
        </ItemContent>
        {choice.price === undefined ? null : (
          <AeOperationPrice price={choice.price} size="sm" className="basis-full sm:ms-auto sm:basis-auto" />
        )}
      </a>
    </Item>
  )
}

function ChoiceList({ choices }: { choices: readonly OperationChoiceRow[] }) {
  return (
    <ItemGroup className="gap-intra" aria-label="Tools">
      {choices.map((choice) => (
        <ChoiceRow key={choice.operationRef} choice={choice} />
      ))}
    </ItemGroup>
  )
}

function ChoiceRemainder({ count, shown }: { count: number; shown: number }) {
  const remainder = count > shown && shown > 0
  return (
    <Marker>
      <MarkerContent>
        {chatShowingOperations(shown, count)}
        {remainder ? (
          <>
            {' '}
            <a href="/market?window=30d">{chatBrowseMarket}</a>
          </>
        ) : null}
      </MarkerContent>
    </Marker>
  )
}

function CardBody({ projection }: { projection: OperationCardProjection }) {
  switch (projection.kind) {
    case 'working':
      return <Skeleton className="h-4 w-1/3" />
    case 'status':
      return (
        <Alert variant={projection.state === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{projection.summary}</AlertDescription>
        </Alert>
      )
    case 'choices':
      return (
        <div className="grid gap-related">
          {projection.choices.length === 0 ? null : <ChoiceList choices={projection.choices} />}
          {projection.contrasts === undefined || projection.contrasts.length === 0
            ? null
            : <AeFactList density="compact" facts={projection.contrasts} />}
        </div>
      )
    case 'inspect':
      return projection.facts.length === 0
        ? null
        : <AeFactList density="compact" facts={projection.facts} />
    case 'execute': {
      const operationRef = projection.operationRefs[0]
      return (
        <div className="grid gap-related">
          <Alert variant={projection.state === 'reconciliation_required' ? 'destructive' : 'default'}>
            <AlertTitle>{executeStateTitle(projection.state)}</AlertTitle>
            <AlertDescription>{projection.summary}</AlertDescription>
          </Alert>
          {projection.name === undefined || operationRef === undefined ? null : (
            <Item asChild variant="muted" size="sm">
              <a href={inspectHref(operationRef)} aria-label={chatViewOperation(projection.name)}>
                <ItemMedia variant="icon" aria-hidden="true" className="font-mono text-xs font-semibold">
                  {choiceInitial(projection.name)}
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{projection.name}</ItemTitle>
                </ItemContent>
              </a>
            </Item>
          )}
          {projection.outputPreview === undefined ? null : (
            <section className="grid min-w-0 gap-intra" aria-label="Operation result">
              <h4 className="text-sm font-semibold text-foreground">Returned output</h4>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/35 p-3 font-mono text-xs leading-5 text-foreground">
                {projection.outputPreview}
              </pre>
              {projection.outputTruncated === true ? (
                <p className="text-xs text-muted-foreground">Preview truncated. Open the call receipt for the canonical result.</p>
              ) : null}
            </section>
          )}
          {projection.facts.length === 0 ? null : (
            <AeFactList density="compact" facts={projection.facts} />
          )}
          {projection.invocationRef === undefined ? null : (
            <AeFactList density="compact" facts={[{
              label: 'Call reference',
              value: <AeCopyReference label="call reference" value={projection.invocationRef} />,
            }]} />
          )}
          {projection.receiptRef === undefined ? null : (
            <AeFactList density="compact" facts={[{
              label: 'Receipt reference',
              value: <AeCopyReference label="receipt reference" value={projection.receiptRef} />,
            }]} />
          )}
          {projection.evidenceHash === undefined ? null : (
            <details className="group border-t border-border pt-intra">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Evidence</summary>
              <AeCopyReference label="evidence hash" value={projection.evidenceHash} className="mt-intra" />
            </details>
          )}
          {projection.nextAction === undefined ? null : (
            <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Next:</span> {projection.nextAction}</p>
          )}
        </div>
      )
    }
    default: {
      const exhaustive: never = projection
      return exhaustive
    }
  }
}

function executeStateTitle(state: Extract<OperationCardProjection, { kind: 'execute' }>['state']): string {
  if (state === 'completed') return 'Result ready'
  if (state === 'pending') return 'Call pending'
  if (state === 'needs_authority') return 'Approval required'
  if (state === 'reconciliation_required') return 'Reconciliation required'
  return 'Call refused'
}

function ExecuteContinuation({ projection }: Readonly<{
  projection: Extract<OperationCardProjection, { kind: 'execute' }>
}>) {
  const continuation = projection.continuation
  if (continuation === undefined) return null
  if (continuation.href !== undefined) {
    return (
      <Button asChild variant="outline" size="sm">
        <a href={continuation.href}>{continuation.label}</a>
      </Button>
    )
  }
  return continuation.command === undefined
    ? null
    : <AeCopyCommand compact label={continuation.label} code={continuation.command} />
}

const STATUS_VARIANT = {
  complete: 'success',
  working: 'info',
  pending: 'info',
  attention: 'warning',
  refused: 'warning',
  error: 'destructive',
} as const

export function OperationCard({ projection }: { projection: OperationCardProjection }) {
  const state = operationCardState(projection)
  return (
    <Card data-operation-tool={projection.toolId}>
      <CardHeader>
        <CardTitle>
          <h3 className="m-0">{projection.title}</h3>
        </CardTitle>
        <CardAction>
          <Badge variant={STATUS_VARIANT[state]}>{chatToolStatus[state]}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <CardBody projection={projection} />
      </CardContent>
      {projection.kind === 'choices' && projection.count !== undefined ? (
        <CardFooter>
          <ChoiceRemainder count={projection.count} shown={projection.choices.length} />
        </CardFooter>
      ) : projection.kind === 'execute' && projection.continuation !== undefined ? (
        <CardFooter>
          <ExecuteContinuation projection={projection} />
        </CardFooter>
      ) : null}
    </Card>
  )
}
