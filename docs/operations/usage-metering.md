# Usage metering operations

**Status:** implemented foundation; optional operations remain inactive

[PR #354](https://github.com/CreasyBear/Agentic-Economy/pull/354) incorporated the
metering implementation. [Deployment provenance](deployments.md) and the
[original implementation evidence](../archive/2026-10-05/operations/usage-metering-completion.md)
separate local/native fixtures from hosted acceptance.

## Authority and reporting contract

Tool → Quote → Call owns execution. Formance owns financial postings. Provider
measurements and external meter acknowledgements never confer charging authority.
Use exact integer quantities with a declared exponent and unit definition.
Keep buyer gross Charge, fee, refund and net use separate from Provider obligation
and settlement; retain occurrence, delivery, ledger, observation and close clocks.

A contract-declared service unit identifies its version, dimension, pointer,
quantity encoding and independent/subset semantics. Missing or invalid quantities
remain unknown. Never add a subset to its parent. Preserve original attempt and
source lineage; expired private content is not restored to produce a measurement.

Complete-period exports and frozen closes retain scope, source fingerprints,
coverage and correction lineage. Drift, missing evidence and oversized/unavailable
reads cannot produce partial totals labelled complete. Statements do not create
new tax-invoice or adjustment authority. Owner/credential access remains scoped.

## Operations requiring their own execution record

| Operation | Current state | Required evidence before calling it complete |
| --- | --- | --- |
| Historical measurement backfill | Not run | Explicitly invoke existing `migrations:backfillCallMeasurements` against the verified target; resumable 25-row batches preserve original timestamps and cause no Provider/payment/accounting effects. Verify scope, replay and completion. |
| Automatic monthly reporting | Inactive | Verify approved policy, source coverage, existing workload admission, duplicate/held/incomplete close behavior and owner delivery in the target environment. |
| Hosted large-period exports | Source/native fixtures passed | Demonstrate complete pagination, drift/restart, exact totals and tenant denial against the actual hosted volume. |
| Financial-evidence archive operation | Scoped exact-version production proof exists | Record real document versions, readback, retention and recovery; implementation does not establish continuous export. |
| External meter shadow integration | Disabled and disconnected | Resolve procurement, precision, correction, retention and environment qualification before connection. SDK ACK is neither complete coverage nor financial authority. |

Forecasts expose coverage; opt-in alerts retain policy revision, bounded delivery
and history. The existing alert source has a 10,000-entry refusal boundary;
source drift may require a quiet interval. Do not turn an unavailable period into
zero usage or a partial forecast. No subscription, unit-rated tariff, postpaid
product or new charging lane is implied.
