import axios, { AxiosInstance } from 'axios';
import { UpstreamRecord } from '../dtos/auth.dto';
import { logger } from '../utils/logger';

export class BookingIntegrationService {
  private readonly client: AxiosInstance;

  constructor(baseUrl = process.env.BOOKING_SERVICE_URL || 'http://localhost:3003') {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 3000,
    });
  }

  async fetchRecentBookings(userId: string): Promise<UpstreamRecord[]> {
    try {
      const response = await this.client.get<UpstreamRecord[]>(`/api/bookings/user/${userId}`);

      if (!Array.isArray(response.data)) {
        logger.warn('[BookingIntegrationService] recent bookings response was not an array.');
        return [];
      }

      return response.data;
    } catch (error) {
      const message =
        axios.isAxiosError(error)
          ? `${error.message}${error.response ? ` (status ${error.response.status})` : ''}`
          : error instanceof Error
            ? error.message
            : 'Unknown error';

      logger.warn(`[BookingIntegrationService] Failed to fetch recent bookings: ${message}`);
      return [];
    }
  }
}
