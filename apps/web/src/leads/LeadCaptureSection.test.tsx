import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeadCaptureSection } from './LeadCaptureSection';

afterEach(() => vi.unstubAllGlobals());

/**
 * Lead-capture UI (docs/05 §4, docs/10 §1). Covers: nothing preselected, contact fields
 * appear only once a purpose is chosen, the submit button stays disabled without contact
 * info, and a successful submission shows a neutral confirmation without ever blocking or
 * replacing the (unrelated, already-rendered) calculator result above it.
 */
describe('LeadCaptureSection', () => {
  it('renders three purpose checkboxes, none preselected, and hides contact fields initially', () => {
    render(
      <LeadCaptureSection
        widgetPublicKey="widget-public-key-0000000000001"
        calculatorType="AFFORDABILITY"
      />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    for (const checkbox of checkboxes) {
      expect(checkbox).not.toBeChecked();
    }
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('shows contact fields and the matching disclosure text once a purpose is checked', async () => {
    const user = userEvent.setup();
    render(
      <LeadCaptureSection
        widgetPublicKey="widget-public-key-0000000000001"
        calculatorType="AFFORDABILITY"
      />,
    );
    await user.click(screen.getByLabelText('Receive rate or market alerts'));
    expect(screen.getByLabelText('Email')).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByText(/SYNTHETIC PLACEHOLDER/)).toBeInTheDocument();
  });

  it('keeps submit disabled until at least email or phone is entered', async () => {
    const user = userEvent.setup();
    render(
      <LeadCaptureSection
        widgetPublicKey="widget-public-key-0000000000001"
        calculatorType="AFFORDABILITY"
      />,
    );
    await user.click(screen.getByLabelText('Save this scenario'));
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    await user.type(screen.getByLabelText('Email'), 'buyer@example.test');
    expect(screen.getByRole('button', { name: 'Submit' })).not.toBeDisabled();
  });

  it('submits and shows a neutral confirmation without any per-purpose outcome detail', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ received: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <LeadCaptureSection
        widgetPublicKey="widget-public-key-0000000000001"
        calculatorType="AFFORDABILITY"
      />,
    );
    await user.click(screen.getByLabelText('Receive rate or market alerts'));
    await user.type(screen.getByLabelText('Email'), 'buyer@example.test');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/received/i);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/public/leads',
      expect.objectContaining({ method: 'POST', credentials: 'omit' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.consentSelections).toEqual(['RATE_ALERTS']);
    expect(body.contact).toEqual({ email: 'buyer@example.test' });
  });
});
