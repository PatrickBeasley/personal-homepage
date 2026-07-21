import type { Metadata } from "next";
import { redirect } from "next/navigation";

import DashboardShell from "@/components/dashboard/shell";
import { ToastProvider } from "@/components/dashboard/toast";
import { WorkspaceProvider } from "@/components/dashboard/workspace-context";
import { getUserContext } from "@/lib/auth/user-context";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The real security boundary for every /dashboard route. Section APIs added
  // in later phases re-verify independently — this guard protects the UI only.
  const { user, isAdmin } = await getUserContext();

  if (!user) {
    redirect("/login?next=%2Fdashboard");
  }

  if (!isAdmin) {
    redirect("/");
  }

  // The layout persists across section navigations, so the workspace choice and
  // the sidebar's open/closed state survive route changes.
  return (
    <WorkspaceProvider>
      <ToastProvider>
        <DashboardShell>{children}</DashboardShell>
      </ToastProvider>
    </WorkspaceProvider>
  );
}
