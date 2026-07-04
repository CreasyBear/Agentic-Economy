import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval(
  'cleanup expired security abuse buckets',
  { hours: 1 },
  internal.security.cleanupExpiredAbuseRateLimitBuckets,
  {}
)

crons.interval(
  'cleanup expired inquiry abuse buckets',
  { hours: 1 },
  internal.inquiries.cleanupExpiredInquiryAbuseBuckets,
  {}
)

crons.interval(
  'recheck due business capabilities',
  { hours: 1 },
  internal.capabilities.recheckDueBusinessCapabilities,
  {}
)

export default crons
