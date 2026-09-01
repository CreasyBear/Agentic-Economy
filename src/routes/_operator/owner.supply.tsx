import { Navigate, createFileRoute, Outlet, redirect, useLocation } from '@tanstack/react-router'

import {
  parseOwnerOperationsCompatibilitySearch,
  parseSupplyCompatibilityIntent,
  parseSupplyCompatibilityIntentFromUrl,
} from '@/lib/operator/supply-compatibility'

export const Route = createFileRoute('/_operator/owner/supply')({
  validateSearch: parseOwnerOperationsCompatibilitySearch,
  beforeLoad: ({ location }) => {
    if (location.pathname !== '/owner/supply') return
    // Fragments are not present in the HTTP request. Let the hydrated router
    // classify fragment-only entrances so it can preserve #earnings while
    // clearing every unsupported fragment.
    if (location.searchStr === '') return
    const intent = parseSupplyCompatibilityIntentFromUrl(location.searchStr, location.hash)
    if (intent.hash === undefined && Object.keys(intent.search).length === 0) {
      // An explicit trailing fragment prevents browsers from inheriting a
      // rejected source fragment across the HTTP redirect.
      throw redirect({ href: '/owner/offerings#', replace: true })
    }
    throw redirect({
      to: '/owner/offerings',
      search: intent.search,
      ...(intent.hash === undefined ? {} : { hash: intent.hash }),
      replace: true,
    })
  },
  head: () => ({ meta: [{ title: 'Operations | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: SupplyCompatibilityRoute,
})

function SupplyCompatibilityRoute() {
  const location = useLocation()
  if (location.pathname !== '/owner/supply') return <Outlet />
  const intent = parseSupplyCompatibilityIntent({}, location.hash)
  return (
    <Navigate
      to="/owner/offerings"
      search={intent.search}
      {...(intent.hash === undefined ? {} : { hash: intent.hash })}
      replace
    />
  )
}
