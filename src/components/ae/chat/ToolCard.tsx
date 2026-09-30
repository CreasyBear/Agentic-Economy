import { createContext, useContext } from 'react'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AeToolPrice } from '@/components/ae/market/AeToolPrice'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Spinner } from '@/components/ui/spinner'
import {
  chatBelowMatch,
  chatBrowseMarket,
  chatChoiceLinkName,
  chatShowingTools,
  chatToolStatus,
} from '@/lib/public/chat-ia'
import {
  toolCardState,
  toolChoiceReadinessLabel,
  type ChatNeedActions,
  type ToolCardProjection,
  type ToolChoiceRow,
} from '@/modules/chat/tool-card'
import { NeedSaveAction } from './need-save-action/NeedSaveAction'
import { RecoveryNotice } from './recovery/RecoveryNotice'
import type { SearchNextProps, ToolCardProps as ToolCardBaseProps } from './presentation'
import type { RunIntent } from '@/modules/chat/run-request'
import { readChatRecoveryReason } from './recovery/recovery.view-model'
import type { ChatRecoveryReason } from './recovery/recovery.contracts'

type ToolCardProps = ToolCardBaseProps & Readonly<{
  onAddCredit?: ((shortfall?: { units: string; exponent: number }, run?: RunIntent) => void) | undefined
}>

export const ChatNeedActionsContext = createContext<ChatNeedActions | null>(null)

function inspectHref(toolRef: string): string {
  return `/tools/${encodeURIComponent(toolRef)}`
}
function safeRecoveryReason(reason: string | undefined, fallback: ChatRecoveryReason): ChatRecoveryReason {
  const known = readChatRecoveryReason(reason)
  return known === 'unknown' ? fallback : known
}


function choiceInitial(title: string): string {
  return title.trim().charAt(0).toUpperCase() || 'T'
}


function ChoiceRow({ choice }: { choice: ToolChoiceRow }) {
  const readinessLabel = choice.readiness === undefined ? undefined : toolChoiceReadinessLabel(choice.readiness)
  return (
    <Item
      variant="muted"
      size="sm"
      render={
        <a href={choice.detailHref ?? inspectHref(choice.toolRef)} aria-label={chatChoiceLinkName(choice.title, choice.readiness === 'ready' ? 'Ready now' : undefined)}>
          <ItemMedia variant="icon" aria-hidden="true" className="font-mono text-xs font-semibold">
            {choiceInitial(choice.title)}
          </ItemMedia>
          <ItemContent>
            <ItemHeader>
              <ItemTitle>{choice.title}</ItemTitle>
              {readinessLabel === undefined ? null : (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden="true" className={choice.readiness === 'ready' ? 'size-1.5 rounded-full bg-success' : 'size-1.5 rounded-full bg-warning'} />{readinessLabel}</span>
              )}
            </ItemHeader>
            {choice.provider === undefined ? null : (
              <ItemDescription>{choice.provider}</ItemDescription>
            )}
            {choice.access === undefined ? null : (
              <ItemFooter className="text-muted-foreground">{choice.access === 'external_listing' ? 'External listing · not callable through AE' : choice.access}</ItemFooter>
            )}
          </ItemContent>
          {choice.price === undefined ? null : (
            <AeToolPrice price={choice.price} {...(choice.priceValidUntil === undefined ? {} : { validUntil: choice.priceValidUntil })} size="sm" className="basis-full sm:ms-auto sm:basis-auto" />
          )}
        </a>
      }
    />
  )
}

function CompareTable({ choices }: { choices: readonly ToolChoiceRow[] }) {
  return (
    <>
      <div className="min-w-0 md:hidden">
        <ChoiceList choices={choices} />
      </div>
      <div className="hidden min-w-0 overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tool</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Readiness</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {choices.map((choice) => (
              <TableRow key={choice.toolRef}>
                <TableCell>
                  <a href={choice.detailHref ?? inspectHref(choice.toolRef)}>{choice.title}</a>
                  {choice.belowMatch === true ? <p className="text-sm text-muted-foreground">{chatBelowMatch}</p> : null}
                </TableCell>
                <TableCell>{choice.provider ?? ''}</TableCell>
                <TableCell className="tabular-nums">{choice.price ?? ''}</TableCell>
                <TableCell>{choice.readiness === undefined ? '' : toolChoiceReadinessLabel(choice.readiness)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

function ChoiceList({ choices }: { choices: readonly ToolChoiceRow[] }) {
  return (
    <ItemGroup className="gap-intra" aria-label="Tools">
      {choices.map((choice) => (
        <ChoiceRow key={choice.toolRef} choice={choice} />
      ))}
    </ItemGroup>
  )
}

function ChoiceRemainder({ count, shown }: { count: number; shown: number }) {
  const remainder = count > shown && shown > 0
  return (
    <Marker>
      <MarkerContent>
        {chatShowingTools(shown, count)}
        {remainder ? (
          <>
            {' '}
            <a href="/market">{chatBrowseMarket}</a>
          </>
        ) : null}
      </MarkerContent>
    </Marker>
  )
}

export function SearchNext({ next, onContinueSearch, onRepeatSearch, signedThread }: SearchNextProps) {
  if (next === undefined) return null
  if (next.action === 'next-page') {
    if (signedThread && !next.args.cursor.startsWith('sc1.') && onRepeatSearch !== undefined) {
      return <Button type="button" variant="outline" size="sm" className="min-h-touch"
        onClick={() => onRepeatSearch(next.args.query)}>Search again in this chat</Button>
    }
    if (onContinueSearch !== undefined && (!signedThread || next.args.cursor.startsWith('sc1.'))) {
      return <Button type="button" variant="outline" size="sm" className="min-h-touch"
        onClick={() => onContinueSearch(next)}>Next page</Button>
    }
    return <a href={`/market?query=${encodeURIComponent(next.args.query)}`}
      className={buttonVariants({ variant: 'outline', size: 'sm' })}>Browse Tools in the Market</a>
  }
  if (next.action === 'broaden') return (
    <a href={`/market?query=${encodeURIComponent(next.args.query)}`}
      className={buttonVariants({ variant: 'outline', size: 'sm' })}>{chatBrowseMarket}</a>
  )
  if (next.action === 'retry') return onRepeatSearch === undefined
    ? <a href={`/market?query=${encodeURIComponent(next.args.query)}`}
      className={buttonVariants({ variant: 'outline', size: 'sm' })}>{chatBrowseMarket}</a>
    : <Button type="button" variant="outline" size="sm" className="min-h-touch"
      onClick={() => onRepeatSearch(next.args.query)}>Try again</Button>
  return null
}

function cardBody(projection: ToolCardProjection, onAddCredit?: ToolCardProps['onAddCredit']) {
  switch (projection.kind) {
    case 'working':
    case 'clarify':
      return null
    case 'status': {
      if (projection.state === 'attention') {
        return <Alert><AlertDescription>{projection.summary}</AlertDescription></Alert>
      }
      const funding = projection.funding
      const reason = safeRecoveryReason(projection.recoveryReason, 'tool_unavailable')
      return <RecoveryNotice reason={reason}
        {...(reason !== 'insufficient_balance' || onAddCredit === undefined
          ? {} : { onAddCredit: () => onAddCredit(funding) })} />
    }
    case 'choices':
      return (
        <div className="grid gap-related">
          {projection.choices.length === 0 ? null : projection.toolId === 'registry.tools.compare' || projection.surface === 'compare'
            ? <CompareTable choices={projection.choices} />
            : <ChoiceList choices={projection.choices} />}
          {projection.contrasts === undefined || projection.contrasts.length === 0
            ? null
            : <AeFactList density="compact" facts={projection.contrasts} />}
        </div>
      )
    case 'inspect':
      return projection.facts.length === 0
        ? null
        : <AeFactList density="compact" facts={projection.facts} />
    case 'execute':
      return (
        <div className="grid gap-intra">
          {projection.state === 'refused' || projection.state === 'reconciliation_required' ? (
            <RecoveryNotice
              reason={safeRecoveryReason(projection.recoveryReason, projection.state === 'reconciliation_required' ? 'outcome_unknown' : 'tool_unavailable')}
              {...(projection.callRef === undefined ? {} : { callRefs: [projection.callRef] })}
              {...(projection.state !== 'refused' || projection.recoveryReason !== 'insufficient_balance' || onAddCredit === undefined
                ? {} : { onAddCredit: () => onAddCredit() })}
            />
          ) : (
            <Alert variant="default">
              <AlertTitle>{executeStateTitle(projection.state)}</AlertTitle>
              <AlertDescription>{projection.summary}</AlertDescription>
            </Alert>
          )}
          {projection.paid === undefined ? null : <Badge variant="secondary">{projection.paid}</Badge>}
        </div>
      )
    default: {
      const exhaustive: never = projection
      return exhaustive
    }
  }
}

function executeStateTitle(state: Extract<ToolCardProjection, { kind: 'execute' }>['state']): string {
  if (state === 'completed') return 'Result ready'
  if (state === 'pending') return 'Call pending'
  if (state === 'needs_authority') return 'Approval required'
  if (state === 'reconciliation_required') return 'Reconciliation required'
  return 'Call refused'
}

function ExecuteNextAction({ projection }: Readonly<{
  projection: Extract<ToolCardProjection, { kind: 'execute' }>
}>) {
  const suggestedNextAction = projection.suggestedNextAction
  if (suggestedNextAction === undefined) return null
  if (suggestedNextAction.href !== undefined) {
    return (
      <a
        href={suggestedNextAction.href}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        {suggestedNextAction.label}
      </a>
    )
  }
  return suggestedNextAction.command === undefined
    ? null
    : <AeCopyCommand compact label={suggestedNextAction.label} code={suggestedNextAction.command} />
}

const STATUS_VARIANT = {
  complete: 'success',
  working: 'info',
  pending: 'info',
  attention: 'warning',
  refused: 'warning',
  error: 'destructive',
} as const

export function ToolCard({ projection, onContinueSearch, onRepeatSearch, signedThread, onAddCredit }: ToolCardProps) {
  const needActions = useContext(ChatNeedActionsContext)
  if (projection.kind === 'working') {
    return (
      <p className="flex items-center gap-related text-sm text-muted-foreground" role="status">
        <Spinner aria-hidden="true" role="presentation" />
        <span>{projection.title}…</span>
      </p>
    )
  }
  if (projection.kind === 'clarify') return null
  const state = toolCardState(projection)
  return (
      <Card data-tool-card={projection.toolId} className="min-w-0 rounded-card border-0 bg-muted/40 shadow-none">
      <CardHeader>
        <CardTitle>
          <h3 className="m-0">{projection.title}</h3>
        </CardTitle>
        <CardAction>
          <Badge variant={STATUS_VARIANT[state]}>{chatToolStatus[state]}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {cardBody(projection, onAddCredit)}
      </CardContent>
      {(projection.kind === 'choices' && (projection.count !== undefined || projection.next !== undefined))
        || (projection.kind === 'status' && (projection.next !== undefined || projection.saveNeed !== undefined)) ? (
        <CardFooter className="grid gap-intra">
          {projection.kind === 'choices' && projection.count !== undefined ? <ChoiceRemainder count={projection.count} shown={projection.choices.length} /> : null}
          {projection.next === undefined ? null : <SearchNext next={projection.next}
            {...(onContinueSearch === undefined ? {} : { onContinueSearch })}
            {...(onRepeatSearch === undefined ? {} : { onRepeatSearch })}
            {...(signedThread === undefined ? {} : { signedThread })} />}
          {projection.kind === 'status' && projection.saveNeed !== undefined ? <NeedSaveAction input={projection.saveNeed} actions={needActions} /> : null}
        </CardFooter>
      ) : projection.kind === 'execute' && projection.suggestedNextAction !== undefined
        && projection.state !== 'reconciliation_required' && projection.state !== 'refused' ? (
        <CardFooter>
          <ExecuteNextAction projection={projection} />
        </CardFooter>
      ) : null}
    </Card>
  )
}
