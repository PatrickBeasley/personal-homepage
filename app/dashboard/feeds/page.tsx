import type { Metadata } from "next";

import FeedsPanel from "@/components/dashboard/feeds-panel";

export const metadata: Metadata = {
  title: "Feeds",
};

export default function FeedsPage() {
  return <FeedsPanel />;
}
