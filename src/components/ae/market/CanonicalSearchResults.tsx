"use client";

import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button as ArcButton } from "@/components/arc/button/button";
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ae/shared/base-ui/drawer/drawer';
import { AeSortableDataTable } from "@/components/ae/shared/sortable-data-table/AeSortableDataTable";
import type { AeDataColumn } from "@/components/ae/shared/sortable-data-table/sortable-data-table.contracts";
import type { SearchResult, SupplyProjectionFreshness } from "@/modules/registry/tool-choice-contracts";
import { directoryDate } from "./directory-presentation";

type CanonicalSearchResultsProps = {
  results: readonly SearchResult[];
  sourceFreshness?: SupplyProjectionFreshness;
  renderActions: (item: SearchResult) => ReactNode;
};

function identity(item: SearchResult): string {
  return JSON.stringify([item.source, item.id]);
}

function accessProjection(item: SearchResult): string {
  if (item.access === "ae_callable") return `AE-callable · ${item.readiness}`;
  if (item.access === "setup_required") return "Connect to call";
  if (item.access === "unavailable") return "Currently unavailable · inspect";
  return "External listing · not AE-callable";
}

function priceProjection(item: SearchResult): string {
  if (item.price.kind === "unavailable") return "Price unavailable";
  return `${item.price.label.startsWith("A$") ? "Indicative AUD" : "Provider price"} · ${item.price.label}`;
}

function freshnessProjection(item: SearchResult, sourceFreshness?: SupplyProjectionFreshness): string {
  const freshness = item.freshness ?? (item.source === "current" ? sourceFreshness : undefined);
  const index = item.source === "coinbase" ? "Coinbase Bazaar index" : "AE supply projection";
  if (freshness === undefined) return `${index} · freshness unavailable`;
  const refreshed = freshness.completedAt === undefined
    ? "completion unavailable"
    : `refreshed ${directoryDate(new Date(freshness.completedAt).toISOString())}`;
  return `${index} · ${freshness.state} · ${refreshed}`;
}

function CellText({ children }: { children: string }) {
  return <span className="arc-canonical-cell" title={children}>{children}</span>;
}

function ToolDestination({ item, children }: { item: SearchResult; children: ReactNode }) {
  if (item.toolRef !== undefined && item.access !== "external_listing") {
    return <Link to="/tools/$toolRef" params={{ toolRef: item.toolRef }} state={{ fromMarket: true }}>{children}</Link>;
  }
  return <a href={item.detailRef}>{children}</a>;
}

export function CanonicalSearchResults({ results, renderActions, sourceFreshness }: CanonicalSearchResultsProps) {
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null);
  const selected = selectedIdentity === null
    ? undefined
    : results.find(item => identity(item) === selectedIdentity);

  // Clear a selection as soon as its record leaves the current canonical page;
  // a later page containing the same identity must not reopen the drawer.
  if (selectedIdentity !== null && selected === undefined) setSelectedIdentity(null);

  const rows = [...results];
  const columns: AeDataColumn<SearchResult>[] = [
    {
      key: "title",
      label: "Tool",
      width: 240,
      sortable: false,
      render: (_value, item) => <ToolDestination item={item}><CellText>{item.title}</CellText></ToolDestination>,
    },
    {
      key: "provider",
      label: "Provider",
      width: 120,
      sortable: false,
      render: (_value, item) => <CellText>{item.provider}</CellText>,
    },
    {
      key: "access",
      label: "Access",
      width: 180,
      sortable: false,
      render: (_value, item) => <CellText>{accessProjection(item)}</CellText>,
    },
    {
      key: "price",
      label: "Price",
      width: 140,
      sortable: false,
      render: (_value, item) => <CellText>{priceProjection(item)}</CellText>,
    },
    {
      key: "freshness",
      label: "Freshness",
      width: 160,
      sortable: false,
      render: (_value, item) => <CellText>{freshnessProjection(item, sourceFreshness)}</CellText>,
    },
    {
      key: "actions",
      label: "Actions",
      width: 320,
      sortable: false,
      render: (_value, item) => <div className="arc-canonical-actions">
        {renderActions(item)}
        <DrawerTrigger
          onClick={() => setSelectedIdentity(identity(item))}
          render={<ArcButton type="button" variant="secondary" size="sm" aria-label={`Inspect ${item.title}`}>Inspect</ArcButton>}
        />
      </div>,
    },
  ];

  return <div className="arc-canonical-results">
    <Drawer
      open={selected !== undefined}
      onOpenChange={open => { if (!open) setSelectedIdentity(null); }}
    >
      <AeSortableDataTable
        rows={rows}
        columns={columns}
        rowKey={identity}
        caption="Canonical search results"
        ariaLabel="Canonical search results"
        animateRows={false}
        tableClassName="arc-canonical-search-table"
        rowClassName="arc-canonical-search-row"
      />
      <DrawerContent
        title={selected?.title ?? ""}
        description={selected?.summary ?? ""}
      >
        {selected === undefined ? null : <dl className="arc-canonical-facts">
          <dt>Provider</dt><dd>{selected.provider}</dd>
          <dt>Access</dt><dd>{accessProjection(selected)}</dd>
          <dt>Price</dt><dd>{priceProjection(selected)}</dd>
          {selected.sourcePrice === undefined ? null : <><dt>Provider-listed source</dt><dd>{selected.sourcePrice}</dd></>}
          <dt>Freshness</dt><dd>{freshnessProjection(selected, sourceFreshness)}</dd>
          <dt>Source</dt><dd>{selected.source}</dd>
          <dt>ID</dt><dd>{selected.id}</dd>
          {selected.toolRef === undefined ? null : <><dt>Tool reference</dt><dd>{selected.toolRef}</dd></>}
          <dt>Detail</dt><dd><ToolDestination item={selected}>Open Tool detail</ToolDestination></dd>
        </dl>}
      </DrawerContent>
    </Drawer>
  </div>;
}
