(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ScanScreen from './ScanScreen';

// Mock expo-camera native module for Jest
jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

describe('ScanScreen Component & QR Validation', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockReset();
  });

  it('renders scan screen title and manual entry controls', async () => {
    const { getByText, getByPlaceholderText } = await render(
      <ScanScreen onBack={jest.fn()} onScanSuccess={jest.fn()} />
    );

    expect(getByText('Scan Ticket QR')).toBeTruthy();
    expect(getByPlaceholderText('e.g. TICKET-UUID-12345')).toBeTruthy();
  });

  it('verifies a valid ticket and completes check-in confirmation', async () => {
    const mockScanSuccess = jest.fn();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          valid: true,
          ticket: { id: '101', identifier: 'VALID-QR-101', status: 'valid' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: '101',
          identifier: 'VALID-QR-101',
          status: 'used',
        }),
      });

    const { getByTestId, findByDisplayValue, findByText } = await render(
      <ScanScreen authToken="test-token" onBack={jest.fn()} onScanSuccess={mockScanSuccess} />
    );

    const input = getByTestId('manual-input');
    fireEvent.changeText(input, 'VALID-QR-101');
    await findByDisplayValue('VALID-QR-101');

    fireEvent.press(getByTestId('simulate-button'));

    expect(mockScanSuccess).toHaveBeenCalledWith('VALID-QR-101');
    expect(
      await findByText('Ticket Verified! Ready for Check-In.', {}, { timeout: 3000 })
    ).toBeTruthy();

    const confirmBtn = await findByText('Confirm Check-In', {}, { timeout: 3000 });
    fireEvent.press(confirmBtn);

    expect(
      await findByText('Check-In Confirmed Successfully!', {}, { timeout: 3000 })
    ).toBeTruthy();
  });

  it('warns when ticket is already used and hides check-in button', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        valid: false,
        ticket: { id: '102', identifier: 'USED-QR-102', status: 'used' },
      }),
    });

    const { getByTestId, findByDisplayValue, findByText, queryByText } = await render(
      <ScanScreen authToken="test-token" onBack={jest.fn()} />
    );

    fireEvent.changeText(getByTestId('manual-input'), 'USED-QR-102');
    await findByDisplayValue('USED-QR-102');
    fireEvent.press(getByTestId('simulate-button'));

    expect(await findByText('Ticket Status: USED', {}, { timeout: 3000 })).toBeTruthy();
    expect(queryByText('Confirm Check-In')).toBeNull();
  });

  it('warns when ticket is cancelled or refunded', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        valid: false,
        ticket: { id: '103', identifier: 'REFUNDED-QR-103', status: 'refunded' },
      }),
    });

    const { getByTestId, findByDisplayValue, findByText, queryByText } = await render(
      <ScanScreen authToken="test-token" onBack={jest.fn()} />
    );

    fireEvent.changeText(getByTestId('manual-input'), 'REFUNDED-QR-103');
    await findByDisplayValue('REFUNDED-QR-103');
    fireEvent.press(getByTestId('simulate-button'));

    expect(await findByText('Ticket Status: REFUNDED', {}, { timeout: 3000 })).toBeTruthy();
    expect(queryByText('Confirm Check-In')).toBeNull();
  });

  it('displays error banner when QR verification fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Ticket not found for this event.' }),
    });

    const { getByTestId, findByDisplayValue, findByText } = await render(
      <ScanScreen authToken="test-token" onBack={jest.fn()} />
    );

    fireEvent.changeText(getByTestId('manual-input'), 'INVALID-QR-999');
    await findByDisplayValue('INVALID-QR-999');
    fireEvent.press(getByTestId('simulate-button'));

    expect(
      await findByText('Ticket not found for this event.', {}, { timeout: 3000 })
    ).toBeTruthy();
  });
});