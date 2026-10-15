import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

function mockFetch(impl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

afterEach(() => vi.unstubAllGlobals());

describe('App', () => {
  it('shows ready when the API readiness probe succeeds', async () => {
    mockFetch(async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    render(<App />);
    expect(await screen.findByText('Platform API is ready.')).toBeInTheDocument();
  });

  it('shows unavailable on a 503 response', async () => {
    mockFetch(async () => new Response(JSON.stringify({ status: 'unavailable' }), { status: 503 }));
    render(<App />);
    expect(await screen.findByText('Platform API is unavailable.')).toBeInTheDocument();
  });

  it('shows unavailable when the network fails and recovers on re-check', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(await screen.findByText('Platform API is unavailable.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(screen.getByText('Platform API is ready.')).toBeInTheDocument());
  });

  it('includes the estimate disclaimer', () => {
    mockFetch(() => new Promise(() => undefined));
    render(<App />);
    expect(
      screen.getByText(/not loan offers, approvals, or financial advice/i),
    ).toBeInTheDocument();
  });
});
