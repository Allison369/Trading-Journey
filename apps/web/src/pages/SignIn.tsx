/**
 * Sign in, sign up and password reset.
 *
 * Shown when the app is using the cloud store. In offline mode there is nobody
 * to sign in as, and the app says so instead of presenting a log-in form that
 * could not possibly work.
 *
 * The sign-in form is the same code path whether the account is an ordinary
 * user or an admin. There is no separate admin login screen, and that is
 * deliberate: a distinct admin URL is a signpost telling an attacker which
 * account to target, and it implies a privilege boundary that is enforced by
 * the route rather than by the database. The role is decided after
 * authentication, by the server, and only changes which screen is drawn.
 */

import { useState, type FormEvent } from "react";
import { describeError, getSupabase } from "../lib/supabase";
import { Banner, Field } from "../components/ui";
import { BrandMark } from "../components/BrandMark";

type Mode = "sign-in" | "sign-up" | "reset";

export function SignInPage({
  initialMode = "sign-in",
  onBack,
}: {
  initialMode?: Mode;
  /** Return to the landing page. Rendered only when there is somewhere to go. */
  onBack?: () => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const client = getSupabase();

  function switchMode(next: Mode) {
    setError(null);
    setMessage(null);
    setMode(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!client) {
      setError("The shared database is not configured, so signing in is unavailable.");
      return;
    }

    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }

    if (mode === "reset") {
      setBusy(true);
      const { error: err } = await client.auth.resetPasswordForEmail(trimmed, {
        redirectTo: window.location.origin,
      });
      setBusy(false);
      if (err) {
        setError(describeError(err));
        return;
      }
      setMessage(
        "If an account exists for that address, a reset link is on its way. Check your inbox and spam folder."
      );
      return;
    }

    if (password.length < 8) {
      setError("Choose a password of at least 8 characters.");
      return;
    }

    if (mode === "sign-up" && password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setBusy(true);

    if (mode === "sign-up") {
      const { error: err } = await client.auth.signUp({
        email: trimmed,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      setBusy(false);
      if (err) {
        setError(describeError(err));
        return;
      }
      setMessage(
        "Account created. If your project requires email confirmation, check your inbox for the link before signing in."
      );
      setMode("sign-in");
      return;
    }

    const { error: err } = await client.auth.signInWithPassword({ email: trimmed, password });
    setBusy(false);
    if (err) {
      setError(describeError(err));
      return;
    }
    // On success the auth listener in AppProvider swaps this page out.
  }

  const heading =
    mode === "sign-in" ? "Welcome back" : mode === "sign-up" ? "Create your journal" : "Reset your password";

  const subheading =
    mode === "sign-in"
      ? "Your journal syncs through the shared database, so the same trades and screenshots appear on every device you sign in from."
      : mode === "sign-up"
        ? "One account holds your trades, strategies, journal and chart screenshots. Nothing here connects to a broker."
        : "We will email you a link to choose a new password.";

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand" style={{ padding: 0, marginBottom: 18 }}>
          <div className="brand-mark">
            <BrandMark />
          </div>
          <div>
            <div className="brand-name">TradeVault</div>
            <div className="brand-sub">Trading journal</div>
          </div>
          {onBack ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: "auto" }}
              onClick={onBack}
            >
              Back
            </button>
          ) : null}
        </div>

        {mode !== "reset" ? (
          <div className="auth-switch" role="tablist" aria-label="Sign in or create an account">
            <button
              type="button"
              role="tab"
              aria-pressed={mode === "sign-in"}
              onClick={() => switchMode("sign-in")}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-pressed={mode === "sign-up"}
              onClick={() => switchMode("sign-up")}
            >
              Create account
            </button>
          </div>
        ) : null}

        <h1 style={{ fontSize: 20, margin: "0 0 6px" }}>{heading}</h1>
        <p className="hint" style={{ marginBottom: 20 }}>
          {subheading}
        </p>

        {error ? (
          <div style={{ marginBottom: 14 }}>
            <Banner tone="danger" title="Could not continue">
              {error}
            </Banner>
          </div>
        ) : null}

        {message ? (
          <div style={{ marginBottom: 14 }}>
            <Banner tone="accent" title="Check your email">
              {message}
            </Banner>
          </div>
        ) : null}

        <form onSubmit={submit} noValidate>
          <div className="stack-sm">
            <Field label="Email" required htmlFor="auth-email">
              <input
                id="auth-email"
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>

            {mode !== "reset" ? (
              <Field
                label="Password"
                required
                htmlFor="auth-password"
                hint={mode === "sign-up" ? "At least 8 characters" : undefined}
              >
                <input
                  id="auth-password"
                  className="input"
                  type="password"
                  autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            ) : null}

            {mode === "sign-up" ? (
              <Field label="Confirm password" required htmlFor="auth-confirm">
                <input
                  id="auth-confirm"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </Field>
            ) : null}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={busy}
            style={{ marginTop: 18 }}
          >
            {busy
              ? "Working…"
              : mode === "sign-in"
                ? "Sign in"
                : mode === "sign-up"
                  ? "Create account"
                  : "Send reset link"}
          </button>
        </form>

        <div className="auth-actions">
          {mode === "sign-in" ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchMode("reset")}>
              Forgot password
            </button>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchMode("sign-in")}>
              Back to sign in
            </button>
          )}
        </div>

        <div className="auth-footnote">
          TradeVault is a journal and analysis tool. It cannot place trades and never asks for
          broker API keys, card details or bank information.
        </div>
      </div>
    </div>
  );
}
