import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export type DirectoryRecipientRankProps = Readonly<{
  digest: string
  recipients: readonly Readonly<{
    recipient: string
    amountLabel: string
    transferCountLabel: string
    uniqueBuyersLabel: string
    toolCountLabel: string
  }>[]
}>

function shortAddress(value: string): string {
  return value.length < 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`
}

/** Top Base USDC recipients for the stored 30-day window. The digest names the facilitator set that produced the sum. */
export function DirectoryRecipientRank({ digest, recipients }: DirectoryRecipientRankProps) {
  return (
    <section className="mb-5" aria-label="Settled USDC">
      <h2 className="text-sm font-medium">Where the USDC went</h2>
      <p className="mt-1 break-all text-xs text-muted-foreground">Settled Base USDC, 30 days. Facilitator set {digest}. Buyers who used two facilitators are counted in each.</p>
      {recipients.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No settled USDC in the stored window.</p> : (
        <Table className="mt-3" aria-label="Settled USDC recipients">
          <TableHeader>
            <TableRow>
              <TableHead>Recipient</TableHead>
              <TableHead className="text-right">30-day USDC</TableHead>
              <TableHead className="text-right">Transfers</TableHead>
              <TableHead className="text-right">Buyers</TableHead>
              <TableHead className="text-right">Tools</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipients.map(recipient => (
              <TableRow key={recipient.recipient}>
                <TableCell className="font-mono text-xs" title={recipient.recipient}>{shortAddress(recipient.recipient)}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{recipient.amountLabel}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{recipient.transferCountLabel}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{recipient.uniqueBuyersLabel}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{recipient.toolCountLabel}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
