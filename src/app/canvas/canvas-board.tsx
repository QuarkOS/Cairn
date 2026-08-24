"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { Belief } from "@/lib/cairn/model";
import {
  emptyCanvas,
  isCanvasLayout,
  type CanvasLayout,
} from "@/lib/cairn/canvas-layout";
import {
  formatValue,
  podKeyForBelief,
  type RecalledResponse,
} from "@/lib/cairn/display";

type PodGroup = {
  key: string;
  beliefs: Belief[];
};

type DragState = {
  key: string;
  offsetX: number;
  offsetY: number;
};

const DEFAULT_GAP = 24;
const POD_WIDTH = 260;

function isRecalledResponse(value: unknown): value is RecalledResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "recalled" &&
    "beliefs" in value &&
    Array.isArray(value.beliefs)
  );
}

export function CanvasBoard() {
  const [beliefs, setBeliefs] = useState<Belief[]>([]);
  const [layout, setLayout] = useState<CanvasLayout>(emptyCanvas());
  const [dragging, setDragging] = useState<DragState | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadBeliefs = useCallback(async () => {
    const res = await fetch("/api/cairn");
    const data: unknown = await res.json();
    if (isRecalledResponse(data)) {
      setBeliefs(data.beliefs);
    }
  }, []);

  const loadLayout = useCallback(async () => {
    const res = await fetch("/api/cairn/canvas");
    const data: unknown = await res.json();
    if (isCanvasLayout(data)) {
      setLayout(data);
    }
  }, []);

  useEffect(() => {
    void loadBeliefs();
    void loadLayout();
    const id = setInterval(() => void loadBeliefs(), 5000);
    return () => clearInterval(id);
  }, [loadBeliefs, loadLayout]);

  const pods = useMemo(() => {
    const map = new Map<string, Belief[]>();
    for (const belief of beliefs) {
      const key = podKeyForBelief(belief);
      const list = map.get(key) ?? [];
      list.push(belief);
      map.set(key, list);
    }
    const groups: PodGroup[] = [...map.entries()].map(([key, items]) => ({
      key,
      beliefs: items,
    }));
    groups.sort((a, b) => a.key.localeCompare(b.key));
    return groups;
  }, [beliefs]);

  const positions = useMemo(() => {
    const next: Record<string, { x: number; y: number }> = { ...layout.pods };
    let autoIndex = 0;
    for (const pod of pods) {
      if (!next[pod.key]) {
        const col = autoIndex % 3;
        const row = Math.floor(autoIndex / 3);
        next[pod.key] = {
          x: 32 + col * (POD_WIDTH + DEFAULT_GAP),
          y: 32 + row * 220,
        };
        autoIndex += 1;
      } else {
        autoIndex += 1;
      }
    }
    return next;
  }, [layout.pods, pods]);

  function onPointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    key: string,
  ) {
    if (event.button !== 0) return;
    const pos = positions[key] ?? { x: 0, y: 0 };
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const offsetX = event.clientX - rect.left - pos.x;
    const offsetY = event.clientY - rect.top - pos.y;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging({ key, offsetX, offsetY });
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const x = Math.max(0, event.clientX - rect.left - dragging.offsetX);
    const y = Math.max(0, event.clientY - rect.top - dragging.offsetY);
    const key = dragging.key;
    setLayout((prev) => {
      const next: CanvasLayout = {
        version: 1,
        pods: {
          ...prev.pods,
          [key]: { x, y },
        },
      };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void fetch("/api/cairn/canvas", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(next),
        });
      }, 150);
      return next;
    });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    setDragging(null);
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Agent canvas</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Pods group facts by agent (told) or session (observed / inferred).
          Drag to arrange. Layout saves automatically.
        </p>
      </div>

      <div
        ref={boardRef}
        className="relative min-h-[70vh] overflow-auto rounded-lg border border-rule bg-board"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(28,25,23,0.18) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {pods.length === 0 ? (
          <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-ink-muted">
            No beliefs to place yet
          </p>
        ) : null}

        {pods.map((pod) => {
          const pos = positions[pod.key] ?? { x: 0, y: 0 };
          const isDragging = dragging?.key === pod.key;
          return (
            <div
              key={pod.key}
              role="group"
              aria-label={pod.key}
              className={`absolute select-none rounded-lg border border-rule bg-paper-raised shadow-sm ${
                isDragging ? "z-20 cursor-grabbing shadow-md" : "z-10 cursor-grab"
              }`}
              style={{
                left: pos.x,
                top: pos.y,
                width: POD_WIDTH,
                touchAction: "none",
              }}
              onPointerDown={(e) => onPointerDown(e, pod.key)}
            >
              <div className="border-b border-rule px-3 py-2">
                <div className="truncate text-sm font-semibold">{pod.key}</div>
                <div className="text-xs text-ink-muted">
                  {pod.beliefs.length} fact{pod.beliefs.length === 1 ? "" : "s"}
                </div>
              </div>
              <ul className="max-h-48 space-y-2 overflow-auto p-3 text-xs">
                {pod.beliefs.map((belief) => (
                  <li key={belief.current.id} className="leading-snug">
                    <div className="font-mono text-[11px] text-ink-muted">
                      {belief.current.entity}
                    </div>
                    <div className="font-medium">{belief.current.attribute}</div>
                    <div className="text-ink-muted">
                      {formatValue(belief.current.value)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
