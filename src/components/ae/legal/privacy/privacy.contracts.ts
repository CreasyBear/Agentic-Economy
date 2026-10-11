import { LEGAL_ENTITY_LINE } from '@/components/ae/legal/legal-version'
import type { AeSiteUtilityDocumentSection } from '@/components/ae/website/utility-document.contracts'

// Privacy policy for the invitation-only alpha.
export const privacyLastUpdated = '11 October 2026'
export const privacyTitle = 'Privacy policy.'
export const privacyIntro = 'How Agentic Economy collects and uses data.'
export const privacyOpening = 'This alpha notice describes information handled by the website, accounts, chat and Tool Calls. The alpha content and learning periods are set out below. This policy is issued by '+LEGAL_ENTITY_LINE+'.'
export const privacyTermsLead = 'Read alongside our'
export const privacyTermsLink = 'terms of service'
export const privacyOaicLead = 'Australian privacy information and complaints guidance are available from the'
export const privacyOaicLink = 'OAIC'
export const privacyCorrectionLink = 'Request a correction or removal'

export const privacySections = [
  {
    id: 'alpha-learning',
    heading: 'Invitation-only alpha learning',
    body: [
      'During the alpha, AE retains Call inputs and results to investigate failures and learn which purchases help the Customer’s Agent continue. The founder, acting through an owner-admin account, may review the content of a selected Call for alpha quality or failure investigation. Each review requires current admin authority and verification, is recorded in Audit without copying content into the audit record, and has a ten-minute access window.',
      'Scheduled cleanup removes eligible Call content 30 days after final purchase resolution. Unresolved delivery, payment, reports, disputes or Provider obligations retain the evidence needed to resolve them. Unused Quote inputs are eligible for cleanup 24 hours after the Quote expires. Cleanup runs hourly and may need additional batches to finish.',
      'Inactive chat turns and saved search continuation content are eligible after 30 days, provided linked purchases are resolved. Active generation and open purchases delay deletion. Chat titles expire after 30 days from their last update. Message deletion removes embeddings and releases file references; the chat component then keeps unreferenced files for a further 24-hour grace period before storage cleanup.',
      'Optional usefulness feedback records a bounded choice and reason, with no free-text comment, prompt or output. Feedback and content-free selection records are retained for 90 days. We use recent usefulness, no-match, failure, latency and cost signals to prioritise fixes and create redacted regression cases. Feedback does not request a refund; use the separate answer-report flow for that.',
      'Separately, optional product feedback submitted through the API, MCP or CLI sends your explicit message to the AE team through PostHog, with pseudonymous Account and Agent attribution and release/environment metadata. Do not include credentials, personal information, Customer business data or Tool inputs and outputs. Product feedback follows the PostHog project’s retention settings, not the 90-day usefulness-feedback period; that vendor retention period remains unverified. Acceptance confirms ingestion, not review or a promised fix. CLI users can prevent feedback submission with DO_NOT_TRACK=1 or AE_DISABLE_ANALYTICS=1; this does not change the remote server’s analytics policy for other requests.',
      'AE records account milestones (sign-up, first credit, first Agent connection, first Quote, first completed Call, activation and week-one return) to see where onboarding stalls. When product analytics is configured, each milestone is sent to PostHog with a one-way hash of the Account reference in place of the Account reference, and with no names, email addresses or content. An owner who opts in to stalled-step emails receives at most one email per stalled step, and each email has a one-click unsubscribe link.',
      'The optional home-page question about what your Agent should get done stores your answer, up to 500 characters, with your Account. The AE team reads it, including in a daily internal summary delivered by Resend, to suggest Tools that fit. Leave out personal or confidential details.',
      'Closing an Account deletes its milestone records and its answer in AE. Copies already sent to PostHog follow the PostHog project’s retention settings and are keyed by the hash, not the Account reference.',
      'Content expiry preserves purchase identities, original digests, receipts, settlement and other financial or security records on their separate schedules. Backups and independent Tool or model Providers have separate retention arrangements that are not established by this application cleanup. Do not assume every recipient or backup has deleted content when it expires in AE.',
    ],
  },
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
      'For service improvement, AE uses aggregate or appropriately de-identified information where practicable, alongside the disclosed founder review during the invitation-only alpha. AE does not sell personal information or use Customer prompts, files or outputs to train its own general-purpose models. This statement does not describe an independent Provider’s or model host’s practices. A materially different optional use requires a specific explanation and appropriate agreement.',
    ],
  },
  {
    id: 'requests',
    heading: 'Prompts, files and provider delivery',
    body: [
      'Preparing a Quote can send the actual proposed inputs to the selected Tool Provider to check its price, before payment or final Call approval. Running the Call sends the relevant inputs and returns its response. Minimise personal information and have authority to disclose information about other people. An Agent’s access does not establish their consent.',
      'Chat sends relevant messages, conversation context and Tool results to the configured model service. Tool selection may also send the request and candidate summaries to a ranking service. OpenRouter and configured model or ranking hosts may process this information. The selected host may vary with the model and routing configuration.',
      'Tool details can show a Provider or endpoint and declared input categories, purposes and release stages. These declarations are not an independent audit of Provider behaviour. They do not always specify retention, training use or processing countries. Do not send sensitive or confidential material unless the available terms and controls meet your requirements; ask Support when they are unclear.',
      'AE stores chat and Call content needed for the service, including request inputs and outputs, as well as separate transaction and recovery records. A payment receipt is not the only record of a request. The retention section below describes the limits of this policy.',
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
      'Providers and infrastructure may process information outside Australia. Processing is not restricted to Australia unless expressly agreed for a particular service. This policy does not list every likely recipient country; ask Support where a particular service processes information.',
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
      'Website measurement does not send account, purchase, customer-content or form-value events to analytics. Account milestone events are described in the alpha learning section. Avoid putting personal information or secrets into URLs or campaign tags. External sites have their own measurement practices. Browser preferences used for site appearance are separate from account or advertising tracking.',
      'AE will give notice of material changes to analytics or tracking, including the information collected, provider, purposes, retention and available choices. Marketing consent is separate from acceptance of a service contract.',
    ],
  },
  {
    id: 'retention',
    heading: 'Retention and deletion',
    body: [
      'The alpha learning section sets the active-store periods for Call, Quote and chat content, usefulness feedback and selection records. Account data, financial records, diagnostics, support correspondence and backups have separate schedules that remain under review. Closing a chat does not immediately delete all copies.',
      'A deletion request must be assessed separately for active content, financial and dispute records, backups and information already disclosed to independent Providers. Legal recordkeeping and open transactions can limit deletion. Public blockchain records cannot be erased by closing an AE account.',
      'Use Support to request access, correction or deletion and to ask what is retained and why. AE will explain applicable limits where lawful. This policy does not promise immediate deletion from every backup or independent recipient.',
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
      `Raise a privacy request or complaint through Support. This policy is issued by ${LEGAL_ENTITY_LINE}.`,
      'A complaint should identify the issue, relevant dates and the outcome sought, without unnecessary sensitive information. AE will acknowledge the complaint, investigate it and provide a reasoned response, with escalation where appropriate. Where Australian privacy law applies, a person may raise an open complaint with the Office of the Australian Information Commissioner through oaic.gov.au. Other competent authorities may be available under applicable law.',
    ],
  },
  {
    id: 'updates',
    heading: 'Changes to this policy',
    body: [
      'This policy was last updated on 11 October 2026. AE reviews the policy when its services, information practices or legal obligations change.',
      'Revisions display their update date. Material changes require appropriate notice before new handling begins, and fresh consent where required. Publishing a revised notice does not retrospectively authorise an unrelated use of information already collected.',
    ],
  },
] as const satisfies ReadonlyArray<AeSiteUtilityDocumentSection>
