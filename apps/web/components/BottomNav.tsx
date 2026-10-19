import Link from "next/link";

type Tab = "home" | "map" | "wins" | "reports";

const ITEMS: { tab: Tab; href: string; label: string }[] = [
  { tab: "home", href: "/", label: "Home" },
  { tab: "map", href: "/map", label: "Map" },
  { tab: "wins", href: "/wins", label: "Wins" },
  { tab: "reports", href: "/track", label: "My reports" },
];

/** Mobile bottom navigation from the wireframes, with the Report button in the middle. */
export function BottomNav({ active }: { active: Tab }) {
  const [first, second, ...rest] = ITEMS;
  const item = (i: (typeof ITEMS)[number]) => (
    <Link
      key={i.tab}
      href={i.href}
      aria-current={i.tab === active ? "page" : undefined}
      className={`flex min-h-11 min-w-15 flex-col items-center justify-center text-[11px] no-underline ${
        i.tab === active ? "font-semibold text-accent" : "text-muted"
      }`}
    >
      {i.label}
    </Link>
  );

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 flex items-end justify-around border-t border-line bg-surface px-2 pt-2 pb-5"
    >
      {first && item(first)}
      {second && item(second)}
      <Link
        href="/report"
        aria-label="Report an issue"
        className="mb-1 flex size-14 items-center justify-center rounded-full bg-accent text-2xl text-white no-underline hover:text-white"
      >
        +
      </Link>
      {rest.map(item)}
    </nav>
  );
}
