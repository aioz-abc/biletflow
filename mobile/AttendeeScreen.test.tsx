(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AttendeeScreen from './AttendeeScreen';

const MOCK_ATTENDEES = [
  {
    id: '1',
    identifier: 'TICK-1001',
    status: 'valid',
    attendee_name: 'Alex Johnson',
    attendee_email: 'alex@example.com',
    order_item: { ticket_type: { name: 'VIP Pass' } },
  },
  {
    id: '2',
    identifier: 'TICK-1002',
    status: 'used',
    attendee_name: 'Maria Garcia',
    attendee_email: 'maria@example.com',
    order_item: { ticket_type: { name: 'General Admission' } },
  },
  {
    id: '3',
    identifier: 'TICK-1003',
    status: 'cancelled',
    attendee_name: 'David Smith',
    attendee_email: 'david@example.com',
    order_item: { ticket_type: { name: 'Early Bird' } },
  },
];

describe('AttendeeScreen Component', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockFetch.mockReset();
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/check-in/')) {
        return {
          ok: true,
          json: async () => ({ id: '1', identifier: 'TICK-1001', status: 'used' }),
        };
      }
      return {
        ok: true,
        json: async () => MOCK_ATTENDEES,
      };
    });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('renders attendee screen header and search input', async () => {
    const { getByText, getByPlaceholderText, findByText } = await render(
      <AttendeeScreen
        eventId="1"
        eventTitle="Tech Conference 2026"
        authToken="test-token"
        onBack={jest.fn()}
      />
    );

    expect(getByText('Tech Conference 2026')).toBeTruthy();
    expect(getByPlaceholderText('Search by name, email, or ticket ID...')).toBeTruthy();
    expect(await findByText('Alex Johnson')).toBeTruthy();
  });

  it('filters attendees based on search query', async () => {
    const { getByPlaceholderText, getByText, queryByText, findByDisplayValue, findByText } =
      await render(
        <AttendeeScreen
          eventId="1"
          eventTitle="Tech Conference 2026"
          authToken="test-token"
          onBack={jest.fn()}
        />
      );

    await findByText('Alex Johnson');

    const searchInput = getByPlaceholderText('Search by name, email, or ticket ID...');
    fireEvent.changeText(searchInput, 'Alex');
    await findByDisplayValue('Alex');

    await waitFor(() => {
      expect(getByText('Alex Johnson')).toBeTruthy();
      expect(queryByText('Maria Garcia')).toBeNull();
    });
  });

  it('triggers manual check-in action on button press', async () => {
    const { getByPlaceholderText, getAllByText, findByText, findByDisplayValue } = await render(
      <AttendeeScreen
        eventId="1"
        eventTitle="Tech Conference 2026"
        authToken="test-token"
        onBack={jest.fn()}
      />
    );

    await findByText('Alex Johnson');

    const searchInput = getByPlaceholderText('Search by name, email, or ticket ID...');
    fireEvent.changeText(searchInput, 'Alex');
    await findByDisplayValue('Alex');

    const checkInBtn = await findByText('Check In');
    fireEvent.press(checkInBtn);

    await waitFor(() => {
      expect(getAllByText('USED').length).toBeGreaterThan(0);
    });
  });
});