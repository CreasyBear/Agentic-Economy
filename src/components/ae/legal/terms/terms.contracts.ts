import { LEGAL_ENTITY_LINE } from '@/components/ae/legal/legal-version'
import type { AeSiteUtilityDocumentSection } from '@/components/ae/website/utility-document.contracts'

// Terms for the invitation-only alpha.
export const termsLastUpdated = '11 October 2026'
export const termsTitle = 'Terms of service.'
export const termsDescription = 'Terms for the invitation-only alpha, promotional credits and Tool Calls through Agentic Economy.'
export const termsIntro = `These terms describe the invitation-only alpha and are made between the user and ${LEGAL_ENTITY_LINE}.`
export const termsAvailabilityLead = 'Website and API checks appear on our'
export const termsAvailabilityLink = 'status page'
export const termsClosingLead = 'Read alongside our'
export const termsClosingLink = 'privacy policy'

export const termsSections = [
  {
    id: 'agreement',
    heading: 'Scope and agreement',
    body: [
      `These terms cover Agentic Economy’s website and invitation-only alpha: accounts, Agent access, Tool discovery, promotional AUD credits, Calls and usage records. ‘AE’, ‘we’ and ‘us’ mean Agentic Economy. ‘Customer’ means the individual or organisation using the service; an authorised Agent acts for that Customer. These terms are made between the Customer and ${LEGAL_ENTITY_LINE}.`,
      'Visiting the website does not open an account or authorise a Call. The platform terms apply when the Customer accepts them during onboarding or signs an order form. Alpha access is by invitation. Features are available only as offered; examples and roadmaps are not promises of future features or integrations.',
      'An accepted order form may identify services and expressly agreed departures from these terms. A data-processing agreement governs conflicting provisions about Customer personal information. Mandatory legal rights prevail over every document. Third-party conditions apply only where disclosed and agreed before the relevant use.',
    ],
  },
  {
    id: 'accounts',
    heading: 'Eligibility and account control',
    body: [
      'An account must be established by an adult with authority to bind the customer. Keep business, billing and authorised-user information accurate. The customer appoints administrators, assigns permissions and removes access when a person or agent no longer requires it. AE may request information reasonably necessary to verify authority, prevent fraud or meet applicable legal obligations.',
      'Protect credentials and secrets, use available access controls, and promptly report suspected compromise through Support. Each party is responsible for failures within its control. Use of a credential is evidence to investigate, not conclusive proof that every transaction was authorised. AE remains responsible for its own breaches and control failures.',
    ],
  },
  {
    id: 'agents',
    heading: 'Agent authority and spending controls',
    body: [
      'The Customer decides what work an Agent may perform, which Tools it may use and how much it may spend. Adding Credit does not grant an Agent spending authority. Authorisation must come from the Customer’s configured permissions or other expressly agreed Spending policy. The Customer is responsible for configuring the Spending policy for its workflow and deciding the level of oversight its work requires.',
      'AE will apply the spending controls it has agreed to enforce. The control settings describe their scope, units, reset periods and treatment of reserved or concurrent spending. A budget is not a guarantee of output quality or a substitute for restrictions on the agent’s behaviour outside AE.',
      'Customers may revoke credentials or change permissions using the available controls. Revocation prevents new authorisations once effective in the service; it may not cancel requests already authorised or obligations already incurred. AE will identify that boundary and provide a way to report a control failure. Disputed or unauthorised charges are assessed on the evidence, including AE’s compliance with the Spending policy.',
    ],
  },
  {
    id: 'services',
    heading: 'Discovery, providers and purchases',
    body: [
      'AE supplies its routing service to the Customer as principal. Independent Tool Providers supply services to AE. AE pays them from its own float to deliver that service; it does not buy or pay on the Customer’s behalf or hold cryptocurrency for the Customer. AE remains responsible for its own supply obligations.',
      'Discovery records, including directory and Provider metadata, describe Tools that may be available. A listing alone does not establish compatibility, verification, endorsement or availability through AE. Tool information shows the available Provider or endpoint identity, description, price and declared restrictions. A domain or payment address is not verification of the Provider’s legal identity or data practices. AE does not independently verify every Provider or output.',
      'Authorisation, payment, execution and delivery are separate facts. A payment record does not prove that an answer is accurate, useful or suitable for the Customer’s purpose. Usage records distinguish payment from delivery and purchase status. Check the Call’s status before retrying an uncertain purchase.',
    ],
  },
  {
    id: 'credit',
    heading: 'AUD credit and funding',
    body: [
      'The alpha does not offer card purchases or paid top-ups. Invited Customers may receive an A$10 promotional credit grant where offered. The grant states its amount and expiry. The account shows promotional credits separately from any purchased credits.',
      'Promotional credits are used first. They can be used only for eligible AE services, have no cash value and cannot be transferred or refunded, except where applicable law requires otherwise. They expire on the date shown with the grant. Adding credits does not give an Agent spending authority.',
      'A reservation sets aside credits for an accepted Call and is not a final charge. Released reservations and restorations return credits to their original sources under the applicable grant or funding conditions. They do not renew a promotional grant or make expired promotional credits spendable again.',
      'Any future credit purchase, funding fee or other funding arrangement requires a separately disclosed offer before acceptance. No undisclosed expiry, forfeiture or conversion fee applies. A funding reversal, fraud concern or chargeback may justify a proportionate hold on the affected amount while investigated; AE will explain where legally permitted, avoid unnecessarily freezing unrelated funds and reconcile the account. Lawful payment-dispute rights remain available.',
    ],
  },
  {
    id: 'pricing',
    heading: 'Prices, fees, tax and records',
    body: [
      'The AUD price is shown before the Customer or authorised Agent accepts a Call. Any applicable fees, markup, tax and network costs passed to the Customer must be disclosed before acceptance. Variable prices need an agreed pricing basis and ceiling. A price change before acceptance requires a new price; it does not silently increase an accepted Call.',
      'AE reserves the displayed AUD amount, then draws it only after verified settlement and a successful HTTP response in the 2xx range. This draw can occur even if the returned output is unhelpful or unreadable: a 2xx response does not establish its quality. Reporting and other remedies remain available as described below and under applicable law.',
      'Known non-2xx responses and known failures to receive a response are not charged to the Customer, even where AE has paid a Provider. An ambiguous payment or response remains pending for reconciliation; it is not treated as a completed charge or a proven failure. The reserved amount may remain held while AE resolves that uncertainty.',
      'Account records distinguish promotional and purchased credits, reservations, final draws, adjustments and refunds. AE provides the records and receipts appropriate to its role and applicable law. Customers remain responsible for their own tax treatment and accounting decisions. Subscriptions, renewals or minimum-spend commitments apply only if separately disclosed and accepted, including their cancellation arrangements.',
    ],
  },
  {
    id: 'remedies',
    heading: 'Failed requests, disputes and refunds',
    body: [
      'For eligible completed and settled answers, “Report this answer” offers limited self-service credit restoration, at most once per Call. The action shows the actual allowance available to the user. The daily allowance resets at midnight UTC. These limits apply to this self-service route, not to rights or remedies under applicable law.',
      'A restoration returns the Call’s original credit sources, subject to their original conditions. It does not revive expired promotional credits or extend their expiry. A credit adjustment cannot replace a monetary refund where the Customer is legally entitled to one.',
      'If the action is missing, the output is invalid, or the issue concerns another dispute, contact Support with the Call reference and available evidence. Do not include secrets. Incorrect, duplicate, unauthorised or undelivered charges can also be raised there. AE will investigate the authorisation, payment and delivery records and explain the outcome; a Provider’s refusal to refund does not resolve AE’s own obligations.',
      'AE will correct a Call that was not chargeable under its agreed terms. If payment or delivery is uncertain, AE will reconcile the status before representing the work as complete or encouraging a fresh paid retry. A fresh charge needs authority under the Spending policy or further authorisation. Depending on the circumstances and applicable law, remedies may include completion, re-performance, a price reduction, reversal, refund or compensation. Support procedures do not limit statutory rights.',
    ],
  },
  {
    id: 'use',
    heading: 'Acceptable use and compliance',
    body: [
      'Use AE only for lawful purposes and within the authority granted by the customer and relevant rights holders. Do not steal credentials, evade agreed controls, interfere with services, distribute malicious code, commit fraud, infringe intellectual property or privacy, or facilitate unlawful conduct. Security research requires an authorised scope.',
      'Customers are responsible for the rights and permissions needed for their inputs, instructions and use of outputs, including any professional, industry or regulatory obligations applying to their business. Service-specific requirements are set out in the applicable offer or agreement.',
      'Each party must comply with laws applying to its activities, including applicable privacy, consumer, financial-services, sanctions and financial-crime obligations. AE may apply verification or transaction restrictions where justified by those obligations.',
    ],
  },
  {
    id: 'data',
    heading: 'Customer data and confidentiality',
    body: [
      'Customers retain their rights in their inputs and existing materials. They grant AE the limited permissions needed to supply the agreed service, secure it, maintain required records and handle Support or disputes. This permission does not allow AE to sell Customer content or use it to train general-purpose models; any separate use requires an express, informed agreement.',
      'Requesting a price or preparing a Quote can send the actual proposed inputs to the selected Tool Provider before payment or before a final Quote exists. Chat also sends text and relevant context to model services used to generate answers or find Tools. Payment is not the first point at which information may leave the account. Review the recipient and data-handling information before submitting inputs, including confidential or personal information.',
      'The privacy policy describes AE’s handling of personal information, service providers and overseas disclosures. Tool declarations may not specify a Provider’s retention, training practices or processing countries. Do not assume these match AE’s practices. If a use requires particular processing or confidentiality terms, confirm an appropriate agreement before sending that information.',
      'Each party must protect the other’s non-public business information with reasonable care, use it only for the agreed relationship and limit access to people or service providers who need it and are bound to protect it. This does not restrict information already lawfully public, independently developed or lawfully received elsewhere. Required legal disclosures should be limited and notified where permitted.',
    ],
  },
  {
    id: 'ip',
    heading: 'Intellectual property and outputs',
    body: [
      'AE and its licensors retain rights in the platform, website and their existing materials. Customers receive the access rights needed to use the purchased service for the agreed purposes. No transfer of platform ownership is implied.',
      'Rights in purchased outputs depend on the service offer and upstream rights. The offer discloses material licence restrictions, attribution requirements and permitted commercial use. AE cannot promise exclusivity, copyright protection or rights that the Provider does not possess. Customers must assess outputs before relying on or distributing them, particularly where accuracy or third-party rights matter.',
      'Feedback may be used to improve the service without disclosing customer confidential information. Submitting feedback does not transfer ownership of unrelated customer technology, content or business methods.',
    ],
  },
  {
    id: 'providers',
    heading: 'Publishing and supplying services',
    body: [
      'Independently operated Tools may be discovered through an external directory; a listing does not establish that the Provider has signed an AE publishing agreement or has a payout entitlement. Providers publishing through AE require an accepted Provider agreement. That agreement sets out service specifications, data responsibilities, pricing, tax, settlement, payout timing, refund allocation and any reserves or deductions.',
      'Providers publishing through AE must accurately describe their services, hold the rights needed to supply them, disclose material dependencies and changes, and honour accepted purchases. They must handle Customer data only as authorised and cooperate with delivery, security and billing investigations. AE may proportionately remove misleading or unsafe listings, with notice and review where practicable.',
      'Provider agreements allocate responsibility for failed work and third-party claims. Providers remain responsible for their own supply obligations; AE remains responsible for its obligations to the Customer.',
    ],
  },
  {
    id: 'availability',
    heading: 'Availability and changes',
    body: [
      'AE will exercise reasonable care and skill in supplying its agreed services. Providers, networks and settlement systems may experience disruption. AE will describe known material limitations and communicate significant incidents through the applicable support or status channel. Service levels, including any uptime or recovery-time guarantee, apply where expressly agreed.',
      'AE may improve or change services, but material changes to paid commitments require reasonable advance notice and a fair opportunity to stop future use or terminate an affected commitment. Urgent security or legal changes may take effect sooner, with explanation when practicable. Changes do not rewrite completed purchases or remove accrued rights.',
    ],
  },
  {
    id: 'termination',
    heading: 'Suspension and closure',
    body: [
      'AE may restrict access when reasonably necessary to address a material breach, security threat, suspected fraud or legal obligation. The action should be limited to the affected activity where practicable. AE will explain the reason and route to review unless doing so would be unlawful or undermine a legitimate investigation. Remediable breaches should receive a reasonable opportunity to be corrected.',
      'Customers may request closure using the published account or support process, subject to separately accepted commitments. Closure stops new use but does not erase open transactions. AE will reconcile reservations, draws and credits under their applicable conditions and law, and provide a reasonable opportunity to retrieve available customer records where lawful.',
      'Confidentiality, accrued payment obligations, intellectual-property rights, lawful record retention and provisions needed to resolve existing disputes survive closure. Suspension alone does not authorise automatic forfeiture of purchased Credit.',
    ],
  },
  {
    id: 'liability',
    heading: 'Responsibility and legal rights',
    body: [
      'Nothing in these terms excludes, restricts or modifies a right or remedy that cannot lawfully be excluded, including applicable Australian Consumer Law guarantees. Business customers may also have statutory protections. Customer review of an output does not release AE from its own obligations.',
      'Each party is responsible for loss to the extent caused by its breach, negligence or wrongful conduct, subject to applicable law and any valid, expressly agreed limitation. Each must take reasonable steps to reduce avoidable loss. These terms do not impose a blanket customer indemnity, mandatory arbitration or general waiver of claims.',
      'A negotiated liability cap, exclusion or indemnity applies only as expressly set out in the accepted agreement, including its exceptions, and only to the extent permitted by applicable law.',
    ],
  },
  {
    id: 'disputes',
    heading: 'Complaints, notices and governing law',
    body: [
      'A party should first notify the other of a dispute, the relevant facts and the outcome sought. The parties should attempt good-faith resolution through an authorised representative. This process does not prevent urgent relief, a regulatory complaint, a payment dispute or access to a court or tribunal where permitted by law.',
      'The service agreement identifies the contracting entity, notice details and any agreed governing law and jurisdiction. Nothing in that agreement removes mandatory rights or access to a competent court or tribunal under applicable law.',
      'AE will notify customers of material amendments and obtain acceptance where required; mere publication does not retrospectively change existing commitments. Invalid provisions are severed only to the extent permitted by law. Neither party may transfer obligations in a way that materially reduces the other’s rights without an appropriate agreement.',
    ],
  },
] as const satisfies ReadonlyArray<AeSiteUtilityDocumentSection>
