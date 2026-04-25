const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || 'http://localhost:3003';
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || '';

const getBookingUrl = (bookingId) => `${BOOKING_SERVICE_URL}/api/bookings/${bookingId}`;

const parseErrorMessage = async (response, fallbackMessage) => {
  try {
    const body = await response.json();
    return body.error || fallbackMessage;
  } catch (err) {
    return fallbackMessage;
  }
};

const getAuthHeaders = (bearerToken) => {
  const token = bearerToken || INTERNAL_SERVICE_TOKEN;

  return token
    ? {
        Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      }
    : {};
};

const getBookingById = async (bookingId, bearerToken) => {
  if (!bookingId) {
    throw new Error('Booking ID is required');
  }

  const response = await fetch(getBookingUrl(bookingId), {
    headers: getAuthHeaders(bearerToken),
  });
  if (!response.ok) {
    const message = await parseErrorMessage(
      response,
      `Booking lookup failed for id: ${bookingId}`
    );
    throw new Error(message);
  }

  return response.json();
};

const updateBookingStatus = async (bookingId, status, bearerToken) => {
  if (!bookingId) {
    throw new Error('Booking ID is required');
  }

  const response = await fetch(`${getBookingUrl(bookingId)}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(bearerToken),
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(
      response,
      `Failed to update booking ${bookingId} to status ${status}`
    );
    throw new Error(message);
  }

  return response.json();
};

module.exports = {
  getBookingById,
  updateBookingStatus,
};
