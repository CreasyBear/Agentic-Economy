import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { docsAppReturnUrl } from './app-return';
import { appName } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    links: [{ type: 'button', text: 'Return to app (opens in a new tab)', url: docsAppReturnUrl(import.meta.env.VITE_AE_DOCS_APP_URL), external: true }],
    nav: {
      // JSX supported
      title: appName,
    },
  };
}
