import { mutation } from './_generated/server'
import { reviewCallContentArgs, reviewCallContentHandler, reviewCallContentValue } from './lib/adminConsole/actions/callContent'

export const review = mutation({ args: reviewCallContentArgs.fields, returns: reviewCallContentValue, handler: reviewCallContentHandler })
