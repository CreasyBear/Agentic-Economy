import { httpAction } from './_generated/server'
import { anonymousChatHandler } from './lib/chat/anonymous/http'

export const anonymousChat = httpAction(anonymousChatHandler)
