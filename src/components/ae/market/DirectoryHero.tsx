import { Link } from '@tanstack/react-router'
import { ArrowUpRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { DirectoryToolIdentity } from './DirectoryToolIdentity'
import type { X402MarketplaceHome } from '@/modules/market/x402-marketplace-home'
import type { MarketWindow } from '@/modules/market/contracts'

export function DirectoryHero({ home, window, children, compact = false, compactTitle = "Find your next capability." }: Readonly<{
  home?: X402MarketplaceHome
  window: MarketWindow
  children: ReactNode
  compact?: boolean
  compactTitle?: string
}>) {
  const creative = home?.rails.find(rail => rail.id === 'creative')
  if (compact) return <section className="grid gap-5 py-7 sm:py-9">
    <div className="flex flex-wrap items-end justify-between gap-4"><h1 className="text-3xl font-light tracking-[-0.035em] sm:text-4xl">{compactTitle}</h1><p className="text-sm text-muted-foreground">A world of Tools, ready to explore.</p></div>
    {children}
  </section>
  return <section className="grid items-center gap-6 py-6 md:grid-cols-[1.05fr_0.95fr] md:gap-7 md:py-9 xl:gap-12 xl:py-12">
    <div className="grid content-start gap-4 lg:gap-6">
      <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground">THE TOOL MARKET</p>
      <h1 className="max-w-xl text-[2.75rem] leading-[1.02] font-extralight tracking-[-0.055em] lg:text-6xl xl:text-7xl">Tools for<br />what’s next.</h1>
      <p className="max-w-lg text-sm leading-relaxed text-muted-foreground lg:text-base">Search the web. Work with data. Make something new. Give your agent the capability to take the next step.</p>
      {children}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"><span>Start with an idea</span><Link to="/market" search={{ window, query: 'web search research' }} className="underline decoration-border-strong underline-offset-4 hover:text-foreground">Research a topic</Link><Link to="/market" search={{ window, query: 'image generation creative' }} className="underline decoration-border-strong underline-offset-4 hover:text-foreground">Create an image</Link><Link to="/market" search={{ window, query: 'financial market data prices' }} className="underline decoration-border-strong underline-offset-4 hover:text-foreground">Explore markets</Link></div>
    </div>
    <Link to="/market" search={{ window, query: creative?.query ?? 'image generation creative' }} className="group relative isolate flex min-h-44 flex-col justify-between overflow-hidden rounded-2xl bg-foreground p-5 text-background focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring md:min-h-80 md:p-6 lg:min-h-96 xl:min-h-[27rem] xl:p-8">
      {/* Approved aecon.ai editorial artwork represents a collection, not a Tool output. */}
      <img src="/media/market/lunar-limb-medium.webp" width={800} height={800} alt="" className="absolute inset-0 -z-20 size-full object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none" />
      <div className="absolute inset-0 -z-10 bg-linear-to-t from-foreground/95 via-foreground/20 to-foreground/30" />
      <div className="flex items-start justify-between gap-4"><Badge variant="outline" className="border-background/40 text-background">Explore creative Tools</Badge><ArrowUpRightIcon className="size-6" aria-hidden="true" /></div>
      <div className="mt-5 grid gap-5 md:mt-12">
        <h2 className="max-w-xs text-2xl leading-tight font-light tracking-tight lg:text-3xl xl:text-4xl">From possibility<br />to something real.</h2>
        <div className="hidden flex-wrap items-center justify-between gap-4 border-t border-background/25 pt-4 md:flex"><p className="max-w-56 text-sm leading-relaxed text-background/85">Image generation and creative services, one Call away.</p>{creative?.items.length ? <div className="flex gap-2" aria-label="Tools in this collection">{creative.items.filter(entry => entry.iconUrl !== undefined).slice(0, 3).map(entry => <DirectoryToolIdentity key={entry.resource} entry={entry} className="size-9 rounded-lg" />)}</div> : null}</div>
      </div>
    </Link>
  </section>
}
