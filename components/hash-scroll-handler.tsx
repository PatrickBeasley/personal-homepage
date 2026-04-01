"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function scrollToHashTarget() {
  const hash = window.location.hash;

  if (!hash) {
    return;
  }

  const id = decodeURIComponent(hash.slice(1));
  const element = document.getElementById(id);

  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export default function HashScrollHandler() {
  const pathname = usePathname();

  useEffect(() => {
    // Delay until after route transition so target sections are mounted.
    const frame = window.requestAnimationFrame(scrollToHashTarget);
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    window.addEventListener("hashchange", scrollToHashTarget);

    return () => {
      window.removeEventListener("hashchange", scrollToHashTarget);
    };
  }, []);

  return null;
}
