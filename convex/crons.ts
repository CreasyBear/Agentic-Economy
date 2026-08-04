import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()


crons.interval(
  'cleanup expired inquiry abuse buckets',
  { hours: 1 },
  internal.inquiries.cleanupExpiredInquiryAbuseBuckets,
  {}
)

crons.interval(
  'cleanup expired source write nonces',
  { hours: 1 },
  internal.sourceWriteAdmission.cleanupExpiredSourceWriteNonces,
  {}
)

crons.interval(
  'cleanup expired OAuth grants',
  { hours: 1 },
  internal.customerRequestAgentOAuth.cleanupExpiredOAuthGrants,
  {}
)

crons.interval(
  'refresh due capability provider readiness',
  { minutes: 1 },
  internal.capabilitySupply.scheduleDueCapabilityProbes,
  {},
)

export default crons
