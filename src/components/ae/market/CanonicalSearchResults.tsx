"use client";

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/arc/badge/badge";
import { SortableDataTable, type DataColumn } from "@/components/arc/sortable-data-table/sortable-data-table";
import { PUBLIC_SURFACE } from "@/content/brand-copy";
import { DIRECTORY_READINESS, PRICE_UNAVAILABLE } from '@/modules/market/directory-card.view-model'
import { directoryProviderKey } from '@/modules/market/x402-directory-index'
import type { SearchResult } from "@/modules/registry/tool-choice-contracts";
import { MARKET_LINK_STATE } from './market-return-context'

type CanonicalSearchResultsProps = {
  results: readonly SearchResult[];
  layout?: 'table' | 'grid';
  renderActions: (item: SearchResult) => ReactNode;
};

function identity(item: SearchResult): string {
  return JSON.stringify([item.source, item.id]);
}

/** The directory's one readiness vocabulary, so a search row and a tool row say the same thing. */
function Readiness({ item }: { item: SearchResult }) {
  const { label, tone } = DIRECTORY_READINESS[item.access];
  return <Badge tone={tone} size="sm">{label}</Badge>;
}

const priceTitle = (item: SearchResult) => item.sourcePrice === undefined ? {} : { title: `Provider lists ${item.sourcePrice}` };

function price(item: SearchResult): string {
  return item.price.kind === "unavailable" ? PRICE_UNAVAILABLE : PUBLIC_SURFACE.pricePerCall(item.price.label);
}

function ToolDestination({ item, children }: { item: SearchResult; children: ReactNode }) {
  if (item.toolRef !== undefined && item.access !== "external_listing") {
    return <Link to="/tools/$toolRef" params={{ toolRef: item.toolRef }} state={MARKET_LINK_STATE}>{children}</Link>;
  }
  const host = item.host ?? (item.sourceRouteRef !== undefined && URL.canParse(item.sourceRouteRef) ? new URL(item.sourceRouteRef).hostname : undefined);
  if (host !== undefined && /^registry:[a-f0-9]{64}$/u.test(item.id)) {
    return <Link to="/tools/$providerHost/$slug" params={{ providerHost: directoryProviderKey(host), slug: item.id }} state={MARKET_LINK_STATE}>{children}</Link>;
  }
  return <a href={item.detailRef}>{children}</a>;
}

/**
 * Best matches in the tool table's columns: tool and provider, readiness, price, then actions.
 * Rows keep relevance order, so no column sorts.
 */
export function CanonicalSearchResults({ results, renderActions, layout = 'table' }: CanonicalSearchResultsProps) {
  const columns: DataColumn<SearchResult>[] = [
    { key: "title", label: "Tool", sortable: false, render: (_value, item) => <div className="ae-tool-row-text">
      <ToolDestination item={item}><span title={item.title}>{item.title}</span></ToolDestination>
      <span title={item.provider}>{item.provider}</span>
    </div> },
    { key: "access", label: "Access", sortable: false, render: (_value, item) => <Readiness item={item} /> },
    { key: "price", label: "Price per call", sortable: false, numeric: true, render: (_value, item) => <span {...priceTitle(item)}>{item.price.kind === "unavailable" ? PRICE_UNAVAILABLE : item.price.label}</span> },
    { key: "actions", label: "Save or compare", sortable: false, render: (_value, item) => <div className="ae-tool-row-actions">{renderActions(item)}</div> },
  ];

  return <div className="arc-canonical-results">
    {layout === 'grid' ? <ul className="ae-market-result-cards" aria-label="Best matches">{results.map(item => <li key={identity(item)}>
      <article className="ae-market-result-card">
        <p className="ae-market-result-provider">{item.provider}</p>
        <h3><ToolDestination item={item}>{item.title}</ToolDestination></h3>
        <p className="ae-market-result-summary">{item.summary}</p>
        <div className="ae-market-result-facts"><Readiness item={item} /><p {...priceTitle(item)}>{price(item)}</p></div>
        <div className="ae-market-result-actions">{renderActions(item)}</div>
      </article>
    </li>)}</ul> : <div className="ae-tool-table">
      <SortableDataTable<SearchResult> rows={[...results]} columns={columns} rowKey={identity} caption="Best matches" itemName={{ one: "tool", other: "tools" }} />
    </div>}
  </div>;
}
