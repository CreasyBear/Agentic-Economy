// Shell-only tests render without a Convex provider; entitlement remains unresolved.
export const shellConvexMock = {
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false, isRefreshing: false }),
  useQuery: () => undefined,
}
