import { describe, expect, it } from 'vitest'

import { workTreeDevelopmentSmokeConfig } from '../../../tools/dev/work-tree-development-smoke'

describe('WorkTree development smoke configuration', () => {
  it('binds the exact local app and Convex development coordinates to a committed revision', () => {
    expect(workTreeDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'local:local-agentic-economy',
      VITE_CONVEX_URL: 'http://127.0.0.1:3210',
      AE_WORK_TREE_BASE_URL: 'http://127.0.0.1:3024',
    }, 'a'.repeat(40))).toMatchObject({
      baseUrl: 'http://127.0.0.1:3024',
      convexUrl: 'http://127.0.0.1:3210',
      convexDeployment: 'convex:local-agentic-economy',
      sourceRevision: 'a'.repeat(40),
      outcome: 'Get my BAS lodged before the quarter.',
    })
  })

  it('accepts the exact local dev deployment coordinate but not an ambiguous cloud coordinate', () => {
    expect(workTreeDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      VITE_CONVEX_URL: 'http://127.0.0.1:3210',
    }, 'a'.repeat(40))).toMatchObject({ convexDeployment: 'convex:loyal-peacock-107' })

    expect(() => workTreeDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'anonymous:anonymous-Agentic-Economy',
      VITE_CONVEX_URL: 'http://127.0.0.1:3210',
    }, 'a'.repeat(40))).toThrow('CONVEX_DEPLOYMENT must name an exact local development deployment')
  })

  it.each([
    'https://loyal-peacock-107.convex.cloud',
    'https://loyal-peacock-107.convex.site',
    'http://127.0.0.1:3211',
    'http://localhost:3210',
  ])('refuses a non-local Convex URL: %s', (url) => {
    expect(() => workTreeDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'local:local-agentic-economy',
      VITE_CONVEX_URL: url,
    }, 'a'.repeat(40))).toThrow('VITE_CONVEX_URL must be the exact local development origin')
  })

  it('refuses a production app origin before creating a temporary agent credential', () => {
    expect(() => workTreeDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'local:local-agentic-economy',
      VITE_CONVEX_URL: 'http://127.0.0.1:3210',
      AE_WORK_TREE_BASE_URL: 'https://agentic-economy.example',
    }, 'a'.repeat(40))).toThrow('AE_WORK_TREE_BASE_URL must be the exact local development origin')
  })

  it('requires an exact committed source revision', () => {
    expect(() => workTreeDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'local:local-agentic-economy',
      VITE_CONVEX_URL: 'http://127.0.0.1:3210',
    }, 'dirty')).toThrow('development source revision must be an exact Git commit')
  })
})
