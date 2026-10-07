import Link from 'fumadocs-core/link';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    // Static contract artifacts are served by Nitro, outside the client router.
    a: ({ href, ...props }) => href?.split('#')[0] === '/openapi.json'
      ? <Link {...props} href={href} external target="_self" />
      : <Link {...props} href={href} />,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
