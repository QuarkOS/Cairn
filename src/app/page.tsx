"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Belief } from "@/lib/cairn/model";
import {
  beliefMatchesSearch,
  formatValue,
  type RecalledResponse,
} from "@/lib/cairn/display";

type RequestKind = "recall" | "assert" | "retract";

const SAMPLES: Record<RequestKind, string> = {
  recall: JSON.stringify({ kind: "recall", query: { kind: "all" } }, null, 2),
  assert: JSON.stringify(
    {
      kind: "assert",
      idempotencyKey: "desk-sample-assert",
      onConflict: "fail",
      draft: {
        entity: "env:verify",
        attribute: "desk.sample",
        value: { kind: "text", text: "from desk" },
        provenance: {
          kind: "observed",
          command: "desk",
          session: "desk",
        },
        validity: { kind: "until-superseded" },
      },
    },
    null,
    2,
  ),
  retract: JSON.stringify(
    {
      kind: "retract",
      idempotencyKey: "desk-sample-retract",
      factId: "f-0117",
      reason: "desk sample retract",
      session: "desk",
    },
    null,
    2,
  ),
};

const ENTITY_CHIP_LIMIT = 5;

export default function DeskPage() {
  const [beliefs, setBeliefs] = useState<Belief[]>([]);
  const [recalledAt, setRecalledAt] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState<string | "all">("all");
  const [showAllEntities, setShowAllEntities] = useState(false);
  const [tab, setTab] = useState<RequestKind>("recall");
  const [requestText, setRequestText] = useState(SAMPLES.recall);
  const [responseText, setResponseText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadBeliefs = useCallback(async () => {
    try {
      const res = await fetch("/api/cairn");
      const data = (await res.json()) as RecalledResponse;
      if (data.kind !== "recalled") {
        setLoadError("Unexpected recall response");
        return;
      }
      setBeliefs(data.beliefs);
      setRecalledAt(data.recalledAt);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load beliefs");
    }
  }, []);

  useEffect(() => {
    void loadBeliefs();
  }, [loadBeliefs]);

  const entities = useMemo(() => {
    const set = new Set(beliefs.map((b) => b.current.entity));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [beliefs]);

  const visibleEntities = showAllEntities
    ? entities
    : entities.slice(0, ENTITY_CHIP_LIMIT);
  const hiddenEntityCount = Math.max(0, entities.length - ENTITY_CHIP_LIMIT);

  const filtered = useMemo(() => {
    return beliefs.filter((belief) => {
      if (entityFilter !== "all" && belief.current.entity !== entityFilter) {
        return false;
      }
      return beliefMatchesSearch(belief, search);
    });
  }, [beliefs, entityFilter, search]);

  function selectTab(next: RequestKind) {
    setTab(next);
    setRequestText(SAMPLES[next]);
    setJsonError(null);
  }

  async function sendRequest() {
    setJsonError(null);
    let body: unknown;
    try {
      body = JSON.parse(requestText);
    } catch {
      setJsonError("Invalid JSON");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/cairn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: unknown = await res.json();
      setResponseText(JSON.stringify(data, null, 2));
      if (res.ok) {
        await loadBeliefs();
      }
    } catch (err) {
      setResponseText(
        JSON.stringify(
          {
            kind: "rejected",
            error: {
              message: err instanceof Error ? err.message : "Request failed",
            },
          },
          null,
          2,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function retractFact(factId: string) {
    setBusy(true);
    setJsonError(null);
    try {
      const body = {
        kind: "retract",
        idempotencyKey: `desk-retract-${factId}-${Date.now()}`,
        factId,
        reason: "retracted from desk",
        session: "desk",
      };
      const res = await fetch("/api/cairn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: unknown = await res.json();
      setResponseText(JSON.stringify(data, null, 2));
      if (res.ok) {
        await loadBeliefs();
      }
    } finally {
      setBusy(false);
    }
  }

  const emptyAll = beliefs.length === 0;
  const emptyFiltered = !emptyAll && filtered.length === 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Live beliefs</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {beliefs.length} belief{beliefs.length === 1 ? "" : "s"}
              {recalledAt ? (
                <>
                  {" · "}
                  <span>recalled {recalledAt}</span>
                </>
              ) : null}
            </p>
          </div>
          <label className="sr-only" htmlFor="belief-search">
            Search beliefs
          </label>
          <input
            id="belief-search"
            type="search"
            aria-label="Search beliefs"
            placeholder="Search beliefs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full max-w-xs rounded-md border border-rule bg-paper-raised px-3 text-sm outline-none ring-accent focus:ring-2"
          />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <FilterChip
            active={entityFilter === "all"}
            onClick={() => setEntityFilter("all")}
            label="All"
          />
          {visibleEntities.map((entity) => (
            <FilterChip
              key={entity}
              active={entityFilter === entity}
              onClick={() => setEntityFilter(entity)}
              label={entity}
            />
          ))}
          {!showAllEntities && hiddenEntityCount > 0 ? (
            <button
              type="button"
              className="rounded-md border border-rule bg-paper-raised px-2.5 py-1 text-xs font-medium text-ink-muted hover:text-ink"
              onClick={() => setShowAllEntities(true)}
            >
              +{hiddenEntityCount} more
            </button>
          ) : null}
        </div>

        {loadError ? (
          <p className="mb-3 text-sm text-danger">{loadError}</p>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-rule bg-paper-raised">
          <div className="max-h-[min(70vh,720px)] overflow-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-paper-raised shadow-[inset_0_-1px_0_var(--rule)]">
                <tr className="text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-3 py-2.5 font-medium">Entity</th>
                  <th className="px-3 py-2.5 font-medium">Attribute</th>
                  <th className="px-3 py-2.5 font-medium">Value</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {emptyAll ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-ink-muted">
                      No beliefs
                    </td>
                  </tr>
                ) : null}
                {emptyFiltered ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-ink-muted">
                      No matching beliefs
                    </td>
                  </tr>
                ) : null}
                {filtered.map((belief) => (
                  <tr
                    key={belief.current.id}
                    className="border-t border-rule/70 align-top"
                  >
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {belief.current.entity}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {belief.current.attribute}
                    </td>
                    <td className="max-w-[280px] px-3 py-2.5 break-words">
                      {formatValue(belief.current.value)}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge freshness={belief.freshness} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void retractFact(belief.current.id)}
                      >
                        Retract
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <aside className="h-fit rounded-lg border border-rule bg-paper-raised p-4 shadow-sm">
        <h2 className="text-base font-semibold">Agent API</h2>
        <p className="mt-1 text-xs text-ink-muted">
          POST JSON to <code className="font-mono">/api/cairn</code>
        </p>

        <div
          role="tablist"
          aria-label="Request type"
          className="mt-4 flex gap-1 rounded-md border border-rule p-1"
        >
          {(["recall", "assert", "retract"] as const).map((kind) => {
            const selected = tab === kind;
            const label = kind[0]!.toUpperCase() + kind.slice(1);
            return (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`flex-1 rounded px-2 py-1.5 text-sm font-medium capitalize transition-colors ${
                  selected
                    ? "bg-ink text-paper-raised"
                    : "text-ink-muted hover:text-ink"
                }`}
                onClick={() => selectTab(kind)}
              >
                {label}
              </button>
            );
          })}
        </div>

        <textarea
          value={requestText}
          onChange={(e) => setRequestText(e.target.value)}
          spellCheck={false}
          rows={14}
          className="mono mt-3 w-full resize-y rounded-md border border-rule bg-paper px-3 py-2 text-xs leading-relaxed outline-none ring-accent focus:ring-2"
          aria-label="Request JSON"
        />

        <Button
          className="mt-3 w-full"
          disabled={busy}
          onClick={() => void sendRequest()}
        >
          {busy ? "Sending…" : "Send request"}
        </Button>

        {jsonError ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            {jsonError}
          </p>
        ) : null}

        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Response
          </h3>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-rule bg-paper p-3 text-xs leading-relaxed whitespace-pre-wrap">
            {responseText || "—"}
          </pre>
        </div>

        <div className="mt-4 border-t border-rule pt-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left text-sm font-medium"
            aria-expanded={installOpen}
            onClick={() => setInstallOpen((v) => !v)}
          >
            Install
            <span className="text-ink-faint">{installOpen ? "−" : "+"}</span>
          </button>
          {installOpen ? (
            <div className="mt-2 space-y-2 text-xs leading-relaxed text-ink-muted">
              <p>
                Point your agent at Cairn over MCP. From a project directory:
              </p>
              <pre className="overflow-x-auto rounded-md border border-rule bg-paper p-2 font-mono text-[11px] text-ink">
                {`npx --yes @quarkos/cairn --help\nnpx --yes @quarkos/cairn init --project`}
              </pre>
              <p>
                Cursor gets <code className="font-mono">.cursor/mcp.json</code>.
                Pi and Claude Code get <code className="font-mono">.mcp.json</code>{" "}
                with an absolute <code className="font-mono">CAIRN_HOME</code>. The
                desk talks to the same{" "}
                <code className="font-mono">POST /api/cairn</code> contract.
              </p>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-accent bg-accent-soft text-accent"
          : "border-rule bg-paper-raised text-ink-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function StatusBadge({ freshness }: { freshness: Belief["freshness"] }) {
  const color =
    freshness === "fresh"
      ? "text-fresh"
      : freshness === "stale"
        ? "text-stale"
        : "text-expired";
  return <span className={`font-medium capitalize ${color}`}>{freshness}</span>;
}
