/**
 * Production stand-in for `react/jsx-dev-runtime`.
 *
 * A legacy UI dependency ships development bundles that import
 * `react/jsx-dev-runtime` and call `jsxDEV(...)`. Under Vite's dev server
 * React resolves that specifier through the `development` export condition,
 * `jsxDEV` exists, and everything works.
 *
 * A production build resolves the same specifier through the `production`
 * condition, which lands on `react-jsx-dev-runtime.production.js`. That file
 * intentionally exports no `jsxDEV`, because it is a development-only API. The
 * bundled call therefore threw
 *
 *   TypeError: (0 , import_jsx_dev_runtime.jsxDEV) is not a function
 *
 * at the first render, and because the server entry preloads every route
 * module before dispatching, one broken component 500'd the entire app —
 * including the pure-JSON API routes.
 *
 * This module supplies the missing entry point by forwarding to the real
 * production runtime. `jsxDEV`'s fourth argument, `isStaticChildren`, is what
 * distinguishes the two production factories: `jsxs` for a statically known
 * child list, `jsx` otherwise. The remaining development-only arguments
 * (`source`, `self`) carry no runtime meaning in production and are dropped,
 * which is exactly what the development runtime does when it forwards.
 *
 * `vite.config.ts` aliases `react/jsx-dev-runtime` here for `build` only, so
 * the dev server keeps React's real development runtime and its warnings.
 *
 * Keep this shim while the production build still needs the alias.
 */
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'

export function jsxDEV(
  type: Parameters<typeof jsx>[0],
  props: Parameters<typeof jsx>[1],
  key: Parameters<typeof jsx>[2],
  isStaticChildren?: boolean,
): ReturnType<typeof jsx> {
  return isStaticChildren === true ? jsxs(type, props, key) : jsx(type, props, key)
}

export { Fragment }
