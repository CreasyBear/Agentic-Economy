import { httpRouter } from 'convex/server'

import { anonymousChat } from './chatAnonymous'

const http = httpRouter()

http.route({ path: '/chat/anonymous', method: 'POST', handler: anonymousChat })

export default http
