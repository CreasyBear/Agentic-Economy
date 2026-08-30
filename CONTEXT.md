# Agentic Economy

A cross-harness Operation market: agents discover, compare, and buy one bounded outside contribution, then continue in their own harness.

## Language

**Operation**:
The exact callable contribution one supplier offers: contract, price, access, effects, and evidence.
_Avoid_: listing, capability, service, product

**Invocation**:
One use of one Operation by one caller under delegated authority.
_Avoid_: request, job, run, execution

**Charge**:
The ledger event that bills the caller for one Invocation.
_Avoid_: payment, invoice, debit

**Charge Journal**:
The durable Charge together with its usage row and the three or four ledger entries that prove it.
_Avoid_: transaction log, charge record, billing snapshot

**Journal Digest**:
A content-addressed seal of a Charge Journal computed from the loaded journal rows.
_Avoid_: inputDigest, preparedMaterialDigest, commandDigest

**Charge identity**:
Facts already on durable Invocation and control rows after claim: Operation ref, input digest, attempt, grant, and authority decision.
_Avoid_: reserved Operation JSON, cloned authority proof

**Charge liveness**:
Facts that must be true at Charge time: offering still active, published price still matches, authority not expired, grant generation current, budget remaining, account CAS.
_Avoid_: billing digest, leased billing digest

**Refund**:
The ledger reversal of a Charge.
_Avoid_: chargeback, clawback

**Payout**:
The transfer of accrued provider earnings off the ledger.
_Avoid_: withdrawal, settlement (when meaning Stripe Connect transfer)

**Recovery**:
Caller-facing status, cancel, and reconcile of an Invocation.
_Avoid_: expire_authorization, sweep, expiry as Recovery modes

**Expiry sweep**:
Background x402 authorization expiry: observe the control plane and queue expiry. Not a Recovery mode.
_Avoid_: recover mode, OperationInvokeRecoveryPort

**Publication**:
The supplier act of admitting and sealing a callable Operation.
_Avoid_: listing, registry import
