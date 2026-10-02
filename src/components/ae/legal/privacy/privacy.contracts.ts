import type { AeSiteUtilityDocumentSection } from '@/components/ae/website/utility-document.contracts'

// Alpha draft: processor locations, retention schedule and legal contact ownership need review.
export const privacyLastUpdated = '1 October 2026'
export const privacyTitle = 'Privacy policy.'
export const privacyIntro = 'How Agentic Economy collects and uses data.'
export const privacyOpening = 'This draft describes information handled by the website, accounts, chat and Tool Calls. Confirmed legal contact details, processor locations and a retention schedule are required before publication.'
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
      'This policy covers how Agentic Economy (AE, we, us) handles personal information across the website and platform. It covers individual and business Customers, authorised users, Agents, Tool Providers and people whose information appears in requests.',
      'The platform includes accounts, chat, spending permissions, promotional credits and paid Tool Calls. The invitation-only alpha uses promotional credits; it does not offer card purchases. A future funding service may involve additional payment information and a notice before use.',
      'AE handles information for account administration, service delivery, financial records, security and legal purposes. A selected Tool Provider or model service also receives information needed for its part of the request. Those recipients may have their own data practices; using AE does not establish that every Provider acts only on AE’s instructions.',
    ],
  },
  {
    id: 'collection',
    heading: 'Information collected and its sources',
    body: [
      'We receive information you submit through account, chat, Tool and support interactions, including contact details and the content of a request. Where account email notifications are enabled, Resend receives the verified recipient email address and notification subject and text for delivery. This is separate from marketing consent.',
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
      'For service improvement, AE uses aggregate or appropriately de-identified information where practicable. AE does not sell personal information or use Customer prompts, files or outputs to train its own general-purpose models. This statement does not describe an independent Provider’s or model host’s practices. Any optional AE use beyond service delivery requires a specific explanation and separate agreement.',
    ],
  },
  {
    id: 'requests',
    heading: 'Prompts, files and provider delivery',
    body: [
      'Preparing a Quote can send the actual proposed inputs to the selected Tool Provider to check its price, before payment or final Call approval. Running the Call sends the relevant inputs and returns its response. Minimise personal information and have authority to disclose information about other people. An Agent’s access does not establish their consent.',
      'Chat sends relevant messages, conversation context and Tool results to the configured model service. Tool selection may also send the request and candidate summaries to a ranking service. OpenRouter and configured model or ranking hosts may process this information. The selected host may vary with the model and routing configuration.',
      'Tool details can show a Provider or endpoint and declared input categories, purposes and release stages. These declarations are not an independent audit of Provider behaviour. They do not always specify retention, training use or processing countries. Do not send sensitive or confidential material unless the available terms and controls meet your requirements; ask Support when they are unclear.',
      'AE stores chat and Call content needed for the service, including request inputs and outputs, as well as separate transaction and recovery records. A payment receipt is not the only record of a request. The retention section below describes the limits of this draft.',
    ],
  },
  {
    id: 'sensitive',
    heading: 'Sensitive information and consequential uses',
    body: [
      'Sensitive information includes health information, identity documents and biometrics. AE will handle it with protections appropriate to its sensitivity and applicable law. Customers are responsible for the authority and consent required to submit it and for selecting a service suited to their requirements.',
      'Accounts are for adults, including people acting for organisations. The service is not directed to children. Information about children in Customer content still requires appropriate authority and protection.',
    ],
  },
  {
    id: 'sharing',
    heading: 'Who receives information',
    body: [
      'Clerk handles sign-in and account identity. Convex stores application records, including accounts, permissions, chat and Call data. Website hosting infrastructure handles requests and delivery logs. Account administrators can see information permitted by their roles. Selected Tool Providers and model or ranking services receive the inputs described above.',
      'Formance handles financial amounts, references and transaction metadata. Coinbase Developer Platform handles AE’s custody signing and wallet requests. Blockchain RPC providers receive address, balance and settlement queries. These financial references may be linkable to a Customer; they are not necessarily anonymous. AE pays Providers from its own wallet, rather than holding cryptocurrency for Customers.',
      'Sentry receives diagnostics when enabled. Filtering removes many sensitive fields, but free-text errors can still contain personal information. Email delivery, support and professional advisers receive information needed for their work. If card funding is later offered, Stripe’s hosted checkout will collect payment details and receive the amount and funding reference; alpha access does not require card details.',
      'AE may disclose information where legally required or otherwise lawfully justified, including to regulators or courts. Requests should be assessed and disclosures limited to their lawful scope. A business transfer may involve necessary disclosures under confidentiality and appropriate protections; affected people must receive notice where required.',
    ],
  },
  {
    id: 'transfers',
    heading: 'Overseas processing and public networks',
    body: [
      'Providers and infrastructure may process information outside Australia. Processing is not restricted to Australia unless expressly agreed for a particular service. This draft does not yet provide a complete list of likely recipient countries; that list and the applicable overseas-disclosure arrangements must be reviewed before publication.',
      'If a request uses a public settlement network, transaction identifiers, addresses, amounts or timing may be visible to third parties and difficult or impossible to erase. AE will explain the settlement data flow for the service and keep prompts, files and direct personal identifiers off public ledgers. Account deletion cannot remove records from an independently operated public network.',
      'Ask Support before submitting information subject to a particular location or transfer requirement. An endpoint’s domain or a blockchain network does not establish where a Provider processes the request.',
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
      'Chat and Call content, account data, financial records, diagnostics and support correspondence serve different purposes and may need different retention periods. This draft does not yet set a complete retention schedule. That schedule must be confirmed before publication; do not assume that closing a chat immediately deletes all copies.',
      'A deletion request must be assessed separately for active content, financial and dispute records, backups and information already disclosed to independent Providers. Legal recordkeeping and unresolved transactions can limit deletion. Public blockchain records cannot be erased by closing an AE account.',
      'Use Support to request access, correction or deletion and to ask what is retained and why. AE will explain applicable limits where lawful. This draft does not promise immediate deletion from every backup or independent recipient.',
    ],
  },
  {
    id: 'security',
    heading: 'Security and incident response',
    body: [
      'AE uses account access controls, protected credentials, request validation and diagnostics to reduce risk. No internet service can promise perfect security. A Tool listing or successful payment does not certify the Provider’s security practices. Agree any additional security requirements before submitting information that depends on them.',
      'Report suspected exposure or a security issue privately through Support. Do not send passwords, API keys or other people’s private data in the report. AE will assess and investigate incidents and meet applicable notification obligations and any separately agreed incident-notice commitments.',
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
      'If an organisation requires a data-processing agreement, specific retention periods, location restrictions or audit rights, agree those requirements before using the service for that information. This public notice does not itself provide a negotiated processing agreement or establish that each independent Provider can meet those requirements.',
      'Any separately accepted processing agreement sets out the parties’ roles, instructions, data types, confidentiality, security, recipients, transfers, incident assistance and treatment of data when the service ends. Mandatory legal obligations continue to apply.',
    ],
  },
  {
    id: 'complaints',
    heading: 'Contact and privacy complaints',
    body: [
      'Raise a privacy request or complaint through Support. The final contracting entity and privacy contact details must be confirmed before this draft is published.',
      'A complaint should identify the issue, relevant dates and the outcome sought, without unnecessary sensitive information. AE will acknowledge the complaint, investigate it and provide a reasoned response, with escalation where appropriate. Where Australian privacy law applies, a person may raise an unresolved complaint with the Office of the Australian Information Commissioner through oaic.gov.au. Other competent authorities may be available under applicable law.',
    ],
  },
  {
    id: 'updates',
    heading: 'Changes to this policy',
    body: [
      'This draft was last updated on 1 October 2026. AE reviews the policy when its services, information practices or legal obligations change.',
      'Revisions display their update date. Material changes require appropriate notice before new handling begins, and fresh consent where required. Publishing a revised notice does not retrospectively authorise an unrelated use of information already collected.',
    ],
  },
] as const satisfies ReadonlyArray<AeSiteUtilityDocumentSection>
