import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ScanScreen from './ScanScreen';

// Mock expo-camera native module for Jest
jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

describe('ScanScreen Component', () => {
  it('renders scan screen title and manual entry controls', async () => {
    const { getByText, getByPlaceholderText } = await render(
      <ScanScreen onBack={jest.fn()} onScanSuccess={jest.fn()} />
    );

    expect(getByText('Scan Ticket QR')).toBeTruthy();
    expect(getByPlaceholderText('e.g. TICKET-UUID-12345')).toBeTruthy();
  });

  it('triggers onScanSuccess when simulate scan is pressed', async () => {
    const mockScanSuccess = jest.fn();
    const { getByTestId, findByDisplayValue } = await render(
      <ScanScreen onBack={jest.fn()} onScanSuccess={mockScanSuccess} />
    );

    const input = getByTestId('manual-input');
    fireEvent.changeText(input, 'TEST-TICKET-999');

    // Wait for React 19 state update to commit before pressing
    await findByDisplayValue('TEST-TICKET-999');

    const simulateButton = getByTestId('simulate-button');
    fireEvent.press(simulateButton);

    expect(mockScanSuccess).toHaveBeenCalledWith('TEST-TICKET-999');
  });
});