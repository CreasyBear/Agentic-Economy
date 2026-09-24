import { query, internalQuery } from './_generated/server'
import { browseArgs, browseReturns, browseHandler } from './lib/x402DirectoryIndex/browse'
import { resourceArgs, resourceReturns, resourceHandler, bySlugArgs, bySlugReturns, bySlugHandler, canonicalUrlForToolArgs, canonicalUrlForToolReturns, canonicalUrlForToolHandler, firstEligiblePageArgs, firstEligiblePageReturns, firstEligiblePageHandler, selectedSourceArgs, selectedSourceReturns, selectedSourceHandler } from './lib/x402DirectoryIndex/lookup'
import { facetsArgs, facetsReturns, facetsHandler, overviewArgs, overviewReturns, overviewHandler, statusArgs, statusReturns, statusHandler } from './lib/x402DirectoryIndex/facetReads'
import { analyticsArgs, analyticsReturns, analyticsHandler } from './lib/x402DirectoryIndex/reporting'

export const browse = query({ args: browseArgs, returns: browseReturns, handler: browseHandler })
export const resource = query({ args: resourceArgs, returns: resourceReturns, handler: resourceHandler })
export const bySlug = query({ args: bySlugArgs, returns: bySlugReturns, handler: bySlugHandler })
export const canonicalUrlForTool = query({ args: canonicalUrlForToolArgs, returns: canonicalUrlForToolReturns, handler: canonicalUrlForToolHandler })
export const firstEligiblePage = internalQuery({ args: firstEligiblePageArgs, returns: firstEligiblePageReturns, handler: firstEligiblePageHandler })
export const selectedSource = internalQuery({ args: selectedSourceArgs, returns: selectedSourceReturns, handler: selectedSourceHandler })
export const facets = query({ args: facetsArgs, returns: facetsReturns, handler: facetsHandler })
export const overview = query({ args: overviewArgs, returns: overviewReturns, handler: overviewHandler })
export const status = query({ args: statusArgs, returns: statusReturns, handler: statusHandler })
export const analytics = query({ args: analyticsArgs, returns: analyticsReturns, handler: analyticsHandler })
