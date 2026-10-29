import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AttendeeScreen from './AttendeeScreen';

describe('AttendeeScreen Component', () => {
  it('renders attendee screen header and search input', async () => {
    const { getByText, getByPlaceholderText } = await render(
      <AttendeeScreen
        eventId="1"
        eventTitle="Tech Conference 2026"
        authToken="test-token"
        onBack={jest.fn()}
      />
    );

    expect(getByText('Tech Conference 2026')).toBeTruthy();
    expect(getByPlaceholderText('Search by name, email, or ticket ID...')).toBeTruthy();
  });

  it('filters attendees based on search query', async () => {
    const { getByPlaceholderText, getByText, queryByText, findByDisplayValue } = await render(
      <AttendeeScreen
        eventId="1"
        eventTitle="Tech Conference 2026"
        authToken="test-token"
        onBack={jest.fn()}
      />
    );

    const searchInput = getByPlaceholderText('Search by name, email, or ticket ID...');
    fireEvent.changeText(searchInput, 'Alex');

    // Wait for React 19 state update to commit
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

    const searchInput = getByPlaceholderText('Search by name, email, or ticket ID...');
    fireEvent.changeText(searchInput, 'Alex');

    // Wait for React 19 state update to commit
    await findByDisplayValue('Alex');

    const checkInBtn = await findByText('Check In');
    fireEvent.press(checkInBtn);

    await waitFor(() => {
      expect(getAllByText('USED').length).toBeGreaterThan(0);
    });
  });
});