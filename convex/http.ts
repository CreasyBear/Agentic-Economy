import { httpRouter } from 'convex/server'

import { anonymousChat } from './chatAnonymous'
import {
  abortProviderConsequenceJournal,
  attestProviderConsequenceTicket,
  beginProviderConsequenceJournal,
  completeProviderConsequenceJournal,
  providerConsequenceX402Rpc,
} from './providerConsequenceHttp'

const http = httpRouter()

http.route({ path: '/chat/anonymous', method: 'POST', handler: anonymousChat })
http.route({ path: '/internal/provider-consequence/journal/begin', method: 'POST', handler: beginProviderConsequenceJournal })
http.route({ path: '/internal/provider-consequence/journal/attest', method: 'POST', handler: attestProviderConsequenceTicket })
http.route({ path: '/internal/provider-consequence/journal/complete', method: 'POST', handler: completeProviderConsequenceJournal })
http.route({ path: '/internal/provider-consequence/journal/abort', method: 'POST', handler: abortProviderConsequenceJournal })
http.route({ path: '/internal/provider-consequence/x402', method: 'POST', handler: providerConsequenceX402Rpc })

export default http
