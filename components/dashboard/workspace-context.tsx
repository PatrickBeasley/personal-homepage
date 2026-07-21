"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";

export type Workspace = "work" | "home";

const STORAGE_KEY = "pb_workspace";
const WORKSPACE_CHANGE_EVENT = "pb:workspacechange";

/**
 * localStorage is the source of truth, read through an external store rather
 * than mirrored into state. The server cannot know the stored workspace, so
 * `getServerSnapshot` pins the hydration render to the default ("work") and
 * React re-reads the real value straight after hydration — no
 * setState-in-effect, no hydration mismatch. Mirrors the theme store in
 * components/theme-toggle.tsx, which a prior review validated.
 */
function subscribeToWorkspace(onStoreChange: () => void) {
  window.addEventListener(WORKSPACE_CHANGE_EVENT, onStoreChange);
  // Keeps other tabs of the dashboard in sync.
  window.addEventListener("storage", onStoreChange);

  return () => {
    window.removeEventListener(WORKSPACE_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getWorkspaceSnapshot(): Workspace {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "home" ? "home" : "work";
  } catch {
    // localStorage may be unavailable (private mode, disabled storage).
    return "work";
  }
}

function getServerWorkspaceSnapshot(): Workspace {
  return "work";
}

function writeWorkspace(next: Workspace) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Persistence is best-effort; the switch still applies for this session.
  }
  window.dispatchEvent(new Event(WORKSPACE_CHANGE_EVENT));
}

interface WorkspaceContextValue {
  workspace: Workspace;
  setWorkspace: (next: Workspace) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const workspace = useSyncExternalStore(
    subscribeToWorkspace,
    getWorkspaceSnapshot,
    getServerWorkspaceSnapshot
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({ workspace, setWorkspace: writeWorkspace }),
    [workspace]
  );

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);

  if (!value) {
    throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  }

  return value;
}
