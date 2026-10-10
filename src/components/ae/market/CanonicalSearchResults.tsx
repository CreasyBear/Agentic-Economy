"use client";

import { useState, type ReactNode } from "react";
import { directoryProviderKey } from '@/modules/market/x402-directory-index'
import { MARKET_LINK_STATE } from './market-return-context'
import { Link } from "@tanstack/react-router";
import { Badge, type BadgeTone } from "@/components/arc/badge/badge";
import { Button as ArcButton } from "@/components/arc/button/button";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ae/shared/base-ui/drawer/drawer';
import { AeSortableDataTable } from "@/components/ae/shared/sortable-data-table/AeSortableDataTable";
import type { AeDataColumn } from "@/components/ae/shared/sortable-data-table/sortable-data-table.contracts";
import type { SearchResult, SupplyProjectionFreshness } from "@/modules/registry/tool-choice-contracts";
import { directoryDate } from "./directory-presentation";
import { REASON_COPY, REASON_COPY_FALLBACK } from '@/content/reason-copy'
import { completedCalls } from '@/modules/registry/search-signals'
import { formatToolDuration } from '@/modules/registry/tool-latency'
import { isPublicToolRef } from '@/modules/common/tool-ref'

type CanonicalSearchResultsProps = {
  results: readonly SearchResult[];
  layout?: 'table' | 'grid';
  sourceFreshness?: SupplyProjectionFreshness;
  renderActions: (item: SearchResult) => ReactNode;
};

function identity(item: SearchResult): string {
  return JSON.stringify([item.source, item.id]);
}

const ACCESS_BADGE = {
  ae_callable: { label: 'Callable', tone: 'success' },
  setup_required: { label: 'Connect', tone: 'info' },
  unavailable: { label: 'Unavailable', tone: 'neutral' },
} as const satisfies Record<SearchResult['access'], { label: string; tone: BadgeTone }>;

function unavailableReason(item: SearchResult): string | undefined {
  return item.access === 'unavailable' && item.reason !== undefined ? REASON_COPY[item.reason] ?? REASON_COPY_FALLBACK : undefined;
}

function AccessBadge({ item }: { item: SearchResult }) {
  const { label, tone } = ACCESS_BADGE[item.access];
  const reason = unavailableReason(item);
  return <Badge tone={tone} size="sm" {...(reason === undefined ? {} : { title: reason })}>{label}</Badge>;
}

function accessDetail(item: SearchResult): string {
  if (item.access === "ae_callable") return `AE-callable · ${item.readiness}`;
  if (item.access === "setup_required") return "Connect to call";
  const reason = unavailableReason(item);
  return reason === undefined ? "Currently unavailable" : `Currently unavailable · ${reason}`;
}

function priceAmount(item: SearchResult): string {
  return item.price.kind === "unavailable" ? "No price" : item.price.label;
}

function priceDetail(item: SearchResult): string {
  if (item.price.kind === "unavailable") return "Price unavailable";
  return `${item.price.label.startsWith("A$") ? "Indicative AUD" : "Provider price"} · ${item.price.label}`;
}

function callsAmount(item: SearchResult): string {
  const signals = item.signals ?? { calls: 0 };
  return signals.successRate === undefined ? "0" : `${completedCalls(signals)} of ${signals.calls}`;
}

function payersAmount(item: SearchResult): string {
  const payers = item.signals?.payers30d;
  return payers === undefined ? "–" : payers < 2 ? "New" : payers.toLocaleString("en-AU");
}

function sourceLabel(source: SearchResult["source"]): string {
  return source === "coinbase" ? "Coinbase Bazaar index" : "AE supply projection";
}

function freshnessDetail(item: SearchResult, sourceFreshness?: SupplyProjectionFreshness): string {
  const freshness = item.freshness ?? (item.source === "current" ? sourceFreshness : undefined);
  if (freshness === undefined) return "Freshness unavailable";
  const state = `${freshness.state.charAt(0).toUpperCase()}${freshness.state.slice(1)}`;
  return freshness.completedAt === undefined
    ? `${state} · completion unavailable`
    : `${state} · refreshed ${directoryDate(new Date(freshness.completedAt).toISOString())}`;
}

function Identifier({ value, label }: { value: string; label: string }) {
  return <span className="arc-canonical-id"><code title={value}>{value}</code><CopyButton value={value} label={label} iconOnly variant="plain" /></span>;
}

function ToolDestination({ item, children }: { item: SearchResult; children: ReactNode }) {
  if (isPublicToolRef(item.toolRef)) {
    return <Link to="/tools/$toolRef" params={{ toolRef: item.toolRef }} state={{ fromMarket: true }}>{children}</Link>;
  }
  const host = item.host ?? (item.sourceRouteRef !== undefined && URL.canParse(item.sourceRouteRef) ? new URL(item.sourceRouteRef).hostname : undefined);
  if (host !== undefined && /^registry:[a-f0-9]{64}$/u.test(item.id)) {
    return <Link to="/tools/$providerHost/$slug" params={{ providerHost: directoryProviderKey(host), slug: item.id }} state={MARKET_LINK_STATE}>{children}</Link>;
  }
  return <a href={item.detailRef}>{children}</a>;
}

export function CanonicalSearchResults({ results, renderActions, sourceFreshness, layout = 'table' }: CanonicalSearchResultsProps) {
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null);
  const selected = selectedIdentity === null
    ? undefined
    : results.find(item => identity(item) === selectedIdentity);

  // Clear a selection as soon as its record leaves the current canonical page;
  // a later page containing the same identity must not reopen the drawer.
  if (selectedIdentity !== null && selected === undefined) setSelectedIdentity(null);

  const rows = [...results];
  const inspect = (item: SearchResult) => <DrawerTrigger
    onClick={() => setSelectedIdentity(identity(item))}
    render={<ArcButton type="button" variant="secondary" size="sm" aria-label={`Inspect ${item.title}`}>Inspect</ArcButton>}
  />;
  const columns: AeDataColumn<SearchResult>[] = [
    { key: "title", label: "Tool", width: 240, sortable: false, truncate: true,
      render: (_value, item) => <ToolDestination item={item}><span title={item.title}>{item.title}</span></ToolDestination> },
    { key: "provider", label: "Provider or host", width: 160, sortable: false, truncate: true,
      render: (_value, item) => <span title={item.provider}>{item.provider}</span> },
    { key: "access", label: "Access", width: 120, sortable: false, render: (_value, item) => <AccessBadge item={item} /> },
    { key: "price", label: "Price", width: 120, sortable: false, numeric: true, render: (_value, item) => priceAmount(item) },
    { key: "calls", label: "AE calls completed", width: 150, sortable: false, numeric: true, render: (_value, item) => callsAmount(item) },
    { key: "payers", label: "Payers (30d)", width: 110, sortable: false, numeric: true, render: (_value, item) => payersAmount(item) },
    { key: "actions", label: "Actions", sortable: false,
      render: (_value, item) => <div className="arc-canonical-actions">{renderActions(item)}{inspect(item)}</div> },
  ];

  return <div className="arc-canonical-results">
    <Drawer
      open={selected !== undefined}
      onOpenChange={open => { if (!open) setSelectedIdentity(null); }}
    >
      {layout === 'grid' ? <ul className="ae-market-result-cards" aria-label="Tool search results">{results.map(item => <li key={identity(item)}>
        <article className="ae-market-result-card">
          <p className="ae-market-result-provider">{item.provider}</p>
          <h3><ToolDestination item={item}>{item.title}</ToolDestination></h3>
          <p className="ae-market-result-summary">{item.summary}</p>
          <dl>
            <div><dt>Access</dt><dd><AccessBadge item={item} /></dd></div>
            <div><dt>Price</dt><dd>{priceAmount(item)}</dd></div>
            <div><dt>AE calls completed</dt><dd>{callsAmount(item)}</dd></div>
            <div><dt>Payers (30d)</dt><dd>{payersAmount(item)}</dd></div>
          </dl>
          <div className="ae-market-result-actions">{renderActions(item)}{inspect(item)}</div>
        </article>
      </li>)}</ul> : <AeSortableDataTable
        rows={rows}
        columns={columns}
        rowKey={identity}
        caption="Canonical search results"
        ariaLabel="Canonical search results"
        rowClassName="arc-canonical-search-row"
      />}
      <DrawerContent
        title={selected?.title ?? ""}
        description={selected?.summary ?? ""}
      >
        {selected === undefined ? null : <dl className="arc-canonical-facts">
          <dt>Provider</dt><dd>{selected.provider}</dd>
          <dt>Access</dt><dd>{accessDetail(selected)}</dd>
          <dt>Price</dt><dd>{priceDetail(selected)}</dd>
          {selected.sourcePrice === undefined ? null : <><dt>Provider-listed source</dt><dd>{selected.sourcePrice}</dd></>}
          <dt>AE calls</dt><dd>{selected.signals?.successRate === undefined ? "No AE calls yet" : `${callsAmount(selected)} completed`}</dd>
          {selected.signals?.latencyP50Ms === undefined ? null : <><dt>Median latency</dt><dd>{formatToolDuration(selected.signals.latencyP50Ms)}</dd></>}
          {selected.signals?.lastVerifiedAt === undefined ? null : <><dt>Last verified</dt><dd>{directoryDate(new Date(selected.signals.lastVerifiedAt).toISOString())}</dd></>}
          <dt>Payers (30d)</dt><dd>{payersAmount(selected)}</dd>
          <dt>Freshness</dt><dd>{freshnessDetail(selected, sourceFreshness)}</dd>
          <dt>Source</dt><dd>{sourceLabel(selected.source)}</dd>
          <dt>ID</dt><dd><Identifier value={selected.id} label="Copy ID" /></dd>
          {selected.toolRef === undefined ? null : <><dt>Tool reference</dt><dd><Identifier value={selected.toolRef} label="Copy Tool reference" /></dd></>}
          <dt>Detail</dt><dd><ToolDestination item={selected}>Open Tool detail</ToolDestination></dd>
        </dl>}
      </DrawerContent>
    </Drawer>
  </div>;
}
