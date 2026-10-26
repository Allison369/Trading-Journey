/**
 * App shell: navigation, header, banners and the page switch.
 *
 * Navigation is local state rather than a router, which keeps the build a
 * single static bundle with no server rewrites — the app can be hosted from any
 * static file host, or opened from the preview server with no configuration.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useApp } from "./lib/appContext";
import { isCloudConfigured } from "./lib/supabase";
import { useTheme } from "./lib/theme";
import { NAV_ITEMS, PRIMARY_NAV, navItem, type PageId } from "./navigation";
import { Banner, Icon, icons } from "./components/ui";
import { BrandMark } from "./components/BrandMark";

import { DashboardPage } from "./pages/Dashboard";
import { TradesPage } from "./pages/Trades";
import { AddTradePage } from "./pages/AddTrade";
import { AnalyticsPage } from "./pages/Analytics";
import { JournalPage } from "./pages/Journal";
import { StrategiesPage } from "./pages/Strategies";
import { RiskPage } from "./pages/Risk";
import { SettingsPage } from "./pages/Settings";
import { SignInPage } from "./pages/SignIn";
import { LandingPage } from "./pages/Landing";
import { AdminPage } from "./pages/Admin";

/**
 * Where the visitor is before they are inside the app.
 *
 *   * `landing` — the public front page. The default for a signed-out visitor
 *                 on a cloud-configured deployment.
 *   * `sign-in` / `sign-up` — the auth card.
 *   * `app`     — signed in, or running offline where there is nobody to sign
 *                 in as.
 */
type Gate = "landing" | "sign-in" | "sign-up" | "app";

export function App() {
  const { loadState, loadError, reload, isOffline, user, authReady, isAdmin, signOut } = useApp();
  const { theme, toggle } = useTheme();
  const [page, setPage] = useState<PageId>("dashboard");
  const [gate, setGate] = useState<Gate>("landing");

  // Reset scroll when changing section; a long trades table would otherwise
  // leave the next page scrolled half-way down.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [page, gate]);

  // Someone signs in from the auth card; move them through to the app. Also
  // covers the case where a session already exists on load.
  useEffect(() => {
    if (user) setGate("app");
  }, [isOffline, user]);

  const navigate = useCallback((id: PageId) => setPage(id), []);

  // Landing page first. A signed-out visitor should meet the product before a
  // password box, and should be able to read what it is not before signing up.
  // In offline mode there is nobody to sign in as, so the landing page offers
  // a "look around offline" entry into the app instead.
  if (!user && gate === "landing") {
    return (
      <LandingPage
        onSignIn={() => setGate("sign-in")}
        onSignUp={() => setGate("sign-up")}
        onContinueOffline={() => setGate("app")}
        isCloudConfigured={isCloudConfigured()}
        onToggleTheme={toggle}
        theme={theme}
      />
    );
  }

  // The cloud store needs a session before it can read anything.
  if (!authReady && !isOffline) {
    return (
      <div className="auth-shell">
        <div className="auth-card" aria-busy="true">
          <div className="brand" style={{ padding: 0 }}>
            <div className="brand-mark">
              <BrandMark />
            </div>
            <div>
              <div className="brand-name">TradeVault</div>
              <div className="brand-sub">Checking your session</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isOffline && !user) {
    return (
      <SignInPage
        initialMode={gate === "sign-up" ? "sign-up" : "sign-in"}
        onBack={() => setGate("landing")}
      />
    );
  }

  const item = navItem(page);

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <div className="app">
        <Sidebar
          current={page}
          onNavigate={navigate}
          onSignOut={isOffline ? undefined : signOut}
          showAdmin={isAdmin === true}
        />

        <div className="main">
          <header className="topbar">
            <div>
              <h1 className="page-title">{item.label}</h1>
              <div className="page-sub">{pageSubtitle(page)}</div>
            </div>
            <div className="topbar-actions">
              {isAdmin === true && page !== "admin" ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => navigate("admin")}
                  title="Open the super-admin users overview"
                >
                  <Icon path={icons.shield} />
                  Admin
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={toggle}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              >
                <Icon path={theme === "dark" ? icons.sun : icons.moon} />
              </button>
            </div>
          </header>

          <main className="content" id="main-content">
            <StatusBanners />

            {loadState === "error" && loadError ? (
              <div style={{ marginBottom: 16 }}>
                <Banner tone="danger" title="Could not load your journal">
                  {loadError}
                  <div style={{ marginTop: 8 }}>
                    <button type="button" className="btn btn-sm" onClick={() => void reload()}>
                      Try again
                    </button>
                  </div>
                </Banner>
              </div>
            ) : null}

            {page === "dashboard" && <DashboardPage onNavigate={navigate} />}
            {page === "trades" && <TradesPage onNavigate={navigate} />}
            {page === "add-trade" && <AddTradePage onDone={() => navigate("trades")} />}
            {page === "analytics" && <AnalyticsPage />}
            {page === "journal" && <JournalPage />}
            {page === "strategies" && <StrategiesPage onNavigate={navigate} />}
            {page === "risk" && <RiskPage />}
            {page === "settings" && <SettingsPage />}
            {page === "admin" &&
              (isAdmin === true ? (
                <AdminPage />
              ) : (
                <Banner tone="warn" title="Not available">
                  This overview is limited to admin accounts. Your session is not one.
                </Banner>
              ))}
          </main>

          <AppFooter onNavigate={navigate} />
        </div>
      </div>

      <BottomNav current={page} onNavigate={navigate} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Page footer                                                        */
/* ------------------------------------------------------------------ */

/**
 * A full-width dark band that closes every page.
 *
 * It carries the two things worth repeating at the bottom of the screen: what
 * the product is, and what it is not. TradeVault does not place trades and
 * cannot promise a profit, and saying that where the user is most relaxed —
 * at the end of a page — is worth more than saying it once at sign-up.
 */
function AppFooter({ onNavigate }: { onNavigate: (id: PageId) => void }) {
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <div>
          <div className="app-footer-title">TradeVault</div>
          <p className="app-footer-text">
            A journal for reviewing the trades you actually took. It records what happened, computes
            the numbers honestly, and stops there — it does not place trades, and nothing in it
            promises a profit.
          </p>
        </div>
        <div className="app-footer-links">
          <button type="button" onClick={() => onNavigate("dashboard")}>
            Dashboard
          </button>
          <button type="button" onClick={() => onNavigate("trades")}>
            Trades
          </button>
          <button type="button" onClick={() => onNavigate("analytics")}>
            Analytics
          </button>
          <button type="button" onClick={() => onNavigate("journal")}>
            Journal
          </button>
          <button type="button" onClick={() => onNavigate("settings")}>
            Settings
          </button>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* Banners that describe the current data source                      */
/* ------------------------------------------------------------------ */

/**
 * The most important banners in the app.
 *
 * A user must always know whether what they are looking at is their real,
 * synced journal or a browser-local sample set. Getting this wrong is the
 * difference between a useful tool and a fabricated performance report.
 */
function StatusBanners() {
  const { isOffline, user, loadState } = useApp();

  if (isOffline) {
    return (
      <div style={{ marginBottom: 16 }}>
        <Banner tone="warn" title="Offline mode — data is stored in this browser only">
          Supabase is not configured, so TradeVault is running against a local store. Nothing here is
          synced to another device, and clearing your browser data will remove it.
          <br />
          <strong>The trades below are a labelled sample set, not your own records.</strong> Add an
          account to start recording your real trades, or configure{" "}
          <code className="mono">VITE_SUPABASE_URL</code> and{" "}
          <code className="mono">VITE_SUPABASE_ANON_KEY</code> to connect the shared database (see{" "}
          <code className="mono">apps/web/.env.example</code>).
        </Banner>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div style={{ marginBottom: 16 }}>
        <Banner tone="info" title="Syncing">
          Loading your journal from the shared database…
        </Banner>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <Banner tone="info" title="Connected to the shared database">
        Signed in as {user?.email ?? "your account"}. Trades saved here appear in the TradeVault
        mobile app, and vice versa.
      </Banner>
    </div>
  );
}

function pageSubtitle(page: PageId): string {
  switch (page) {
    case "dashboard":
      return "Your realised performance, equity curve and current exposure.";
    case "trades":
      return "Every recorded trade, with the numbers computed from its exits.";
    case "add-trade":
      return "Record a trade. Open trades stay out of your realised statistics.";
    case "analytics":
      return "Breakdowns by strategy, session, market and time.";
    case "journal":
      return "Daily and weekly reviews, goals and lessons.";
    case "strategies":
      return "Your playbooks, checklists and rules.";
    case "risk":
      return "Position sizing and your own configured limits.";
    case "settings":
      return "Import, export, accounts and your data.";
    case "admin":
      return "Who has signed up. Counts only — never what anyone traded.";
    default:
      return "";
  }
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                            */
/* ------------------------------------------------------------------ */

function Sidebar({
  current,
  onNavigate,
  onSignOut,
  showAdmin,
}: {
  current: PageId;
  onNavigate: (id: PageId) => void;
  onSignOut?: () => void;
  showAdmin: boolean;
}) {
  const groups: Array<"Journal" | "Analysis" | "Setup"> = ["Journal", "Analysis", "Setup"];

  return (
    <nav className="sidebar" aria-label="Sections">
      <div className="brand">
        <div className="brand-mark">
          <BrandMark />
        </div>
        <div>
          <div className="brand-name">TradeVault</div>
          <div className="brand-sub">Journal</div>
        </div>
      </div>

      {groups.map((group) => (
        <div key={group}>
          <div className="nav-section">{group}</div>
          {NAV_ITEMS.filter((n) => n.group === group).map((n) => (
            <button
              key={n.id}
              type="button"
              className="nav-item"
              aria-current={current === n.id ? "page" : undefined}
              onClick={() => onNavigate(n.id)}
            >
              <Icon path={icons[n.icon as keyof typeof icons]} className="nav-icon" />
              {n.label}
            </button>
          ))}
        </div>
      ))}

      {/* Rendered only when the database said this account is an admin. The
          button is not the boundary — the policies are — but hiding it avoids
          offering a door that will not open. */}
      {showAdmin ? (
        <div>
          <div className="nav-section">Operator</div>
          <button
            type="button"
            className="nav-item"
            aria-current={current === "admin" ? "page" : undefined}
            onClick={() => onNavigate("admin")}
          >
            <Icon path={icons.shield} className="nav-icon" />
            Admin
          </button>
        </div>
      ) : null}

      <div className="sidebar-footer">
        {onSignOut ? (
          <button type="button" className="nav-item" onClick={onSignOut}>
            <Icon path={icons.logout} className="nav-icon" />
            Sign out
          </button>
        ) : (
          <div className="hint" style={{ padding: "0 12px" }}>
            Offline mode
          </div>
        )}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile bottom navigation                                           */
/* ------------------------------------------------------------------ */

function BottomNav({ current, onNavigate }: { current: PageId; onNavigate: (id: PageId) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {PRIMARY_NAV.map((n) => (
        <button
          key={n.id}
          type="button"
          className="bottom-nav-item"
          aria-current={current === n.id ? "page" : undefined}
          onClick={() => onNavigate(n.id)}
        >
          <Icon path={icons[n.icon as keyof typeof icons]} size={19} />
          {n.short}
        </button>
      ))}
    </nav>
  );
}

export type { PageId, ReactNode };
