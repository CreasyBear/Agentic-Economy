# First-dollar compliance counsel pack — Australia

**Status:** pre-counsel operating gate
**Evidence date:** 2026-08-01
**Decision:** live charge, payout and marketplace-fee activation remain refused until the questions below are accepted by the founder with Australian legal/accounting advice and the resulting contracts are executable.

This is a decision pack, not legal or tax advice. It separates current source facts, conservative operating decisions, primary-source grounds and questions that AE must not answer by inference.

## Current source facts

- AE has a Stripe-backed credit/ledger implementation and development/sandbox payment paths, but the public top-up component refuses when Stripe readiness is absent.
- Provider payout orchestration is not complete. A ledger entry is not evidence that money reached a provider.
- WorkTree/Action Invocation can bind an authorization to an exact amount, currency, provider, action/version, expiry and idempotency identity. Hosted and real-payment evidence remain separate gates.
- Public terms currently describe finding, comparison and first contact. They do not establish AE's legal role in a paid provider transaction.
- Public privacy copy describes selected disclosures, but does not yet constitute the complete operational access, correction, complaint, deletion/de-identification and retention procedure required before the live-money gate can open.

## Primary-source grounds

1. **GST registration.** The ATO says a business generally must register when current or projected GST turnover reaches A$75,000 and must do so within 21 days once required. Voluntary registration below the threshold is possible. Source: [ATO — Registering for GST](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst).
2. **Platform role and GST cannot be inferred from product labels.** The ATO's electronic-distribution-platform guidance turns on the actual controls and agreements: authorising the charge or delivery, setting transaction terms, identifying the merchant as supplier and written allocation can change responsibility. Source: [ATO — If you are an electronic distribution platform operator](https://www.ato.gov.au/businesses-and-organisations/international-tax-for-business/gst-for-non-resident-businesses/how-to-charge-gst/if-you-are-an-edp-operator).
3. **Sharing Economy Reporting Regime.** The ATO says EDP operators may have reporting obligations where Australian-connected supplier payments flow through the platform. Task-based services are included; operator/supplier and transaction fields include identity, bank identifiers, payments, GST, fees and commissions. Reporting is twice yearly. Sources: [ATO — What is the SERR?](https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/third-party-reporting/sharing-economy-reporting-regime/what-is-the-serr), [Who needs to report](https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/third-party-reporting/sharing-economy-reporting-regime/who-needs-to-report-under-the-serr), [Required report fields](https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/third-party-reporting/sharing-economy-reporting-regime/how-and-when-to-report-under-the-serr/what-you-need-to-include-in-your-serr-report).
4. **Invoices and records.** The supplier generally issues the tax invoice; recipient-created tax invoices require the statutory conditions and written agreement. Electronic business records must remain retrievable and are generally retained for five years. Sources: [ATO — Recipient created tax invoice determination](https://www.ato.gov.au/law/view/pdf?DocId=ESO%2FESLI202320%2F00001&PiT=99991231235958&filename=law%2Fview%2Fpdf%2Fesg%2Fesli2023-020.pdf), [ATO TR 2018/2 — electronic records](https://www.ato.gov.au/law/view/document?LocID=%22TXR%2FTR20182%2FNAT%2FATO%2Ffp7%22&PiT=99991231235958).
5. **Consumer-facing price and platform conduct.** ACCC platform guidance requires important terms and total calculable prices to be clear and prominent; platform operators need complaint/dispute processes and must avoid misleading representations about price, role or performance. Source: [ACCC — Platform operators in the sharing economy](https://www.accc.gov.au/system/files/Platform%20Operators%20in%20the%20Sharing%20Economy%20.pdf).
6. **Privacy operations.** APP 1 requires reasonable practices, an up-to-date privacy policy and a complaint mechanism. APP 11 requires reasonable security and destruction/de-identification when information is no longer needed, subject to legal retention. APP 12 and APP 13 require access and correction procedures, identity checks proportionate to risk, written refusal reasons and complaint mechanisms. Sources: [OAIC — Australian Privacy Principles](https://www.oaic.gov.au/privacy/australian-privacy-principles/read-the-australian-privacy-principles), [APP 12 access](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-12-app-12-access-to-personal-information), [APP 13 correction](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-13-app-13-correction-of-personal-information).

## Conservative operating decisions now

1. **No live marketplace charge or payout.** The admission boundary returns a no-charge refusal unless the accepted role/tax/privacy gate and live Stripe/Connect reconciliation configuration are all present.
2. **No fixed fee/share promise.** UI may say that any fee and total charge will be shown before approval; it must not promise 5%, provider proceeds or tax treatment before the commercial and tax allocation is accepted.
3. **Exact authorization only.** A future paid Lock must bind amount, currency, provider, action/version, data release, expiry and idempotency key. Any widening requires a fresh per-item approval. A balance reservation, provider call, settlement, refund and payout are distinct receipts.
4. **No inferred supplier or agent role.** Product copy and receipts identify the actual provider and AE's observed operation without declaring agency, merchant-of-record, supplier or tax liability until contracts and advice settle that role.
5. **Signed pilots may proceed without AE moving money.** A signed commercial pilot is retained as its own evidence class. Customer/provider payment outside AE does not count as AE settled-payment evidence.
6. **Evidence retention beats silent deletion.** Privacy deletion requests must remove or de-identify data no longer needed while preserving access-controlled tax, security, dispute and authority evidence for an accepted legal retention period. Every disposition is attributable and rereadable.

## Founder decisions requiring advice before activation

- Is AE the supplier, disclosed agent, marketplace/EDP operator, payment collection agent, or another role for each transaction family?
- Who contracts with the customer for the provider service, and who owns consumer-guarantee remedies, refunds, chargebacks, disputes and provider non-performance?
- Is AE registered or required to register for GST; which amounts are AE taxable supplies; who issues the customer tax invoice and provider settlement statement; is an RCTI arrangement appropriate?
- Does the planned Australian task-service flow create SERR reporting obligations, and which identity/payment fields must be collected before the first reportable transaction?
- May the proposed percentage fee be charged as a customer fee, provider commission or both; how must the total price and GST be displayed?
- What Stripe Connect account/flow and custody language match the accepted role, and what reconciliation evidence is required before a payout is final?
- Which records have five-year or longer retention duties, and how are APP access, correction, complaint and deletion/de-identification requests reconciled with those duties?
- Which privacy entities, overseas recipients/subprocessors and breach-response contacts must appear in the policy and collection notices?

## Counsel/accountant sign-off record

| Decision | Named adviser | Date | Accepted artifact/reference | Source/config change | Status |
| --- | --- | --- | --- | --- | --- |
| Transaction and agency role | — | — | — | — | open |
| GST registration/supply allocation/invoicing | — | — | — | — | open |
| SERR classification/reporting | — | — | — | — | open |
| Refund/dispute/chargeback responsibility | — | — | — | — | open |
| Privacy policy, notices, rights and retention | — | — | — | — | open |
| Stripe Connect flow and payout reconciliation | — | — | — | — | open |

## Gate result

**LIVE MONEY: REFUSED.** The safe T52 end condition is selected. The BAS external gate may count signed paid pilots separately, but it may not claim an AE-settled payment until every open sign-off row is accepted and the corresponding executable human/agent transition has passed exact-amount charge, retry, refund, provider-failure, invoice/readback and reconciliation checks.
