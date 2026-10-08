import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Adapted from licensed REUI Hero 14: https://reui.io/preview/base/hero-14
 * Upstream hero.tsx SHA-256: 49887a2460e8d424d209b75a10a39bb2c7c42d6884f2e98a403bc8eda9e3affc.
 * Retains the split header and wide media frame. Aecon copy, native-link semantics
 * and local generated artwork replace the demo announcement and analytics console.
 */
export function ProviderHero() {
  return <section aria-labelledby="provider-hero-title" className="bg-background flex w-full items-center px-6 py-12 sm:px-8 lg:px-20">
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <div className="flex flex-wrap items-end gap-8">
        <div className="@container flex min-w-0 flex-1 basis-72 flex-col items-start gap-4">
          <h1 id="provider-hero-title" className="text-foreground text-4xl leading-[1.05] font-medium tracking-tight @sm:text-5xl @lg:text-6xl @2xl:text-7xl">
            <span className="block">Put your API</span>{' '}
            <span className="text-muted-foreground block">on the market</span>
          </h1>
        </div>
        <div className="flex max-w-md min-w-0 flex-1 basis-72 flex-col items-start gap-4">
          <p className="text-muted-foreground text-base leading-6">Agents can find your endpoint, inspect its inputs and price, and buy a call when their task needs it. Start with your existing public x402 endpoint.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button nativeButton={false} role="link" render={<Link to="/owner/operations/new" preload={false} />}>Add Tool<ArrowRight size={16} aria-hidden="true" /></Button>
            <Button variant="outline" nativeButton={false} role="link" render={<a href="#provider-setup" />}>See how it works</Button>
          </div>
          <p className="text-muted-foreground text-xs leading-5">For public x402 v2 endpoints on Base USDC.</p>
        </div>
      </div>
      <div className="@container relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-border md:aspect-[12/5]">
        <img
          src="/brand/aecon-provider-market.webp"
          srcSet="/brand/aecon-provider-market-768.webp 768w, /brand/aecon-provider-market-1280.webp 1280w, /brand/aecon-provider-market.webp 1942w"
          sizes="(min-width: 1440px) 1280px, (min-width: 1024px) calc(100vw - 160px), calc(100vw - 48px)"
          alt=""
          aria-hidden="true"
          width={1942}
          height={809}
          fetchPriority="high"
          decoding="async"
          className="pointer-events-none absolute inset-0 size-full object-cover object-[65%_center]"
        />
      </div>
    </div>
  </section>
}
