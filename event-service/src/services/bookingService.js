const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || 'http://booking-service:3003';
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || '';

const getBookingById = async (bookingId) => {
  const url = `${BOOKING_SERVICE_URL}/api/bookings/${bookingId}`;
  const response = await fetch(url, {
    headers: INTERNAL_SERVICE_TOKEN 
      ? { 'Authorization': `Bearer ${INTERNAL_SERVICE_TOKEN}` }
      : {}
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch booking ${bookingId}: ${response.statusText}`);
  }

  return response.json();
};

module.exports = { getBookingById };
