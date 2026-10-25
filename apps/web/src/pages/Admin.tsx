/**
 * The super-admin page.
 *
 * WHAT THIS PAGE IS ALLOWED TO KNOW
 *   That users exist, what they signed up with, when they joined, and roughly
 *   how much they use the app — as counts. Nothing about what anyone traded.
 *
 *   That boundary is not enforced here. It is enforced in the database, by the
 *   `admin_user_overview` view's WHERE clause and by the absence of any policy
 *   letting an admin read the trades table. This page could be edited to ask
 *   for a symbol or a balance and the request would simply return nothing.
 *   Section 12–16 of supabase/tests/rls_isolation_test.sql asserts exactly
 *   that, so the boundary is a tested property rather than a comment.
 *
 * WHY THERE IS NO SEPARATE ADMIN URL
 *   The route is reachable only when `isAdmin` is true, and `isAdmin` is the
 *   server's answer to a question asked after sign-in. A dedicated /admin
 *   login page would be a signpost and a false boundary; this is neither.
 */

import { useCallback, useEffect, useState } from "react";
import { useApp } from "../lib/appContext";
import type { AdminOverview, AdminUserSummary } from "../lib/store";
import {
  Banner,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  icons,
  PastelStat,
} from "../components/ui";
import { fmtDateTime } from "../components/format";

export function AdminPage() {
  const { store, user } = useApp();

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!store.loadAdminOverview) {
      setState("error");
      setError("This store cannot provide the users overview. Sign in against the shared database.");
      return;
    }

    setState("loading");
    setError(null);

    const result = await store.loadAdminOverview();
    if (result.error) {
      setState("error");
      setError(result.error);
      return;
    }

    setOverview(result.data);
    setState("ready");
  }, [store]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleAdmin(target: AdminUserSummary) {
    if (!store.setAdminFlag) return;

    setBusyUser(target.userId);
    setNotice(null);

    const result = await store.setAdminFlag(target.userId, !target.isAdmin);
    setBusyUser(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setNotice(
      target.isAdmin
        ? `${target.displayName} is no longer an admin.`
        : `${target.displayName} is now an admin. They will see this page on their next sign-in.`
    );
    await load();
  }

  if (state === "loading") {
    return <LoadingState label="Loading the users overview" />;
  }

  if (state === "error") {
    return <ErrorState title="Could not load the users overview" message={error ?? "Unknown error."} onRetry={load} />;
  }

  if (!overview || overview.users.length === 0) {
    // Zero rows is also what a non-admin gets from the view, so say that rather
    // than claiming the database is empty — which would be a different, false,
    // statement.
    return (
      <EmptyState title="No users visible" icon={icons.users}>
        The overview returned no rows. If you expected to see accounts here, check that your own
        profile has <code className="mono">is_admin = true</code> in the database — the view returns
        nothing at all to a caller who is not an admin.
      </EmptyState>
    );
  }

  const t = overview.totals;

  return (
    <div className="stack">
      <div className="admin-banner">
        <span className="admin-banner-icon" aria-hidden="true">
          <Icon path={icons.shield} size={17} />
        </span>
        <div>
          <strong>Super-admin view.</strong> You can see that these accounts exist. You cannot read
          anyone's trades, journal, balances or screenshots — the database returns nothing for them,
          whatever this page asks.
        </div>
      </div>

      {notice ? (
        <Banner tone="accent" title="Updated">
          {notice}
        </Banner>
      ) : null}

      {error ? (
        <Banner tone="danger" title="Something went wrong">
          {error}
        </Banner>
      ) : null}

      <section className="grid grid-4">
        <PastelStat
          tone="coral"
          label="Registered users"
          value={t.userCount.toLocaleString()}
          hint={`${t.adminCount} admin${t.adminCount === 1 ? "" : "s"}`}
        />
        <PastelStat
          tone="yellow"
          label="New in 7 days"
          value={t.newUsers7d.toLocaleString()}
          hint={t.newUsers7d === 0 ? "No sign-ups this week" : "Sign-ups since a week ago"}
        />
        <PastelStat
          tone="pink"
          label="Trades recorded"
          value={t.tradeCount.toLocaleString()}
          hint="Across every account, deleted trades excluded"
        />
        <PastelStat
          tone="blue"
          label="Journal entries"
          value={t.journalCount.toLocaleString()}
          hint="Across every account"
        />
      </section>

      <section className="panel panel-cool">
        <div className="panel-head">
          <div>
            <div className="panel-title">Users</div>
            <div className="panel-desc">
              Newest first. Counts only — this table deliberately has no column for performance,
              balance or instrument.
            </div>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => void load()}>
            <Icon path={icons.spark} />
            Refresh
          </button>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th className="num">Trades</th>
                <th className="num">Journal</th>
                <th>Joined</th>
                <th>Last active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {overview.users.map((u) => {
                const isSelf = u.userId === user?.id;
                return (
                  <tr key={u.userId}>
                    <td>
                      <div className="row">
                        <span className={`avatar${u.isAdmin ? " is-admin" : ""}`} aria-hidden="true">
                          {initials(u.displayName, u.email)}
                        </span>
                        <span style={{ fontWeight: 600 }}>{u.displayName}</span>
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: 12.5 }}>
                      {u.email ?? <span className="na">N/A</span>}
                    </td>
                    <td>
                      {u.isAdmin ? (
                        <span className="badge badge-accent">Admin</span>
                      ) : (
                        <span className="badge badge-closed">User</span>
                      )}
                      {isSelf ? (
                        <span className="hint" style={{ marginLeft: 6 }}>
                          you
                        </span>
                      ) : null}
                    </td>
                    <td className="num">{u.tradeCount.toLocaleString()}</td>
                    <td className="num">{u.journalCount.toLocaleString()}</td>
                    <td className="hint" style={{ whiteSpace: "nowrap" }}>
                      {fmtDateTime(u.joinedAt)}
                    </td>
                    <td className="hint" style={{ whiteSpace: "nowrap" }}>
                      {fmtDateTime(u.lastActiveAt)}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busyUser === u.userId || isSelf || !store.setAdminFlag}
                        title={
                          isSelf
                            ? "You cannot change your own admin access."
                            : u.isAdmin
                              ? "Revoke admin access"
                              : "Grant admin access"
                        }
                        onClick={() => void toggleAdmin(u)}
                      >
                        {busyUser === u.userId ? "Working…" : u.isAdmin ? "Revoke" : "Make admin"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-warm">
        <div className="panel-title">What this page cannot do, and why</div>
        <div className="admin-scope" style={{ marginTop: 10 }}>
          <ul>
            <li>
              <strong>It cannot read anyone's trades, exits, journal, strategies, account names,
              balances or screenshots.</strong> There is no policy in
              <code className="mono"> 0002_rls_policies.sql</code> or
              <code className="mono"> 0004_admin_role.sql</code> that grants an admin that access,
              and the isolation suite asserts it.
            </li>
            <li>
              <strong>It cannot see a password, a token or a broker credential.</strong> None of
              those exist in this database — the app has no broker integration, and passwords are
              hashed by Supabase Auth, not stored here.
            </li>
            <li>
              <strong>It cannot delete an account.</strong> Deleting a user's data is not a support
              convenience; it is an irreversible action, and the person who should be able to take
              it is the account holder.
            </li>
            <li>
              <strong>It cannot suspend anyone.</strong> There is no suspension concept in the
              schema. Adding one would need a decision about what happens to that user's records,
              and inventing that decision quietly would be wrong.
            </li>
          </ul>
          <p>
            To bootstrap the first admin there has to be a first admin, so it is done once with
            database access — the exact SQL is at the bottom of
            <code className="mono"> supabase/migrations/0004_admin_role.sql</code>.
          </p>
        </div>
      </section>
    </div>
  );
}

/** Two letters for the avatar. Falls back to the email, then to "?" — never blank. */
function initials(displayName: string, email: string | null): string {
  const source = displayName.trim() || email?.trim() || "";
  if (!source) return "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
