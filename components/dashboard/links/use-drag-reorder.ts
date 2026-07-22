"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Pointer-driven list reordering, plus a keyboard equivalent.
 *
 * Pointer Events rather than HTML5 drag-and-drop: the latter does not fire on
 * touch devices at all, so it cannot serve both the desktop and mobile
 * requirement from one implementation.
 *
 * Two things that are easy to get wrong and expensive to rediscover:
 *
 *   - The handle needs `touch-action: none` in CSS. Without it the browser
 *     resolves the gesture as a scroll and cancels the pointer stream before
 *     these handlers run. This is set on the button in `LinkRow`.
 *   - `setPointerCapture` keeps events flowing to the handle even when the
 *     pointer leaves it, which it always does — the row moves out from under
 *     the finger as the list reorders.
 */
export interface DragReorderOptions {
  /** Number of rows currently rendered in the draggable list. */
  count: number;
  /** Reordering is only meaningful in manual sort. */
  enabled: boolean;
  /** Called once on drop, with the source and destination indices. */
  onCommit: (fromIndex: number, toIndex: number) => void;
}

export function useDragReorder({ count, enabled, onCommit }: DragReorderOptions) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  /**
   * The same two values as refs.
   *
   * `onCommit` must not be called from inside a state updater: React invokes
   * updaters twice in StrictMode, which would fire two reorder requests for one
   * drop. Refs give `finish` the current indices synchronously with no updater.
   */
  const dragIndexRef = useRef<number | null>(null);
  const overIndexRef = useRef<number | null>(null);
  /** Live row elements, so a move can hit-test against their boxes. */
  const rowsRef = useRef<HTMLElement[]>([]);

  const registerRow = useCallback((index: number, element: HTMLElement | null) => {
    if (element) {
      rowsRef.current[index] = element;
    }
  }, []);

  const finish = useCallback(() => {
    const from = dragIndexRef.current;
    const to = overIndexRef.current;

    dragIndexRef.current = null;
    overIndexRef.current = null;
    setDragIndex(null);
    setOverIndex(null);

    if (from !== null && to !== null && from !== to) {
      onCommit(from, to);
    }
  }, [onCommit]);

  const getHandleProps = useCallback(
    (index: number) => {
      if (!enabled) {
        return {};
      }

      return {
        onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
          // Ignore secondary buttons; a right-click must not start a drag.
          if (event.button !== 0) {
            return;
          }

          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragIndexRef.current = index;
          overIndexRef.current = index;
          setDragIndex(index);
          setOverIndex(index);
        },

        onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => {
          if (dragIndexRef.current === null) {
            return;
          }

          const y = event.clientY;

          // The destination is the first row whose midpoint is still below the
          // pointer; past every midpoint means the end of the list. Comparing
          // against midpoints rather than row bounds is what makes the drop
          // indicator flip at the halfway point instead of at the edge, and it
          // gives a defined answer when the pointer is in the gap between rows.
          let next = count - 1;

          for (let i = 0; i < count; i += 1) {
            const row = rowsRef.current[i];

            if (!row) {
              continue;
            }

            const box = row.getBoundingClientRect();

            if (y < box.top + box.height / 2) {
              next = i;
              break;
            }
          }

          overIndexRef.current = next;
          setOverIndex(next);
        },

        onPointerUp: finish,
        onPointerCancel: finish,

        onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
          // Keyboard equivalent: drag alone is unusable without a pointer, and
          // every row here is already keyboard-reachable.
          if (event.key === "ArrowUp" && index > 0) {
            event.preventDefault();
            onCommit(index, index - 1);
          }

          if (event.key === "ArrowDown" && index < count - 1) {
            event.preventDefault();
            onCommit(index, index + 1);
          }
        },
      };
    },
    [count, enabled, finish, onCommit]
  );

  const getRowProps = useCallback(
    (index: number) => ({
      ref: (element: HTMLElement | null) => registerRow(index, element),
      "data-dragging": dragIndex === index ? "true" : undefined,
      "data-drop-target": overIndex === index && dragIndex !== index ? "true" : undefined,
    }),
    [dragIndex, overIndex, registerRow]
  );

  return { dragIndex, overIndex, getHandleProps, getRowProps };
}
