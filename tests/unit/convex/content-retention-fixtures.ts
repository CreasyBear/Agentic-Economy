import type { Doc } from '../../../convex/_generated/dataModel'

export const retentionCall = {
  callRef: 'call:retention', principalId: 'principal:retention', ownerId: 'account:retention',
  credentialId: 'credential:retention', applicationRef: 'application:retention', toolRef: 'tool:retention',
  idempotencyKey: 'original-key', environment: 'sandbox', grantRef: 'grant:retention', grantGeneration: 1,
  policyDigest: 'sha256:policy', grantExpiresAt: 2000, inputJson: '{"private":"input"}',
  inputDigest: 'sha256:input', requestDigest: 'sha256:request', state: 'completed', dispatchState: 'completed',
  result: { kind: 'completed', callRef: 'call:retention', toolRef: 'tool:retention', evidenceHash: 'sha256:output',
    output: { private: 'output' }, usage: { usageRef: 'usage:retention', observedAt: 1000,
      chargeState: 'free_tier', amount: { currency: 'AUD', units: '0', exponent: 6 }, priceDigest: 'sha256:price' } },
  createdAt: 100, updatedAt: 1000,
} satisfies Omit<Doc<'capabilityCalls'>, '_id' | '_creationTime'>

export const retentionQuote = {
  quoteRef: 'quote:retention', principalId: 'principal:retention', accountRef: 'account:retention',
  credentialId: 'credential:retention', applicationRef: 'application:retention', environment: 'sandbox',
  grantRef: 'grant:retention', grantGeneration: 1, grantPolicyDigest: 'sha256:grant', grantExpiresAt: 2000,
  toolRef: 'tool:retention', toolVersion: 1, toolMaterialDigest: 'sha256:tool', currentToolDigest: 'sha256:current-tool',
  toolJson: '{}', normalizedInputJson: '{"private":"input"}', inputDigest: 'sha256:input',
  pricingJson: '{}', pricingDigest: 'sha256:pricing', decisionAudUnits: '10000',
  x402RequirementJson: '{"resource":"https://provider.test?private=input"}',
  x402PaymentRequiredJson: '{"private":"price-probe"}',
  budgetPolicyRef: 'budget:retention', budgetGeneration: 1, maximumSpendPerCallUnits: '1000000',
  formanceSchemaVersion: 'v1.5.0', policyGeneration: 1, legalCustomerRef: 'customer:retention', legalCustomerGeneration: 1,
  buyerRevenueUnits: '9000', buyerTaxUnits: '1000', accountAvailableUnits: '1000000', budgetAvailableUnits: '1000000',
  legalExposureAvailableUnits: '1000000', balanceUnits: '1000000', commercialPolicyRefs: ['policy:retention'],
  commercialPolicyDigest: 'sha256:policy', evidenceDigest: 'sha256:evidence', state: 'consumed',
  consumedCallRef: 'call:retention', expiresAt: 1100, createdAt: 100, updatedAt: 1000,
} satisfies Omit<Doc<'capabilityQuotes'>, '_id' | '_creationTime'>

export const retentionResolution = {
  resolutionRef: 'resolution:retention', recordDigest: 'sha256:resolution', callRef: 'call:retention',
  quoteRef: 'quote:retention', accountRef: 'account:retention', customerRef: 'customer:retention',
  agentPrincipalRef: 'principal:retention', sellerRef: 'seller:retention', providerRef: 'provider:retention',
  paymentRecipientRef: 'payee:retention', terminalState: 'completed', deliveryState: 'delivered', paymentState: 'settled',
  considerationAmount: { currency: 'AUD', units: '10000', exponent: 6 }, considerationNetUnits: '9000', considerationGstUnits: '1000',
  providerObligationAmount: { currency: 'USDC', units: '5000', exponent: 6 }, resolvedAt: 1000, createdAt: 1000,
} satisfies Omit<Doc<'purchaseResolutionRecords'>, '_id' | '_creationTime'>

export const retentionObligation = {
  obligationRef: 'obligation:retention', callRef: 'call:retention', toolRef: 'tool:retention', providerRef: 'provider:retention',
  buyerAccountRef: 'account:retention', buyerAsset: 'AUD', buyerExponent: 6, buyerAmountUnits: '10000',
  providerAsset: 'USDC', providerExponent: 6, providerAmountUnits: '5000', settlementMethod: 'managed_x402',
  state: 'settled', payoutEligibility: 'ineligible_x402', evidenceRefs: ['evidence:settled'],
  settlementTransactionRef: 'settlement:retention', createdAt: 100, updatedAt: 1000,
} satisfies Omit<Doc<'moneyProviderObligations'>, '_id' | '_creationTime'>

export const retentionBooking = {
  callRef: 'call:retention', quoteRef: 'quote:retention', idempotencyKey: 'original-key', accountRef: 'account:retention',
  principalRef: 'principal:retention', agentBudgetGeneration: 1, legalCustomerRef: 'customer:retention', legalCustomerGeneration: 1,
  treasuryRef: 'treasury:retention', treasuryGeneration: 1, toolRef: 'tool:retention', providerRef: 'provider:retention',
  authorityGeneration: 1, policyGeneration: 1, buyerAmountUnits: '10000', buyerRevenueUnits: '9000', buyerTaxUnits: '1000',
  providerAmountUnits: '5000', quoteDigest: 'sha256:quote', inputDigest: 'sha256:input', policyDigest: 'sha256:policy',
  rateEvidenceDigest: 'sha256:rate', treasuryEvidenceDigest: 'sha256:treasury', x402RequirementDigest: 'sha256:x402',
}

export const retentionAttempt = {
  dispatchRef: 'call:retention', attemptRef: 'attempt:retention', effectGeneration: 1, toolRef: 'tool:retention',
  inputDigest: 'sha256:input', paymentIdentifier: 'payment:retention', operationKeyDigest: 'sha256:key',
  challengeDigest: 'sha256:challenge', challengeJson: '{"private":"challenge"}',
  selectedRequirementJson: '{"private":"requirement"}', providerEndpoint: 'https://provider.test?private=input',
  credentialRef: 'credential:retention', scheme: 'exact', network: 'eip155:8453', asset: 'USDC', payTo: 'payee:retention',
  amountUnits: '5000', currency: 'USDC', exponent: 6, custodyRef: 'custody:retention', authorizationDigest: 'sha256:authorization',
  state: 'observed', preparedAt: 100, observedAt: 1000, settlementStatus: 'settled',
  quarantinedOutputJson: '{"private":"response"}', quarantinedResponseDigest: 'sha256:response', evidenceRefs: ['evidence:settled'],
} satisfies Omit<Doc<'moneyX402PaymentAttempts'>, '_id' | '_creationTime'>

export const retentionObservation = {
  ticketRef: 'ticket:retention', effectRef: 'effect:retention', commandId: 'command:retention', state: 'completed',
  journalTokenDigest: 'sha256:token', requestDigest: 'sha256:request', invocationDigest: 'sha256:invocation',
  operationKeyDigest: 'sha256:key', ticketClaimsDigest: 'sha256:claims', callRef: 'call:retention', toolRef: 'tool:retention',
  attemptRef: 'attempt:retention', effectGeneration: 1, leaseRef: 'lease:retention', connectionRef: 'connection:retention',
  authorityGeneration: 1, providerRef: 'provider:retention', adapterId: 'x402', authorityDigest: 'sha256:authority',
  grantedScopes: [], grantedResources: [], readinessValidUntil: 2000, owningAccountRef: 'provider-account:retention',
  activeAccountRef: 'account:retention', actorPrincipalRef: 'principal:retention', grantRef: 'grant:retention', grantGeneration: 1,
  secretRef: 'secret:provider', secretGeneration: '1', secretPointerRevision: 1, signingSecretRef: 'secret:signing',
  signingSecretGeneration: '1', signingSecretPointerRevision: 1, signingAccountRef: 'account:retention',
  issuedAt: 100, expiresAt: 200, observationJson: '{"private":"observation"}', observationDigest: 'sha256:observation',
  completedAt: 1000, updatedAt: 1000,
} satisfies Omit<Doc<'providerConsequenceJournal'>, '_id' | '_creationTime'>
