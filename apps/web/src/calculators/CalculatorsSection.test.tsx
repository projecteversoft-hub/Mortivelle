import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalculatorsSection } from './CalculatorsSection';

afterEach(() => vi.unstubAllGlobals());

/**
 * Accessibility smoke tests (docs/11 §4 "accessibility smoke tests"; docs/10 §5 / docs/05
 * §5): every input's label is programmatically associated, every validation error is
 * exposed via `aria-describedby` (not color-only), and the whole flow — including switching
 * calculators and triggering a validation error — is reachable by keyboard alone.
 */
describe('CalculatorsSection accessibility', () => {
  it('renders all three calculators as labeled tabs, defaulting to Affordability', () => {
    render(<CalculatorsSection />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'Affordability' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Monthly payment & true cost' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('programmatically associates every visible numeric input with its label', () => {
    render(<CalculatorsSection />);
    // getByLabelText throws if an input exists without a correctly-associated <label>. The
    // required fields' labels end with a visual "*" (rendered as a separate span, hence the
    // non-exact match below) in addition to the `aria-required` attribute already asserted
    // elsewhere, so screen readers announce "required" either way.
    expect(screen.getByLabelText(/^Gross monthly household income/)).toBeInstanceOf(
      HTMLInputElement,
    );
    expect(screen.getByLabelText('Recurring monthly debt payments')).toBeInstanceOf(
      HTMLInputElement,
    );
    expect(screen.getByLabelText(/Estimated interest rate/)).toBeInstanceOf(HTMLInputElement);
  });

  it('switches calculators via keyboard-operable tab buttons without a page navigation', async () => {
    const user = userEvent.setup();
    render(<CalculatorsSection />);
    const rentVsBuyTab = screen.getByRole('tab', { name: 'Rent vs. buy' });
    rentVsBuyTab.focus();
    expect(rentVsBuyTab).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(rentVsBuyTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText(/^Current monthly rent/)).toBeInstanceOf(HTMLInputElement);
  });

  it('shows no validation error before the user interacts with a required field', () => {
    render(<CalculatorsSection />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('exposes a validation error via aria-describedby once a required field is touched and left invalid', async () => {
    const user = userEvent.setup();
    render(<CalculatorsSection />);
    const income = screen.getByLabelText(/^Gross monthly household income/);
    await user.click(income);
    await user.tab(); // blur without typing anything -> "Required"

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/required/i);
    expect(income).toHaveAttribute('aria-invalid', 'true');
    expect(income.getAttribute('aria-describedby')).toContain(alert.id);
  });

  it('computes a result entirely client-side (no network request) once valid input is entered', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const user = userEvent.setup();
    render(<CalculatorsSection />);
    const income = screen.getByLabelText(/^Gross monthly household income/);
    await user.type(income, '10000');
    expect(await screen.findByText('Estimated purchase budget')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('labels an illustrative default as such, not as a live rate, via helper text', () => {
    render(<CalculatorsSection />);
    expect(screen.getByText(/Illustrative default: 6\.5%\/yr/)).toBeInTheDocument();
  });

  it('always shows the estimate disclaimer once a result is computed', async () => {
    const user = userEvent.setup();
    render(<CalculatorsSection />);
    await user.type(screen.getByLabelText(/^Gross monthly household income/), '10000');
    expect(
      await screen.findByText(/not loan offers, approvals, or financial advice/i),
    ).toBeInTheDocument();
  });

  it('never claims a verdict on rent vs. buy: both breakdowns are shown side by side', async () => {
    const user = userEvent.setup();
    render(<CalculatorsSection />);
    await user.click(screen.getByRole('tab', { name: 'Rent vs. buy' }));
    await user.type(screen.getByLabelText(/^Current monthly rent/), '1800');
    await user.type(screen.getByLabelText(/^Purchase price/), '300000');

    expect(await screen.findByText('Renting breakdown')).toBeInTheDocument();
    expect(screen.getByText('Buying breakdown')).toBeInTheDocument();
    expect(screen.getByText(/highly sensitive/i)).toBeInTheDocument();
  });

  it('rejects a down payment at or above the purchase price with an accessible, field-adjacent error', async () => {
    const user = userEvent.setup();
    render(<CalculatorsSection />);
    await user.click(screen.getByRole('tab', { name: 'Monthly payment & true cost' }));
    const price = screen.getByLabelText(/^Purchase price/);
    const down = within(
      screen.getByRole('tabpanel', { name: 'Monthly payment & true cost' }),
    ).getByLabelText('Down payment');
    await user.type(price, '300000');
    await user.type(down, '300000');
    await user.tab();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/less than the purchase price/i);
    expect(down).toHaveAttribute('aria-invalid', 'true');
  });
});
