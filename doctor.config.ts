export default {
  supplyChain: {
    // PostHog is an intentional observability dependency; keep the Socket finding visible without blocking the L3 cleanup gate.
    severity: 'warning',
  },
}
