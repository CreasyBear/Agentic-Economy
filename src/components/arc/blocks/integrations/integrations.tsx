"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer";
import { SearchField } from "@/components/arc/search-field/search-field";
import styles from "./integrations.module.css";

export interface IntegrationRecord {
  /** Stable identity for disclosure state. Must be unique within `records`. */
  id: string;
  /** Stable, non-empty DOM target id. Must be unique within `records`. */
  targetId: string;
  /** The current method or resource name supplied by the caller. */
  name: string;
  /** Source-provided description, such as its environment. */
  description: string;
  /** Current lifecycle projection, shown as supplied. */
  lifecycleLabel: string;
  /** Current health projection, shown as supplied. */
  healthLabel: string;
  /** Current, attributable facts supplied by the owning projection. */
  facts?: readonly { label: string; value: ReactNode }[];
  /** Optional record-specific context for the inspection drawer. */
  detail: ReactNode;
  /** Caller-owned controls stay in the row, outside the inspection drawer. */
  actions?: ReactNode;
}

export interface IntegrationsProps {
  records: readonly IntegrationRecord[];
  title?: string;
  description?: string;
  forcedVisibleId?: string;
  onClearProgrammaticFocus?: () => void;
  emptyAction?: ReactNode;
  context?: ReactNode;
}

const DEFAULT_TITLE = "Connections";
const DEFAULT_DESCRIPTION = "Inspect authority and health for each endpoint. Tool readiness is checked separately.";

export function Integrations({
  records,
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  forcedVisibleId,
  onClearProgrammaticFocus,
  emptyAction,
  context,
}: IntegrationsProps) {
  const titleId = useId();
  const factsTitleId = useId();
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);

  const recordIds = new Set<string>();
  const targetIds = new Set<string>();
  for (const record of records) {
    if (!record.id || recordIds.has(record.id) || !record.targetId || targetIds.has(record.targetId)) {
      throw new Error("Integrations requires non-empty, unique record ids and target ids.");
    }
    recordIds.add(record.id);
    targetIds.add(record.targetId);
  }

  const needle = query.trim().toLowerCase();
  const visibleRecords = records.filter((record) => {
    if (record.targetId === forcedVisibleId) return true;
    if (!needle) return true;
    return `${record.name} ${record.description} ${record.lifecycleLabel} ${record.healthLabel}`
      .toLowerCase()
      .includes(needle);
  });
  const selected = selectedId === null ? undefined : records.find((record) => record.id === selectedId);

  useEffect(() => {
    if (selectedId === null || selected !== undefined) return;
    setDrawerOpen(false);
    setSelectedId(null);
  }, [selected, selectedId]);

  function openInspection(record: IntegrationRecord, button: HTMLButtonElement) {
    returnFocusRef.current = button;
    setSelectedId(record.id);
    setDrawerOpen(true);
  }

  function returnFocus() {
    const origin = returnFocusRef.current;
    const target = origin?.isConnected ? origin : titleRef.current;
    if (target?.isConnected) target.focus({ preventScroll: true });
    returnFocusRef.current = null;
    return false;
  }

  function clearSearch() {
    setQuery("");
    searchRef.current?.focus();
  }

  return (
    <section className={`arc-market ${styles.root}`} aria-labelledby={titleId}>
      <header className={styles.header}>
        <div className={styles.intro}>
          <h2 id={titleId} ref={titleRef} tabIndex={-1}>{title}</h2>
          <p>{description}</p>
        </div>
        <div className={styles.search}>
          <SearchField
            ref={searchRef}
            label="Find a connection"
            placeholder="Search name, status, or health"
            autoComplete="off"
            value={query}
            onValueChange={setQuery}
          />
        </div>
      </header>

      {context == null ? null : <div className={styles.context}>{context}</div>}

      <ul className={styles.list} aria-label="Provider connections">
        {visibleRecords.map((record) => (
          <li
            key={record.id}
            id={record.targetId}
            tabIndex={-1}
            data-programmatic-focus={record.targetId === forcedVisibleId ? "" : undefined}
            className={styles.card}
            onPointerDown={onClearProgrammaticFocus}
          >
            <div className={styles.cardBody}>
              <div className={styles.nameLine}>
                <h3 className={styles.name}>{record.name}</h3>
                <span className={styles.factTag}>
                  <span className={styles.factLabel}>Lifecycle</span>
                  <span>{record.lifecycleLabel}</span>
                </span>
                <span className={styles.factTag}>
                  <span className={styles.factLabel}>Health</span>
                  <span>{record.healthLabel}</span>
                </span>
              </div>
              <p className={styles.recordDescription}>{record.description}</p>
            </div>

            <div className={styles.actions}>
              {record.actions == null ? null : <div className={styles.recordActions}>{record.actions}</div>}
              <button
                type="button"
                className={styles.inspect}
                aria-haspopup="dialog"
                aria-label={`Inspect ${record.name}`}
                onClick={(event) => openInspection(record, event.currentTarget)}
              >
                <span>Inspect</span>
                <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {records.length === 0 ? (
        <div className={styles.empty}>
          <h3>No provider connection yet</h3>
          <p>Add the public HTTPS endpoint that returns the x402 payment challenge for your Tool.</p>
          {emptyAction == null ? null : <div className={styles.emptyAction}>{emptyAction}</div>}
        </div>
      ) : visibleRecords.length === 0 ? (
        <div className={styles.empty} role="status">
          <h3>No connections match this search.</h3>
          <button type="button" className={styles.clearSearch} onClick={clearSearch}>
            Clear connection search
          </button>
        </div>
      ) : null}

      <Drawer
        open={drawerOpen && selected !== undefined}
        onOpenChange={setDrawerOpen}
      >
        <DrawerContent
          side="right"
          title={selected?.name ?? "Connection"}
          {...(selected ? { description: selected.description } : {})}
          finalFocus={returnFocus}
        >
          {selected === undefined ? null : (
            <div className={styles.sheet}>
              {selected.facts && selected.facts.length > 0 ? (
                <section className={styles.sheetSection} aria-labelledby={factsTitleId}>
                  <h3 id={factsTitleId}>Authority and access</h3>
                  <dl className={styles.facts}>
                    {selected.facts.map((fact) => (
                      <div key={fact.label}>
                        <dt>{fact.label}</dt>
                        <dd>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}
              {selected.detail == null ? null : <div className={styles.detail}>{selected.detail}</div>}
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </section>
  );
}
