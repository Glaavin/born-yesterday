"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * ReportTabs — accessible tabbed sections (Overview / Signals / Sources).
 * Client Component (genuinely interactive). Panels are passed in as already-
 * server-rendered nodes, so only the tab interactivity is client-side.
 *
 * ARIA: role tablist/tab/tabpanel, aria-selected, aria-controls/labelledby.
 * Keyboard: Left/Right (and Up/Down) move focus between tabs (roving tabindex),
 * Home/End jump to first/last, Enter/Space activate the focused tab. Activation
 * is manual (focus moves without switching the panel until you press Enter/Space).
 */
type Tab = { id: string; label: string; panel: ReactNode };

export default function ReportTabs({ tabs }: { tabs: Tab[] }) {
  const [selected, setSelected] = useState(0);
  const [focusIdx, setFocusIdx] = useState(0);
  const btns = useRef<(HTMLButtonElement | null)[]>([]);

  function moveFocus(i: number) {
    const n = (i + tabs.length) % tabs.length;
    setFocusIdx(n);
    btns.current[n]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        moveFocus(i + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        moveFocus(i - 1);
        break;
      case "Home":
        e.preventDefault();
        moveFocus(0);
        break;
      case "End":
        e.preventDefault();
        moveFocus(tabs.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        setSelected(i);
        break;
    }
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Report sections"
        className="flex gap-1 border-b border-ink-muted/20"
      >
        {tabs.map((t, i) => {
          const active = i === selected;
          return (
            <button
              key={t.id}
              ref={(el) => {
                btns.current[i] = el;
              }}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`panel-${t.id}`}
              tabIndex={i === focusIdx ? 0 : -1}
              onClick={() => {
                setSelected(i);
                setFocusIdx(i);
              }}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                active
                  ? "border-accent-gold text-accent-gold"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tabs.map((t, i) => (
        <div
          key={t.id}
          id={`panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${t.id}`}
          tabIndex={0}
          hidden={i !== selected}
          className="pt-5"
        >
          {t.panel}
        </div>
      ))}
    </div>
  );
}
