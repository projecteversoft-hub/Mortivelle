import { useState } from 'react';
import type { FormEvent } from 'react';
import { login, ApiRequestError } from './api';

export function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      onLoggedIn();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.apiError.message
          : err instanceof Error
            ? err.message
            : 'Sign-in failed.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Agent sign-in</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Sign in to manage your organization&rsquo;s widgets.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Email
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-paper-line bg-paper-raised px-3 py-2 text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-paper-line bg-paper-raised px-3 py-2 text-ink"
          />
        </label>

        {error ? (
          <p role="alert" className="text-sm font-medium text-bad">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
