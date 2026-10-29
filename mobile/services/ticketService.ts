import { API_BASE_URL } from '../config';

export interface Ticket {
  id: string;
  identifier: string;
  status: 'valid' | 'used' | 'cancelled' | 'refunded';
  attendee_name?: string;
  attendee_email?: string;
  order_item?: {
    ticket_type?: {
      name: string;
    };
  };
}

export interface VerifyResponse {
  valid: boolean;
  ticket: Ticket;
}

export const verifyTicket = async (
  qrToken: string,
  authToken: string,
  ticketId?: string
): Promise<VerifyResponse> => {
  const url = ticketId 
    ? `${API_BASE_URL}/tickets/${ticketId}/verify/` 
    : `${API_BASE_URL}/tickets/verify/`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ qr_token: qrToken }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Ticket verification failed');
  }

  return response.json();
};

export const checkInTicket = async (
  qrToken: string,
  authToken: string,
  ticketId?: string
): Promise<Ticket> => {
  const url = ticketId 
    ? `${API_BASE_URL}/tickets/${ticketId}/check-in/` 
    : `${API_BASE_URL}/tickets/check-in/`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ qr_token: qrToken }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Check-in failed');
  }

  return response.json();
};

export const fetchEventAttendees = async (
  eventId: string,
  authToken: string
): Promise<Ticket[]> => {
  const response = await fetch(`${API_BASE_URL}/events/${eventId}/attendees/`, {
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch event attendees');
  }

  return response.json();
};