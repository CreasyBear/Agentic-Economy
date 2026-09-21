import type { AeSiteUtilityDocumentSection } from '@/components/ae/website/utility-document.contracts'

// Source: `git log -1 --format=%cs -- src/routes/terms.tsx` in the marketing repo returned 2026-09-07.
export const termsLastUpdated = '7 September 2026'
export const termsTitle = 'Terms of service.'
export const termsDescription = 'The framework for buying, delivering and paying for work through Agentic Economy.'
export const termsIntro = 'These terms set out the responsibilities of Agentic Economy, customers and providers. Service-specific provisions apply when you use the relevant service.'
export const termsAvailabilityLead = 'Current availability is described on our'
export const termsAvailabilityLink = 'status page'
export const termsClosingLead = 'Read alongside our'
export const termsClosingLink = 'privacy policy'

export const termsSections = [
  {
    id: 'agreement',
    heading: 'Scope and agreement',
    body: [
      'These terms govern Agentic Economy’s website and platform: business accounts, agent access, service discovery, prepaid AUD credit, paid requests, usage records and provider services. ‘AE’, ‘we’ and ‘us’ mean Agentic Economy. The service agreement identifies the legal entity supplying your services. ‘Customer’ means the individual or organisation purchasing access or services; an authorised agent acts for that customer.',
      'Visiting this website does not open an account or authorise a purchase. The platform provisions apply when the customer accepts these terms during onboarding or signs an order form. Features become available only as expressly offered; examples and roadmaps are not commitments to deliver a particular feature or integration.',
      'An accepted order form may specify the services, commercial arrangements and expressly agreed departures from these terms. A data-processing agreement governs conflicting provisions concerning customer personal information. Mandatory legal rights prevail over every document. Third-party conditions apply only where disclosed and agreed before the relevant purchase.',
    ],
  },
  {
    id: 'accounts',
    heading: 'Eligibility and account control',
    body: [
      'An account must be established by an adult with authority to bind the customer. Keep business, billing and authorised-user information accurate. The customer appoints administrators, assigns permissions and removes access when a person or agent no longer requires it. AE may request information reasonably necessary to verify authority, prevent fraud or meet applicable legal obligations.',
      'Protect credentials and secrets, use available access controls, and promptly report suspected compromise through the support channel provided at onboarding. Each party is responsible for failures within its control. Use of a credential is evidence to investigate, not conclusive proof that every transaction was authorised. AE remains responsible for its own breaches and control failures.',
    ],
  },
  {
    id: 'agents',
    heading: 'Agent authority and spending controls',
    body: [
      'The customer decides what work an agent may perform, which services it may use and how much it may spend. Adding credit does not grant an agent spending authority. Authorisation must come from the customer’s configured permissions or other expressly agreed Spending policy. The customer is responsible for configuring the Spending policy for its workflow and deciding the level of oversight its work requires.',
      'AE will apply the spending controls it has agreed to enforce. The control settings describe their scope, units, reset periods and treatment of reserved or concurrent spending. A budget is not a guarantee of output quality or a substitute for restrictions on the agent’s behaviour outside AE.',
      'Customers may revoke credentials or change permissions using the available controls. Revocation prevents new authorisations once effective in the service; it may not cancel requests already authorised or obligations already incurred. AE will identify that boundary and provide a way to report a control failure. Disputed or unauthorised charges are assessed on the evidence, including AE’s compliance with the Spending policy.',
    ],
  },
  {
    id: 'services',
    heading: 'Discovery, providers and purchases',
    body: [
      'Discovery records, including x402 Bazaar metadata, describe services that may be available in the ecosystem. A listing alone does not establish compatibility, verification, endorsement or availability through AE. Before a paid request, the service offer identifies the supplying party, AE’s role, the service description, price or pricing basis, relevant data handling and material restrictions.',
      'AE may supply a service itself, resell a provider’s service or facilitate a direct purchase, as stated in the applicable offer. Where AE is the seller, AE remains accountable for its supply obligations. Where a provider contracts directly with the customer, the disclosed provider terms govern that supply without removing AE’s responsibility for its own service.',
      'A request may involve separate authorisation, payment, execution and delivery stages. A payment record does not by itself prove successful delivery, and an output does not by itself establish final payment status. Usage records must distinguish those facts. Customers should consult request status before retrying an uncertain purchase.',
    ],
  },
  {
    id: 'credit',
    heading: 'AUD credit and funding',
    body: [
      'Customers can use the funding methods offered on their account to prepay in Australian dollars for eligible services. The funding offer states who receives the funds, what the Credit represents, when it becomes available and any restrictions. AUD Credit is separate from the settlement technology used for an individual provider request.',
      'The funding offer sets out the legal nature of the Credit, the entity receiving funds and any applicable safeguarding arrangements and regulatory disclosures. AE will obtain and maintain the authorisations required for the activities it supplies.',
      'The accepted funding schedule sets out funding methods, minimum amounts, fees, expiry if any, transferability, refund eligibility and handling on closure. No undisclosed expiry, forfeiture or conversion fee applies. Promotional Credit is identified separately from purchased Credit. AE will disclose any different conditions before the promotion is accepted.',
      'A funding reversal, fraud concern or chargeback may require a proportionate hold on the affected amount while investigated. AE will explain the reason where legally permitted, avoid freezing unrelated funds unnecessarily, and reconcile the Credit. Customers retain their rights to dispute payment errors through lawful channels.',
    ],
  },
  {
    id: 'pricing',
    heading: 'Prices, fees, tax and records',
    body: [
      'The offer or agreed pricing schedule discloses provider charges, AE fees or markups, applicable GST treatment, currency conversion and any network costs passed to the customer. Variable-price requests require an agreed pricing basis and any spending ceiling. Customers are not bound by a price increase applied retrospectively to an accepted request.',
      'The account record distinguishes purchased Credit, promotional Credit, reservations, final charges, adjustments and refunds. Reservations are not final charges. AE will provide the transaction records and invoices or receipts appropriate to its role and applicable law. Customers remain responsible for their own tax treatment and accounting decisions.',
      'Subscription, renewal, minimum-spend or enterprise commitments apply only when separately disclosed and accepted. Any automatic renewal must identify its timing, price basis and cancellation mechanism before acceptance.',
    ],
  },
  {
    id: 'remedies',
    heading: 'Failed requests, disputes and refunds',
    body: [
      'Report an incorrect, duplicate, unauthorised or undelivered charge with the request identifier and available evidence, without including secrets. AE will investigate the authorisation, payment and delivery records and explain the outcome. A provider’s refusal to refund does not resolve AE’s own obligations to the customer.',
      'If a request was not chargeable under the agreed offer, AE will correct the account. Where payment occurred but delivery remains uncertain, AE will reconcile status before representing the work as complete or encouraging a paid retry. A retry that could create a fresh charge needs an existing Spending policy covering that charge or further authorisation.',
      'The appropriate remedy may include completion, re-performance, a price reduction, reversal, refund or compensation, depending on the failure, applicable terms and law. A Credit adjustment must not replace a monetary refund where the customer is entitled to one. Support procedures and response targets are provided at onboarding and do not limit statutory rights.',
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
      'Customers retain their rights in their inputs and existing materials. They grant AE the limited permissions necessary to deliver the agreed service, secure it, maintain required records and handle support or disputes. AE will not use customer content to train general-purpose models or sell that content under this permission. Any separate use requires an express, informed agreement.',
      'The privacy policy governs AE’s handling of personal information. Where AE processes personal information on a customer’s behalf, the parties must agree the applicable processing instructions, security measures, subprocessors, transfers, assistance and deletion arrangements. Selecting a provider may involve disclosure to that provider under the terms presented before purchase.',
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
      'Providers require an accepted provider agreement before selling through AE. That agreement identifies the seller of record, onboarding requirements, service specifications, data responsibilities, pricing, tax, settlement, payout timing, refund allocation and any reserves or deductions. A discovery listing does not create a payout entitlement.',
      'Providers must accurately describe their service, maintain the rights needed to supply it, disclose material dependencies and changes, and honour accepted purchases. They must handle customer data only as authorised and cooperate with delivery, security and billing investigations. AE may remove misleading or unsafe listings proportionately, with notice and review where practicable.',
      'The provider agreement allocates responsibility for failed work and third-party claims. Providers are responsible for their supply obligations; AE remains responsible for its own obligations.',
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
      'Customers may request closure using the published account or support process, subject to separately accepted commitments. Closure stops new use but does not erase unresolved transactions. AE will reconcile charges and purchased Credit under the accepted refund schedule and law, and provide a reasonable opportunity to retrieve available customer records where lawful.',
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
