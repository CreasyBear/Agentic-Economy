/* Adapted from Arc UI Pro ai-chat source. Upstream SHA-256: b2ddf16e99097944ad1bf0d3bf6f349e7582ba61bf09755c733f24d3c31c4645. */
"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { ArrowUpRight, LoaderCircle, SquarePen } from "lucide-react";
import { LazyMotion, LayoutGroup, domAnimation, m, useReducedMotion } from "motion/react";

import { motionTokens } from "../../../../arc/lib/motion-tokens";
import styles from "./ai-chat.module.css";

type ArcAiChatHistoryItem = Readonly<{
  id: string;
  title: string;
  busy: boolean;
  content?: ReactNode;
  actions?: ReactNode;
}>;

type ArcAiChatHistoryGroup = Readonly<{
  label: string;
  items: readonly ArcAiChatHistoryItem[];
}>;

export function ArcAiChatFrame({
  sidebar,
  sidebarOpen,
  onNewChat,
  children,
}: Readonly<{
  sidebar: ReactNode;
  sidebarOpen: boolean;
  onNewChat: () => void;
  children: ReactNode;
}>) {
  return (
    <div className={`arc-market ${styles.root}`}>
      {sidebar == null ? null : (
        <aside
          className={styles.sidebar}
          aria-label="Conversation history"
          data-expanded={sidebarOpen}
        >
          <div
            className={styles.sidebarSlide}
            aria-hidden={!sidebarOpen}
            inert={!sidebarOpen || undefined}
          >
            {sidebar}
          </div>
          {!sidebarOpen ? (
            <button
              type="button"
              className={styles.collapsedNewChat}
              aria-label="New chat"
              onClick={onNewChat}
            >
              <SquarePen size={17} strokeWidth={1.75} aria-hidden="true" />
            </button>
          ) : null}
        </aside>
      )}
      <div key="chat-main" className={styles.main}>
        {children}
      </div>
    </div>
  );
}

export function ArcAiChatHeader({
  title,
  description,
  leading,
  actions,
  notice,
}: Readonly<{
  title: string;
  description: string;
  leading: ReactNode;
  actions: ReactNode;
  notice?: ReactNode;
}>) {
  const descriptionId = useId();

  return (
    <div className={`arc-market ${styles.header}`}>
      <div className={styles.headerTools}>{leading}</div>
      <div className={styles.headerTitle}>
        <h1 className={styles.title} title={title} aria-describedby={descriptionId}>
          {title}
        </h1>
        <p id={descriptionId} className={styles.srOnly}>{description}</p>
      </div>
      {notice == null ? null : <span className={styles.notice}>{notice}</span>}
      <div className={styles.headerActions}>{actions}</div>
    </div>
  );
}

export function ArcAiChatHistory({
  groups,
  activeId,
  onOpen,
  onNewChat,
  newChatLabel,
  navLabel,
  busyLabel,
  search,
  status,
  pagination,
}: Readonly<{
  groups: readonly ArcAiChatHistoryGroup[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onNewChat: () => void;
  newChatLabel: string;
  navLabel: string;
  busyLabel: string;
  search: ReactNode;
  status: ReactNode;
  pagination: ReactNode;
}>) {
  const layoutId = useId();
  const reducedMotion = useReducedMotion() ?? false;
  const highlightTransition = reducedMotion
    ? { duration: 0 }
    : motionTokens.spring.morph;

  return (
    <div className={`arc-market ${styles.sidebarInner}`}>
      <div className={styles.sidebarTop}>
        <button
          type="button"
          className={styles.newChat}
          onClick={onNewChat}
          aria-current={activeId === null ? "page" : undefined}
        >
          <SquarePen size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>{newChatLabel}</span>
        </button>
      </div>
      <div className={styles.historySearch}>{search}</div>
      <nav className={styles.history} aria-label={navLabel}>
        <div className={styles.historyStatus}>{status}</div>
        <LazyMotion features={domAnimation}>
          <LayoutGroup id={`${layoutId}-history`}>
            {groups.map((group) => (
              <div key={group.label} className={styles.historyGroup}>
                <p className={styles.historyHeading}>{group.label}</p>
                <ul className={styles.historyList}>
                  {group.items.map((item) => {
                    const current = item.id === activeId;

                    return (
                      <li key={item.id} className={styles.historyItem}>
                        {item.content != null ? (
                          <div className={styles.historyContent}>{item.content}</div>
                        ) : (
                          <div className={styles.historyRow}>
                            <button
                              type="button"
                              className={styles.historyButton}
                              aria-current={current ? "page" : undefined}
                              title={item.title}
                              onClick={() => onOpen(item.id)}
                            >
                              {current ? (
                                <m.span
                                  layoutId={`${layoutId}-active-history`}
                                  className={styles.historyHighlight}
                                  transition={highlightTransition}
                                  aria-hidden="true"
                                />
                              ) : null}
                              <span className={styles.historyTitle}>{item.title}</span>
                              {item.busy ? (
                                <>
                                  <span className={styles.srOnly}>{busyLabel}</span>
                                  <LoaderCircle
                                    className={styles.historyBusy}
                                    size={14}
                                    strokeWidth={1.75}
                                    aria-hidden="true"
                                  />
                                </>
                              ) : null}
                            </button>
                            {item.actions == null ? null : (
                              <div className={styles.historyActions}>{item.actions}</div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </LayoutGroup>
        </LazyMotion>
      </nav>
      <div className={styles.historyFooter}>
        <div className={styles.pagination}>{pagination}</div>
      </div>
    </div>
  );
}

export function ArcAiChatGreeting({ title, description }: Readonly<{
  title: string;
  description: string;
}>) {
  return (
    <div className={styles.greetingBlock}>
      <h2 className={styles.greeting}>{title}</h2>
      <p className={styles.greetingDescription}>{description}</p>
    </div>
  );
}

export function ArcAiChatSuggestions({
  suggestions,
  onPick,
}: Readonly<{
  suggestions: readonly Readonly<{ prompt: string; title: string; label: string }>[];
  onPick: (prompt: string) => void;
}>) {
  return (
    <ul
      className={`arc-market ${styles.suggestions}`}
      aria-label="Suggested questions"
      data-testid="suggested-actions"
    >
      {suggestions.map((suggestion) => (
        <li key={suggestion.prompt}>
          <button
            type="button"
            className={styles.suggestion}
            aria-label={suggestion.prompt}
            onClick={() => onPick(suggestion.prompt)}
          >
            <span className={styles.suggestionCopy}>
              <span className={styles.suggestionTitle}>{suggestion.title}</span>
              <span className={styles.suggestionLabel}>{suggestion.label}</span>
            </span>
            <ArrowUpRight
              className={styles.suggestionArrow}
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ArcAiChatPage({
  kind,
  header,
  children,
  dock,
  busy,
}: Readonly<{
  kind: "ask" | "shared";
  header: ReactNode;
  children: ReactNode;
  dock?: ReactNode;
  busy?: boolean;
}>) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-shell-mode="chat"
      aria-label={kind === "shared" ? "Shared chat" : "Chat"}
      className={`arc-market ${styles.main} ${styles.pageShell}`}
    >
      {header}
      <div className={styles.threadContent} aria-busy={busy === true}>
        {children}
      </div>
      {kind === "ask" ? dock : null}
    </main>
  );
}

export function ArcAiChatDock({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={`arc-market ${styles.dock}`}>
      <div className={styles.dockPage}>{children}</div>
    </div>
  );
}

export function ArcAiChatEmptyStage({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={`arc-market ${styles.empty}`}>{children}</div>;
}
