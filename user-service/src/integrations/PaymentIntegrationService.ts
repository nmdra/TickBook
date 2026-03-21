import axios, { AxiosInstance } from 'axios';
import { UpstreamRecord } from '../dtos/auth.dto';
import { logger } from '../utils/logger';

export class PaymentIntegrationService {
  private readonly client: AxiosInstance;

  constructor(baseUrl = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3004') {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 3000,
    });
  }

  async fetchPaymentHistory(userId: number): Promise<UpstreamRecord[]> {
    try {
      const response = await this.client.get<UpstreamRecord[]>(`/api/payments/user/${userId}`);

      if (!Array.isArray(response.data)) {
        logger.warn('[PaymentIntegrationService] payment history response was not an array.');
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

      logger.warn(`[PaymentIntegrationService] Failed to fetch payment history: ${message}`);
      return [];
    }
  }
}
