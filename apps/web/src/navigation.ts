/**
 * Navigation model.
 *
 * One declaration drives the sidebar and the mobile bottom bar, so the two can
 * never drift apart. `primary` marks the five sections the product is built
 * around, which are also the five the mobile app exposes.
 */

export type PageId =
  | "dashboard"
  | "trades"
  | "add-trade"
  | "analytics"
  | "journal"
  | "strategies"
  | "risk"
  | "settings"
  | "admin";

export interface NavItem {
  id: PageId;
  label: string;
  /** Short label for the mobile bottom bar. */
  short: string;
  icon: string;
  /** Shown in the mobile bottom navigation. */
  primary: boolean;
  group: "Journal" | "Analysis" | "Setup";
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", short: "Home", icon: "dashboard", primary: true, group: "Journal" },
  { id: "trades", label: "Trades", short: "Trades", icon: "trades", primary: true, group: "Journal" },
  { id: "add-trade", label: "Add Trade", short: "Add", icon: "add", primary: true, group: "Journal" },
  { id: "analytics", label: "Analytics", short: "Stats", icon: "analytics", primary: true, group: "Analysis" },
  { id: "journal", label: "Journal", short: "Journal", icon: "journal", primary: true, group: "Journal" },
  { id: "strategies", label: "Strategies", short: "Plays", icon: "strategy", primary: false, group: "Setup" },
  { id: "risk", label: "Risk & Plan", short: "Risk", icon: "risk", primary: false, group: "Setup" },
  { id: "settings", label: "Data & Settings", short: "Data", icon: "settings", primary: false, group: "Setup" },
];

/**
 * The admin entry point, kept OUT of NAV_ITEMS on purpose.
 *
 * NAV_ITEMS drives the sidebar and the mobile bottom bar for everyone. The
 * admin item must be conditional on a server answer, so it is rendered
 * separately in App.tsx and lives here only so `navItem()` can title the page.
 */
export const ADMIN_NAV_ITEM: NavItem = {
  id: "admin",
  label: "Admin",
  short: "Admin",
  icon: "shield",
  primary: false,
  group: "Setup",
};

export function navItem(id: PageId): NavItem {
  if (id === "admin") return ADMIN_NAV_ITEM;
  return NAV_ITEMS.find((n) => n.id === id) ?? (NAV_ITEMS[0] as NavItem);
}

export const PRIMARY_NAV = NAV_ITEMS.filter((n) => n.primary);
