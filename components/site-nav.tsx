import Link from "next/link";

import { getUserContext } from "@/lib/auth/user-context";

type SiteNavProps = {
  currentPath: "/" | "/projects" | "/blog" | "/privacy";
};

function getLinkClass(isActive: boolean) {
  if (isActive) {
    return "text-black dark:text-white font-semibold";
  }

  return "text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white";
}

export default async function SiteNav({ currentPath }: SiteNavProps) {
  const { user, isAdmin } = await getUserContext();
  const nextPath = encodeURIComponent(currentPath);

  return (
    <nav className="border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white/95 dark:bg-black/95 backdrop-blur">
      <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold text-black dark:text-white">
          Patrick Beasley
        </Link>
        <ul className="flex gap-8 text-sm font-medium">
          <li>
            <Link href="/#about" className={getLinkClass(false)}>
              About
            </Link>
          </li>
          <li>
            <Link href="/projects" className={getLinkClass(currentPath === "/projects")}>
              Projects
            </Link>
          </li>
          <li>
            <Link href="/blog" className={getLinkClass(currentPath === "/blog")}>
              Blog
            </Link>
          </li>
          <li>
            <Link href="/#contact" className={getLinkClass(false)}>
              Contact
            </Link>
          </li>
          {!user && (
            <li>
              <Link
                href={`/auth/login?next=${nextPath}`}
                className="text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white"
              >
                Login
              </Link>
            </li>
          )}
          {user && isAdmin && (
            <li>
              <Link href="/admin" className="text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white">
                Admin
              </Link>
            </li>
          )}
          {user && (
            <li>
              <Link
                href={`/auth/logout?next=${nextPath}`}
                className="text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white"
              >
                Logout
              </Link>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}