"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Active" },
  { href: "/archive", label: "Archive" },
];

export default function TabNav() {
  const pathname = usePathname();
  return (
    <nav className="flex border-b border-gray-200 bg-white px-4 sm:px-6">
      {TABS.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`mr-6 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              active
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
