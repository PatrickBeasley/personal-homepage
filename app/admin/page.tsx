import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getUserContext } from "@/lib/auth/user-context";
import AdminDashboardClient from "./admin-dashboard-client";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const { user, isAdmin } = await getUserContext();

  // Redirect to login if not authenticated
  if (!user) {
    redirect("/auth/login");
  }

  // Redirect if not admin
  if (!isAdmin) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600 mt-2">Manage blog posts, files, and contact submissions</p>
        </div>

        <AdminDashboardClient userEmail={user.email} />
      </div>
    </main>
  );
}
