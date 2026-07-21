import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <section>
      <h2 className="font-heading text-[17px] font-semibold">Settings</h2>
      <p className="mt-2 text-sm text-text-2">Coming in a later phase.</p>
    </section>
  );
}
