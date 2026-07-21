import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documents",
};

export default function DocumentsPage() {
  return (
    <section>
      <h2 className="font-heading text-[17px] font-semibold">Documents</h2>
      <p className="mt-2 text-sm text-text-2">Coming in a later phase.</p>
    </section>
  );
}
