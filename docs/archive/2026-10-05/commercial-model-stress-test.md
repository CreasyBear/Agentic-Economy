> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../README.md) for its successor and remaining limits.

# Commercial model stress test (30 September 2026)

Companion to `docs/operating-model.md`. The model under test: **aecon acquires the result of a third-party x402 Tool and delivers it to the user**, charged against prepaid AUD credits. aecon is principal; sellers are its suppliers.

## 1. Where this model sits
| Model | Example | Who is the supplier to the user | Needs seller contracts? | Fit for aecon now |
|---|---|---|---|---|
| **Reseller / principal** | OpenRouter (contracting provider, list-price pass-through, a fee on credit purchases of 5.5% Standard / 8% Business, output quality disclaimed, provider terms flow down) ([terms](https://openrouter.ai/terms), [pricing](https://openrouter.ai/pricing)); an AWS authorised reseller (seller of record) | aecon | No | **Yes.** The only model compatible with directory-first, where x402 sellers don't know aecon |
| Marketplace / agent | RapidAPI (25% fee, pays providers out via PayPal), AWS Marketplace (the provider is seller of record; AWS is payment agent) ([RapidAPI](https://rapidapi.com/page/terms), [AWS](https://aws.amazon.com/legal/seller-terms/)) | The seller | Yes, a written agreement plus payouts | No: needs seller onboarding, and becomes payments activity |
| Hybrid | Amazon 1P plus 3P | Both | For the 3P lane | **Later**, once partner sellers or aecon's own services exist |

**Judgement:** principal is not a compromise. It is the model that makes the x402 directory sellable to anyone with a card and no crypto, and that is aecon's reason to exist. It also removes seller credit risk: aecon never prepays a seller, it pays per Call after the request.

## 2. What principal costs you (say it out loud)
1. **Consumer guarantees attach to aecon** and cannot be disclaimed. ACL "consumer" covers purchases up to A$100,000 whatever the purpose, so developers and agent operators buying small amounts are usually consumers too. "Execution and delivery, not authorship" is a fair *definition of the service*, but not an exemption ([ACCC](https://www.accc.gov.au/business/selling-products-and-services/consumer-rights-and-guarantees)). Due care covers routing to the chosen Tool, paying correctly and delivering faithfully. Fitness for purpose covers purposes aecon makes known or advertises, so never advertise outcomes aecon doesn't control.
2. **Output rights.** Some APIs forbid resale of their output (e.g. [Google API terms §§4-5](https://developers.google.com/terms)). x402 sellers offer pay-per-call to any agent, so resale is the norm in this ecosystem, but not guaranteed. Use OpenRouter's pattern: users comply with the Tool's own terms, plus a takedown and delisting process.
3. **aecon distributes whatever sellers return.** That includes harmful, illegal or regulated content (financial advice, medical, gambling, adult). This needs a prohibited-use policy, category filters in production ranking, and delisting on complaint.
4. **GST on the whole price to Australian customers** (principal supply). Division 84's platform deeming is only a backstop if the substance became sellers supplying users through aecon ([ATO LCR 2018/2](https://www.ato.gov.au/law/view/document?DocID=COG/LCR20182/NAT/ATO/00001)).
5. **International users bring tax obligations from the first sale.** UK consumers: VAT registration with no threshold for non-established suppliers. EU consumers: VAT where the consumer lives, through the non-Union OSS. Business buyers in both: reverse charge ([EU](https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/place-taxation_en), [HMRC](https://www.gov.uk/guidance/vat-place-of-supply-of-services-notice-741a)).

## 3. Stress scenarios
| Scenario | What happens under principal | Guard |
|---|---|---|
| The seller returns a wrong or empty answer (paid 200) | Credits are drawn (commercial rule). A consumer may still be owed a remedy for a clear failure | **"Report this answer" gives the Call's credits back.** It costs cents, is rate-limited per user, and penalises the seller's ranking. Cheap trust and ACL-safe |
| The seller errors after settlement | aecon paid USDC; the buyer is not charged; the loss is written off; the seller is demoted | Built into the paid-200 rule |
| The seller disappears | No exposure: pay-per-call, no prepayment | None needed; the index delists it |
| The seller's terms forbid resale | Complaint or takedown | Delisting process; flow-down clause |
| The output is harmful or regulated | aecon is the distributor | Category filters, prohibited-use policy, report button, delisting |
| The user disputes a card top-up | Credits may already be spent | Keep usage evidence (request, response bytes, settlement tx); Radar; new-account caps |
| aecon itself fails | User credits are unsecured claims | Keep balances small in alpha and beta; disclose; refund of unused purchased credit on closure |
| An EU or UK consumer signs up | A VAT obligation from the first sale | Beta: Australian consumers plus business buyers worldwide (reverse charge), or register with OSS and HMRC |
| Coinbase ships the consumer version itself | Competition from the directory owner | Differentiate: **no wallet needed** (card to AUD credits), ranking on aecon's own delivery evidence across directories, the trust centre, compliance (sanctions, AUSTRAC posture) |

## 4. Pricing: the decision principal forces
- **OpenRouter pattern (recommended):**
  - Tool prices are passed through at the seller's list price, converted to AUD at the reference rate.
  - aecon takes a **fee when credits are added**, which covers card fees, FX drift and a margin. OpenRouter charges 5.5%.
  - Familiar and transparent: "you pay what the Tool charges; we charge X% on top-ups".
- **Model cost split:**
  - Agents calling search, describe and call through the API/MCP cost aecon almost nothing in model tokens.
  - Consumer chat spends model tokens on every turn. Treat chat as the showcase and acquisition cost now. Price it later, e.g. a small per-answer charge, only if the numbers demand it.
- GST (at top-up, default) applies to the whole top-up for Australian customers, because aecon supplies both the pass-through and the fee as principal.

## 5. How the model evolves
1. **Now:** principal over the open directory.
2. **Later:** a second, marketplace lane for sellers who sign with aecon: seller of record, payouts, their own support. This mirrors AWS's reseller and marketplace split. Only when there are real partner sellers.
3. **aecon's own services** sit on the principal lane.

## Decisions (Joel, 30 September 2026)
1. The top-up fee matches OpenRouter: 5.5%. Tool prices pass through at list price.
2. "Report this answer" refunds are on, with a daily limit per user.
3. Beta: Australian consumers plus Australian businesses.
4. Category filters: none at launch; unlawful content is removed on complaint.
5. Chat is acquisition and showcase, and a potential sticky service line.
6. Evolution as described in section 5.
