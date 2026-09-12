export type DirectoryEligibilitySignals = Readonly<{
  hasOutputSchema: boolean
  hasOutputExample: boolean
  /** -1 (or any value under 2) means "no external-demand signal", matching the stored search row's payersOrder sentinel. */
  payersOrder: number
}>

/**
 * Directory eligibility: a declared output shape (schema or a non-empty
 * example) AND at least two distinct payers in the last 30 days. One payer
 * in 30 days is indistinguishable from the listed source calling itself to
 * seed activity; two is the minimum external-demand signal.
 *
 * Measured 2026-09-12 on prod generation
 * coinbase-1789178211472-60a459c7-d08f-48f4-b4a1-b823072b6464 (14,541 rows,
 * network '*'): hasOutputSchema||hasOutputExample 11,654 (80.1%); payersOrder
 * >= 2, i.e. adoptionBand in {2_4,5_9,10_49,50_plus}, 3,835 (26.4%); combined
 * eligible 3,190 (21.9%). The candidate rules from the original pass
 * (payersOrder > 0, true for 99.8% of rows since almost every entry reports
 * at least one payer) did not discriminate at all; raising the payer floor
 * to 2 is what makes the bar selective.
 */
export function isDirectoryEntryEligible(signals: DirectoryEligibilitySignals): boolean {
  return (signals.hasOutputSchema || signals.hasOutputExample) && signals.payersOrder >= 2
}
