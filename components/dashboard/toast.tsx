"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// Matches the design's toast lifetime (design/patrick-beasley.dc.html: 1900ms).
const TOAST_MS = 1900;

const ToastContext = createContext<((message: string) => void) | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((next: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setMessage(next);
    timerRef.current = setTimeout(() => setMessage(null), TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    []
  );

  return (
    <ToastContext value={showToast}>
      {children}
      {/*
        The live region itself is always mounted — a role="status" element that
        only appears together with its text is not reliably announced. Only the
        styled bubble is conditional.
      */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed left-1/2 z-[120] -translate-x-1/2"
        style={{ bottom: "calc(28px + env(safe-area-inset-bottom))" }}
      >
        {message ? (
          <div className="animate-[pbPop_0.25s_ease_both] rounded-xl bg-text px-5 py-[11px] text-sm font-medium text-bg shadow-lg motion-reduce:animate-none">
            {message}
          </div>
        ) : null}
      </div>
    </ToastContext>
  );
}

export function useToast(): (message: string) => void {
  const showToast = useContext(ToastContext);

  if (!showToast) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }

  return showToast;
}
