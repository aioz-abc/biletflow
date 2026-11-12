import { verifyTicket, checkInTicket, fetchEventAttendees } from './ticketService';
import { API_BASE_URL } from '../config';

describe('ticketService QR validation & check-in API', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockReset();
  });

  it('sends POST request with auth header and returns valid ticket data', async () => {
    const mockResponse = {
      valid: true,
      ticket: { id: '42', identifier: 'QR-VALID-1', status: 'valid' },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await verifyTicket('QR-VALID-1', 'staff-jwt-token');

    expect(mockFetch).toHaveBeenCalledWith(`${API_BASE_URL}/tickets/verify/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer staff-jwt-token',
      },
      body: JSON.stringify({ qr_token: 'QR-VALID-1' }),
    });
    expect(result.valid).toBe(true);
    expect(result.ticket.status).toBe('valid');
  });

  it('throws backend detail error when QR token is invalid or tampered', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Invalid QR signature.' }),
    });

    await expect(verifyTicket('BAD-QR', 'staff-jwt-token')).rejects.toThrow(
      'Invalid QR signature.'
    );
  });

  it('calls ticket-specific check-in endpoint when ticketId is provided', async () => {
    const updatedTicket = { id: '42', identifier: 'QR-VALID-1', status: 'used' };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => updatedTicket,
    });

    const result = await checkInTicket('QR-VALID-1', 'staff-jwt-token', '42');

    expect(mockFetch).toHaveBeenCalledWith(`${API_BASE_URL}/tickets/42/check-in/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer staff-jwt-token',
      },
      body: JSON.stringify({ qr_token: 'QR-VALID-1' }),
    });
    expect(result.status).toBe('used');
  });

  it('throws error when attempting to check in an already-used ticket', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Ticket has already been checked in.' }),
    });

    await expect(checkInTicket('QR-USED-1', 'staff-jwt-token', '42')).rejects.toThrow(
      'Ticket has already been checked in.'
    );
  });

  it('fetches event attendees list with authorization header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: '1', identifier: 'TICK-1', status: 'valid' }],
    });

    const attendees = await fetchEventAttendees('10', 'staff-jwt-token');

    expect(mockFetch).toHaveBeenCalledWith(`${API_BASE_URL}/events/10/attendees/`, {
      headers: {
        Authorization: 'Bearer staff-jwt-token',
      },
    });
    expect(attendees).toHaveLength(1);
  });
});