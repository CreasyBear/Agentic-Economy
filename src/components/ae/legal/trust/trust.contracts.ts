import type { AeSiteUtilityDocumentSection } from '@/components/ae/website/utility-document.contracts'

export const trustLastUpdated = '1 October 2026'
export const trustSections = [
  {
    id: 'money',
    heading: 'Money and limits',
    body: [
      'The invitation-only alpha uses promotional AUD credit. Invited Customers can receive A$10 where offered; the grant shows its expiry. Promotional credit is used first, is not cash and cannot be transferred or refunded, except where the law requires otherwise. Card top-ups are not part of this alpha.',
      'aecon supplies the routing service as principal and pays independent Tool Providers from its own funds. Your credit pays for aecon’s service. aecon does not hold cryptocurrency for you or pay a Provider on your behalf. The Provider and the payment recipient can be different parties.',
      'Turning on spending gives your Agent the authority shown in your controls. A credit balance alone does not give that authority. Calls within your limits can run without another approval. A reservation holds the displayed price while a Call is processed; it is not a final charge.',
    ],
  },
  {
    id: 'answers',
    heading: 'Answers, failures and reporting',
    body: [
      'A Call draws the displayed AUD credit when settlement is verified and the Provider returns a successful HTTP response, a status in the 2xx range. That can include an unhelpful or unreadable result. Payment and delivery records do not certify an answer’s accuracy, safety or fitness for your purpose.',
      'A known Provider error or failure to receive a response is not charged to you, even if aecon has paid the Provider. An uncertain outcome stays pending while it is reconciled. Check the original Call before making a fresh paid attempt.',
      'Eligible completed, settled answers offer “Report this answer” for limited credit restoration. The action shows your remaining daily allowance, which resets at midnight UTC. Each Call can be restored only once through this route. Returned credit goes to its original source; promotional credit that has expired stays expired.',
      'If reporting is unavailable, a result is invalid, or you dispute a charge, use Get help on the receipt. The self-service allowance does not limit Australian Consumer Law rights or other remedies that cannot lawfully be excluded. aecon remains responsible for its own obligations.',
    ],
  },
  {
    id: 'ranking',
    heading: 'Providers and ranking',
    body: [
      'The x402 directory is the first source of discovery. A directory listing describes an independently operated Tool; it is not proof of a verified business, an endorsement or a guarantee that the Tool is suitable for your data.',
      'Ordering uses available signals such as relevance to the request, observed completion and failure, price, prior use and distinct payer adoption. Repeated activity has limited influence. Recorded answer reports can affect delivery evidence and later selection. Signals can be incomplete, especially for a new Tool.',
      'Rankings help compare available evidence. They are not an independent quality benchmark or a guarantee of the next result. Review the Tool description, inputs, price and Provider information for your use.',
    ],
  },
  {
    id: 'security',
    heading: 'Security and responsible disclosure',
    body: [
      'Clerk handles sign-in. Spending permissions, credit availability and payment checks govern Calls. Sensitive changes, including raising spending limits and issuing credentials, require fresh authentication. These controls do not verify the quality or security of an independent Provider.',
      'Keep credentials out of prompts and support reports. Use Support to report a suspected vulnerability privately, with a short description and safe reproduction steps. Do not include another person’s private information or test beyond an authorised scope. Public GitHub issues are for non-sensitive developer reports.',
      'No internet service can promise perfect security. This page makes no uptime guarantee, certification claim or promise that every incident has already been detected.',
    ],
  },
  {
    id: 'data',
    heading: 'Data and privacy',
    body: [
      'Preparing a Quote can send your actual inputs to the selected Tool Provider before payment or final Call approval. Running the Tool also sends the inputs it needs. Chat and ranking services receive relevant request and conversation context to generate answers and select Tools.',
      'Tool declarations can describe input categories, purposes and release stages. They do not always specify a Provider’s retention, training use or processing countries, and they are not an independent audit. Check whether the available terms and controls suit your information before sending it.',
      'aecon stores account, chat, Call and financial records for the service. Public settlement records can remain on the blockchain after an account closes. The privacy draft identifies the services involved and the retention and location details still needing confirmation. Use Support for access, correction or deletion requests.',
    ],
  },
  {
    id: 'status',
    heading: 'Status and incidents',
    body: [
      'The Status page reports checks for the website, Tool API, machine discovery, release identity and catalogue freshness. It does not report every payment dependency, certify every Provider or resolve the status of an individual purchase.',
      'Check the Call receipt for a pending payment, delivery or credit return. Use Support for an incident affecting your account. The current Status page does not provide a complete incident history.',
    ],
  },
  {
    id: 'receipts',
    heading: 'Receipts and help',
    body: [
      'Open the Call receipt from the answer or Activity to see the recorded price, payment and delivery status, available Provider and settlement facts, and any remedy or credit return. A pending record is not a confirmed refund. Funding documents, where available, are separate from Tool Call receipts.',
      'Get help on the receipt includes the Call reference automatically. Describe what you expected and what happened without sending credentials or private inputs. If you only have a general question, use Support. Read the Terms for the agreement and the Privacy policy for information handling.',
    ],
  },
] as const satisfies ReadonlyArray<AeSiteUtilityDocumentSection>
