import type { AeSiteUtilityDocumentSection } from '@/components/ae/website/utility-document.contracts'

// Source: `git log -1 --format=%cs -- src/routes/privacy.tsx` in the marketing repo returned 2026-09-13.
export const privacyLastUpdated = '13 September 2026'
export const privacyTitle = 'Privacy policy.'
export const privacyIntro = 'How Agentic Economy collects and uses data.'
export const privacyOpening = 'This policy sets out what information AE handles, why it is used, who receives it and how you can exercise your rights. It applies to the services you use, including our website.'
export const privacyTermsLead = 'Read alongside our'
export const privacyTermsLink = 'terms of service'
export const privacyOaicLead = 'Australian privacy information and complaints guidance are available from the'
export const privacyOaicLink = 'OAIC'
export const privacyCorrectionLink = 'Request a correction or removal'

export const privacySections = [
  {
    id: 'scope',
    heading: 'Who this policy covers',
    body: [
      'This policy governs how Agentic Economy (AE, we, us) handles personal information across our website and platform. It covers customers, authorised users, agents acting for businesses, providers and people whose information appears in requests.',
      'The website offers an enquiry form and an optional email waitlist. It has no public accounts or payment inputs. The account, payment and service-request provisions apply when you use those services.',
      'Agentic Economy may handle information for its own account administration, billing, security and legal purposes, and process Customer content on a business Customer’s instructions. The applicable agreement sets out those roles. A Provider may handle information independently or on instructions, depending on the Tool; the service offer explains that role before the Customer’s purchase.',
    ],
  },
  {
    id: 'collection',
    heading: 'Information collected and its sources',
    body: [
      'When you join the waitlist, Resend processes your email address and subscription status for AE. Submitting the form adds your address directly to the launch waitlist. We use this information for launch access and important product updates. You can unsubscribe through our update emails. Resend also processes delivery records.',
      'When you use the enquiry form, we receive your name, email address, subject and message to respond to your enquiry. Resend delivers the message to our Google Workspace mailbox. Sending an enquiry does not subscribe you to the waitlist.',
      'Website delivery may involve IP addresses, request URLs, timestamps, browser and device details, and security or error logs processed by hosting infrastructure.',
      'For platform accounts, AE collects business and administrator details, contact information, account roles, authentication records, permissions and support correspondence from customers and their authorised users. Verification information may come from the customer, payment or identity partners, or lawful public sources where needed for a specified purpose.',
      'Paid-service records may include funding references, Credit, prices, reservations, charges, refunds, invoices, provider identifiers, request status and settlement references. Payment partners may collect payment instrument or identity information directly. AE limits the payment information it receives to the purposes described in this policy.',
      'Service requests may contain prompts, files, instructions, personal information about other people and provider outputs. Agents and connected applications supply this material on the customer’s behalf. Technical records may include request identifiers, timing, errors and access events. Not every service needs every category; collection must be limited to what the selected service and agreed purposes require.',
    ],
  },
  {
    id: 'purposes',
    heading: 'Why information is used',
    body: [
      'AE uses information to establish and administer accounts, authenticate users and agents, apply permissions and spending controls, route and deliver requests, maintain usage records, reconcile payments, handle refunds, assist customers and providers, and investigate service failures.',
      'AE may also need information to protect the service, detect fraud and misuse, comply with applicable legal obligations, respond to lawful requests and establish or defend legal claims. A materially different use requires an appropriate legal basis and an updated notice or consent where required.',
      'For service improvement, AE uses aggregate or appropriately de-identified information where practicable. AE does not sell personal information or use customer prompts, files or outputs to train general-purpose models. Any optional use beyond service delivery requires a specific explanation and separate agreement.',
    ],
  },
  {
    id: 'requests',
    heading: 'Prompts, files and provider delivery',
    body: [
      'A Call can require Agentic Economy to forward relevant inputs to the selected Provider and return its output. The Customer should minimise personal information in prompts and files and have authority to disclose information about other people. An Agent’s ability to send data is not evidence of consent from every person named in it.',
      'The service offer identifies the provider, material data categories, purposes, locations where practicable and applicable retention or training conditions. Provider terms are provided before purchase. The service offer discloses any differences between the provider’s data practices and AE’s commitments, including whether the provider uses inputs or outputs for training.',
      'Operational storage may be needed for delivery, recovery, support or disputes. Any payload retention and replay capability must be disclosed with its purpose and retention period. AE will separate transaction records from full payloads so that accounting needs do not justify keeping the underlying content indefinitely.',
    ],
  },
  {
    id: 'sensitive',
    heading: 'Sensitive information and consequential uses',
    body: [
      'Sensitive information includes health information, identity documents and biometrics. AE will handle it with protections appropriate to its sensitivity and applicable law. Customers are responsible for the authority and consent required to submit it and for selecting a service suited to their requirements.',
      'The platform is intended for business use by authorised adults, not as a service directed to children. Information about children in customer content still requires appropriate authority and protection.',
    ],
  },
  {
    id: 'sharing',
    heading: 'Who receives information',
    body: [
      'Recipients may include selected service providers, hosting and infrastructure providers, payment and settlement partners, identity or fraud-prevention providers, support providers and professional advisers, limited to their relevant functions. Account administrators may see their organisation’s users, permissions, usage and billing records according to their roles.',
      'AE will distinguish providers acting on its instructions from independent recipients and disclose their functions, relevant locations and commitments governing customer content. Access is limited to authorised people and providers with an operational need.',
      'AE may disclose information where legally required or otherwise lawfully justified, including to regulators or courts. Requests should be assessed and disclosures limited to their lawful scope. A business transfer may involve necessary disclosures under confidentiality and appropriate protections; affected people must receive notice where required.',
    ],
  },
  {
    id: 'transfers',
    heading: 'Overseas processing and public networks',
    body: [
      'Some providers or infrastructure may process information outside Australia. AE will identify likely recipient countries where practicable, assess applicable overseas-disclosure obligations and apply suitable contractual and operational protections before disclosing information overseas. Processing is not restricted to Australia unless agreed for a particular service.',
      'If a request uses a public settlement network, transaction identifiers, addresses, amounts or timing may be visible to third parties and difficult or impossible to erase. AE will explain the settlement data flow for the service and keep prompts, files and direct personal identifiers off public ledgers. Account deletion cannot remove records from an independently operated public network.',
      'AE will use the transfer arrangements required by applicable law for the relevant locations and processing roles.',
    ],
  },
  {
    id: 'analytics',
    heading: 'Website measurement and local preferences',
    body: [
      import.meta.env.VITE_WEB_ANALYTICS
        ? 'This website uses Vercel Web Analytics to measure page visits, referral sources, approximate location, and browser and device types in aggregate. Vercel Speed Insights measures page loading, responsiveness and visual stability to help us improve website performance. These integrations do not use third-party tracking cookies. We remove query strings and fragments from measurement URLs and exclude the email confirmation page.'
        : 'Traffic analytics is disabled in this build. Vercel Web Analytics runs only on the production website.',
      ...(import.meta.env.VITE_GA4_MEASUREMENT_ID
        ? ['If you choose Allow analytics, we load Google Analytics 4 and allow its first-party analytics cookies for up to six months. We use page visits, engagement and successful enquiry or waitlist completion events to understand website use. Google advertising personalisation and Google Signals are disabled. We exclude confirmation-page views and remove query strings and fragments from the pageview URLs we send. You can decline analytics when asked, or withdraw permission later. We remember your choice locally for six months. Google processes analytics data on its infrastructure, which may be outside Australia.']
        : []),
      ...(import.meta.env.VITE_META_PIXEL_ID
        ? ['If you choose Allow analytics, we also load the Meta Pixel. Meta receives page visits and successful enquiry or waitlist completion event types so we can measure website outcomes from Facebook and Instagram activity. We do not send form names, email addresses, subjects, messages or other form contents to Meta. Meta may set first-party measurement cookies and process analytics data outside Australia.']
        : []),
      ...(import.meta.env.VITE_CLARITY_PROJECT_ID
        ? ['If you choose Allow analytics, we also load Microsoft Clarity to understand page interactions, performance and navigation through heatmaps and session recordings. Contact and waitlist forms are explicitly masked, and our custom success events contain only the action type—not names, email addresses, subjects, messages or other form contents. Clarity may set measurement cookies and process analytics data outside Australia.']
        : []),
      'The website does not send account, purchase, customer-content or form-value events to analytics. Avoid putting personal information or secrets into URLs or campaign tags. External sites have their own measurement practices. Browser preferences used for site appearance are separate from account or advertising tracking.',
      'AE will give notice of material changes to analytics or tracking, including the information collected, provider, purposes, retention and available choices. Marketing consent is separate from acceptance of a service contract.',
    ],
  },
  {
    id: 'retention',
    heading: 'Retention and deletion',
    body: [
      'AE retains identifiable information only for a documented service, legal or other lawful purpose, then securely deletes it or appropriately de-identifies it. Different categories need different periods. Closing an account does not necessarily permit immediate destruction of invoices, dispute records or legally required verification material.',
      'AE will make the applicable retention periods available for: account data for administration and closure; request content for delivery and any disclosed recovery window; financial records for applicable recordkeeping obligations; security logs for a justified investigation period; and support records for resolving issues. Retention periods depend on the service, the purpose of collection and applicable legal requirements.',
      'AE will apply deletion requests across active systems and providers, subject to legal holds and backup retention. Information awaiting backup expiry will remain protected from ordinary use, and restored backups will remain subject to the deletion request. Where retention is required, AE will explain the category, reason and limitation where lawful.',
    ],
  },
  {
    id: 'security',
    heading: 'Security and incident response',
    body: [
      'AE will protect personal information using measures appropriate to its sensitivity and risk, including access restrictions, credential protection, secure transmission and storage where appropriate, monitoring, staff and provider controls, and incident response. Service-specific security requirements are documented in the applicable processing agreement.',
      'AE will assess suspected incidents, contain and investigate them, preserve necessary evidence, and cooperate with affected customers and providers. Where notification obligations apply, AE will notify the relevant people and authorities as required by law. AE will also meet the incident-notice requirements of its customer processing agreements.',
    ],
  },
  {
    id: 'automation',
    heading: 'Automated decisions and human review',
    body: [
      'The platform may automatically apply permissions, budgets, fraud checks and service-routing rules. Customers control their agents’ instructions; AE’s controls govern the parts of a transaction that AE operates. AE will explain material automated uses of personal information, the decisions they affect and applicable review mechanisms when those features are offered.',
      'A person who believes an account restriction, billing decision or other consequential outcome is incorrect may request review through their account support channel. AE will assess the concern and meet applicable transparency and review obligations.',
    ],
  },
  {
    id: 'rights',
    heading: 'Access, correction and choices',
    body: [
      'People may request access to or correction of their personal information and raise concerns about handling. AE will verify identity proportionately, avoid collecting unnecessary identity material and respond within the period required by applicable law. AE will explain a refusal or limitation and available complaint options where required.',
      'Requests for deletion, restriction, objection, portability or withdrawal of consent will be assessed under the rights applicable to the individual and the processing. These rights are not identical in every jurisdiction. Withdrawal does not invalidate prior lawful processing and may prevent a service that depends on the information from continuing.',
      'Where AE holds content solely on a business customer’s instructions, it may direct a request to that customer and assist under the processing agreement. Customers should explain their own handling to the people whose data they submit. AE will still address requests relating to processing for which it is responsible.',
    ],
  },
  {
    id: 'processing',
    heading: 'Business-customer processing arrangements',
    body: [
      'The applicable data-processing agreement sets out the subject matter, duration, purposes, data types and people concerned; documented instructions; confidentiality; security measures; provider authorisation and change notices; overseas transfers; incident assistance; support for individual rights; and return or deletion at the end of service.',
      'AE will provide proportionate information and cooperation to demonstrate compliance with that agreement and address unlawful instructions. The agreement allocates responsibilities when a customer selects an independent provider. Service-specific audit rights, provider objection procedures and technical controls are set out in that agreement. The processing agreement supplements this policy.',
    ],
  },
  {
    id: 'complaints',
    heading: 'Contact and privacy complaints',
    body: [
      'Customers can raise privacy requests and complaints through the support contact in their service agreement. You can also email hello@aecon.ai or use our contact page.',
      'A complaint should identify the issue, relevant dates and the outcome sought, without unnecessary sensitive information. AE will acknowledge the complaint, investigate it and provide a reasoned response, with escalation where appropriate. Where Australian privacy law applies, a person may raise an unresolved complaint with the Office of the Australian Information Commissioner through oaic.gov.au. Other competent authorities may be available under applicable law.',
    ],
  },
  {
    id: 'updates',
    heading: 'Changes to this policy',
    body: [
      'This policy was last updated on 12 September 2026. AE reviews it when its services, information practices or legal obligations change.',
      'Revisions display their update date. Material changes require appropriate notice before new handling begins, and fresh consent where required. Publishing a revised notice does not retrospectively authorise an unrelated use of information already collected.',
    ],
  },
] as const satisfies ReadonlyArray<AeSiteUtilityDocumentSection>
