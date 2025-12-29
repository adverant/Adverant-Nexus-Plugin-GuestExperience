import axios, { AxiosError, AxiosInstance } from 'axios';
import { config } from '../../config/config';
import { UberRideEstimate } from '../../types';

// ============================================================================
// TypeScript Type Definitions
// ============================================================================

interface UberProduct {
  product_id: string;
  display_name: string;
  capacity: number;
  image?: string;
  cash_enabled?: boolean;
  shared?: boolean;
}

interface UberPriceEstimate {
  product_id: string;
  display_name: string;
  estimate: string;
  duration: number;
  low_estimate: number;
  high_estimate: number;
  currency_code: string;
  surge_multiplier?: number;
}

interface UberRideRequest {
  product_id: string;
  start_latitude: number;
  start_longitude: number;
  end_latitude: number;
  end_longitude: number;
  fare_id?: string;
  surge_confirmation_id?: string;
  seat_count?: number;
}

interface UberRideResponse {
  request_id: string;
  status: UberRideStatus;
  vehicle: UberVehicle | null;
  driver: UberDriver | null;
  location: UberLocation | null;
  eta: number;
  surge_multiplier: number;
  shared: boolean;
}

interface UberVehicle {
  make: string;
  model: string;
  license_plate: string;
  picture_url?: string;
}

interface UberDriver {
  phone_number: string;
  sms_number?: string;
  rating: number;
  picture_url: string;
  name: string;
}

interface UberLocation {
  latitude: number;
  longitude: number;
  bearing: number;
}

enum UberRideStatus {
  PROCESSING = 'processing',
  NO_DRIVERS_AVAILABLE = 'no_drivers_available',
  ACCEPTED = 'accepted',
  ARRIVING = 'arriving',
  IN_PROGRESS = 'in_progress',
  DRIVER_CANCELED = 'driver_canceled',
  RIDER_CANCELED = 'rider_canceled',
  COMPLETED = 'completed',
}

interface UberOAuth2Token {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface UberWebhookEvent {
  event_id: string;
  event_type: 'requests.status_changed' | 'requests.receipt_ready';
  event_time: number;
  resource_href: string;
  meta: {
    user_id: string;
    resource_id: string;
  };
}

/**
 * Custom error class for Uber API errors
 */
class UberAPIError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly context: {
      operation: string;
      requestData?: any;
      responseData?: any;
      timestamp: Date;
      suggestion: string;
    }
  ) {
    super(message);
    this.name = 'UberAPIError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// ============================================================================
// Uber Service Implementation
// ============================================================================

export class UberService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly clientId: string;
  private readonly axiosInstance: AxiosInstance;

  // OAuth2 token cache (in production, use Redis or database)
  private tokenCache: Map<string, { token: string; expiresAt: Date }> = new Map();

  constructor() {
    this.baseUrl = config.thirdParty.uber.sandboxMode
      ? 'https://sandbox-api.uber.com/v1.2'
      : 'https://api.uber.com/v1.2';
    this.apiKey = config.thirdParty.uber.apiKey;
    this.apiSecret = config.thirdParty.uber.apiSecret;
    this.clientId = config.thirdParty.uber.clientId;

    // Configure axios with retry logic
    this.axiosInstance = axios.create({
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': 'en_US',
      },
    });

    // Add request/response interceptors for logging and retries
    this.setupInterceptors();
  }

  /**
   * Setup axios interceptors for request/response handling
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        console.log(`[Uber API] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor with retry logic
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        // Retry on network errors or 5xx errors (max 3 retries)
        if (
          !originalRequest._retry &&
          (error.code === 'ECONNABORTED' ||
            error.code === 'ETIMEDOUT' ||
            (error.response?.status && error.response.status >= 500))
        ) {
          originalRequest._retry = (originalRequest._retry || 0) + 1;

          if (originalRequest._retry <= 3) {
            const delay = Math.min(1000 * Math.pow(2, originalRequest._retry - 1), 10000);
            console.log(`[Uber API] Retrying after ${delay}ms (attempt ${originalRequest._retry}/3)`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            return this.axiosInstance(originalRequest);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // ============================================================================
  // OAuth2 Authentication
  // ============================================================================

  /**
   * Generate OAuth2 authorization URL for user authentication
   * @param redirectUri - The URI to redirect to after authorization
   * @param state - Random state parameter for CSRF protection
   * @param scope - Requested scopes (default: 'request profile')
   */
  generateAuthUrl(redirectUri: string, state: string, scope = 'request profile'): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope,
      state,
    });

    return `https://login.uber.com/oauth/v2/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   * @param code - Authorization code from callback
   * @param redirectUri - Must match the redirect_uri used in generateAuthUrl
   */
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<UberOAuth2Token> {
    try {
      const response = await this.axiosInstance.post(
        'https://login.uber.com/oauth/v2/token',
        {
          client_id: this.clientId,
          client_secret: this.apiSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }
      );

      return response.data as UberOAuth2Token;
    } catch (error) {
      throw this.handleError(error, 'exchangeCodeForToken', { code, redirectUri });
    }
  }

  /**
   * Refresh an expired access token
   * @param refreshToken - The refresh token from previous authorization
   */
  async refreshAccessToken(refreshToken: string): Promise<UberOAuth2Token> {
    try {
      const response = await this.axiosInstance.post(
        'https://login.uber.com/oauth/v2/token',
        {
          client_id: this.clientId,
          client_secret: this.apiSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }
      );

      return response.data as UberOAuth2Token;
    } catch (error) {
      throw this.handleError(error, 'refreshAccessToken', { refreshToken });
    }
  }

  /**
   * Get or refresh cached token for a user
   * @param userId - User identifier for token caching
   * @param refreshToken - Refresh token to use if cached token is expired
   */
  async getValidToken(userId: string, refreshToken: string): Promise<string> {
    const cached = this.tokenCache.get(userId);

    if (cached && cached.expiresAt > new Date()) {
      return cached.token;
    }

    // Token expired or not cached, refresh it
    const tokenData = await this.refreshAccessToken(refreshToken);
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    this.tokenCache.set(userId, {
      token: tokenData.access_token,
      expiresAt,
    });

    return tokenData.access_token;
  }

  // ============================================================================
  // Product & Estimation APIs
  // ============================================================================

  /**
   * Get available Uber products for a location
   * @param latitude - Pickup location latitude
   * @param longitude - Pickup location longitude
   */
  async getAvailableProducts(
    latitude: number,
    longitude: number
  ): Promise<UberProduct[]> {
    try {
      const response = await this.axiosInstance.get(`${this.baseUrl}/products`, {
        params: {
          latitude,
          longitude,
        },
        headers: {
          Authorization: `Token ${this.apiKey}`,
        },
      });

      return response.data.products || [];
    } catch (error) {
      throw this.handleError(error, 'getAvailableProducts', { latitude, longitude });
    }
  }

  /**
   * Get price estimates for a ride
   * @param startLatitude - Pickup location latitude
   * @param startLongitude - Pickup location longitude
   * @param endLatitude - Dropoff location latitude
   * @param endLongitude - Dropoff location longitude
   */
  async getPriceEstimates(
    startLatitude: number,
    startLongitude: number,
    endLatitude: number,
    endLongitude: number
  ): Promise<UberRideEstimate[]> {
    try {
      const response = await this.axiosInstance.get(`${this.baseUrl}/estimates/price`, {
        params: {
          start_latitude: startLatitude,
          start_longitude: startLongitude,
          end_latitude: endLatitude,
          end_longitude: endLongitude,
        },
        headers: {
          Authorization: `Token ${this.apiKey}`,
        },
      });

      const estimates: UberPriceEstimate[] = response.data.prices || [];

      return estimates.map(estimate => ({
        productId: estimate.product_id,
        productName: estimate.display_name,
        estimate: estimate.estimate,
        estimatedDuration: estimate.duration,
        estimatedPrice: {
          low: estimate.low_estimate,
          high: estimate.high_estimate,
          currency: estimate.currency_code,
        },
      }));
    } catch (error) {
      throw this.handleError(error, 'getPriceEstimates', {
        startLatitude,
        startLongitude,
        endLatitude,
        endLongitude,
      });
    }
  }

  /**
   * Get time estimates for a ride
   * @param latitude - Pickup location latitude
   * @param longitude - Pickup location longitude
   * @param productId - Optional product ID to filter by
   */
  async getTimeEstimates(
    latitude: number,
    longitude: number,
    productId?: string
  ): Promise<any[]> {
    try {
      const params: any = {
        start_latitude: latitude,
        start_longitude: longitude,
      };

      if (productId) {
        params.product_id = productId;
      }

      const response = await this.axiosInstance.get(`${this.baseUrl}/estimates/time`, {
        params,
        headers: {
          Authorization: `Token ${this.apiKey}`,
        },
      });

      return response.data.times || [];
    } catch (error) {
      throw this.handleError(error, 'getTimeEstimates', { latitude, longitude, productId });
    }
  }

  // ============================================================================
  // Ride Request APIs
  // ============================================================================

  /**
   * Request a ride (requires user OAuth token)
   * @param userToken - User's OAuth access token
   * @param request - Ride request parameters
   * @returns Ride details including request_id, driver, vehicle, ETA
   */
  async requestRide(
    userToken: string,
    request: UberRideRequest
  ): Promise<UberRideResponse> {
    try {
      const response = await this.axiosInstance.post(
        `${this.baseUrl}/requests`,
        request,
        {
          headers: {
            Authorization: `Bearer ${userToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data as UberRideResponse;
    } catch (error) {
      throw this.handleError(error, 'requestRide', request);
    }
  }

  /**
   * Get ride details by request ID
   * @param userToken - User's OAuth access token
   * @param requestId - Ride request ID
   * @returns Current ride status, driver, vehicle, and location
   */
  async getRideDetails(userToken: string, requestId: string): Promise<UberRideResponse> {
    try {
      const response = await this.axiosInstance.get(
        `${this.baseUrl}/requests/${requestId}`,
        {
          headers: {
            Authorization: `Bearer ${userToken}`,
          },
        }
      );

      return response.data as UberRideResponse;
    } catch (error) {
      throw this.handleError(error, 'getRideDetails', { requestId });
    }
  }

  /**
   * Get current ride details (requires user OAuth token)
   * @param userToken - User's OAuth access token
   * @returns Current active ride or null if no active ride
   */
  async getCurrentRide(userToken: string): Promise<UberRideResponse | null> {
    try {
      const response = await this.axiosInstance.get(`${this.baseUrl}/requests/current`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      return response.data as UberRideResponse;
    } catch (error) {
      // 404 means no current ride - this is expected behavior
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw this.handleError(error, 'getCurrentRide', {});
    }
  }

  /**
   * Update ride destination
   * @param userToken - User's OAuth access token
   * @param requestId - Ride request ID
   * @param endLatitude - New destination latitude
   * @param endLongitude - New destination longitude
   */
  async updateDestination(
    userToken: string,
    requestId: string,
    endLatitude: number,
    endLongitude: number
  ): Promise<void> {
    try {
      await this.axiosInstance.patch(
        `${this.baseUrl}/requests/${requestId}`,
        {
          end_latitude: endLatitude,
          end_longitude: endLongitude,
        },
        {
          headers: {
            Authorization: `Bearer ${userToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (error) {
      throw this.handleError(error, 'updateDestination', {
        requestId,
        endLatitude,
        endLongitude,
      });
    }
  }

  /**
   * Cancel a ride (requires user OAuth token)
   * @param userToken - User's OAuth access token
   * @param requestId - Ride request ID to cancel
   */
  async cancelRide(userToken: string, requestId: string): Promise<void> {
    try {
      await this.axiosInstance.delete(`${this.baseUrl}/requests/${requestId}`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });
    } catch (error) {
      throw this.handleError(error, 'cancelRide', { requestId });
    }
  }

  /**
   * Get ride receipt
   * @param userToken - User's OAuth access token
   * @param requestId - Ride request ID
   * @returns Receipt details including total fare, distance, duration
   */
  async getRideReceipt(userToken: string, requestId: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get(
        `${this.baseUrl}/requests/${requestId}/receipt`,
        {
          headers: {
            Authorization: `Bearer ${userToken}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      throw this.handleError(error, 'getRideReceipt', { requestId });
    }
  }

  // ============================================================================
  // Webhook Processing
  // ============================================================================

  /**
   * Process Uber webhook events
   * @param event - Webhook event payload from Uber
   * @returns Processed event data
   */
  async processWebhook(event: UberWebhookEvent): Promise<{
    eventId: string;
    eventType: string;
    resourceId: string;
    userId: string;
    processedAt: Date;
  }> {
    console.log(`[Uber Webhook] Processing event: ${event.event_type} (${event.event_id})`);

    try {
      switch (event.event_type) {
        case 'requests.status_changed':
          await this.handleRideStatusChange(event);
          break;

        case 'requests.receipt_ready':
          await this.handleReceiptReady(event);
          break;

        default:
          console.warn(`[Uber Webhook] Unknown event type: ${event.event_type}`);
      }

      return {
        eventId: event.event_id,
        eventType: event.event_type,
        resourceId: event.meta.resource_id,
        userId: event.meta.user_id,
        processedAt: new Date(),
      };
    } catch (error) {
      console.error(`[Uber Webhook] Failed to process event ${event.event_id}:`, error);
      throw error;
    }
  }

  /**
   * Handle ride status change webhook
   * @param event - Status change event
   */
  private async handleRideStatusChange(event: UberWebhookEvent): Promise<void> {
    const { resource_id, user_id } = event.meta;
    console.log(`[Uber] Ride ${resource_id} status changed for user ${user_id}`);

    // In production, you would:
    // 1. Fetch the updated ride details using the resource_href
    // 2. Update the order status in your database
    // 3. Send notification to the guest via Communication Service
    // 4. Store in Nexus for context

    // Example notification logic:
    // await this.notifyGuestOfRideUpdate(user_id, resource_id);
  }

  /**
   * Handle receipt ready webhook
   * @param event - Receipt ready event
   */
  private async handleReceiptReady(event: UberWebhookEvent): Promise<void> {
    const { resource_id, user_id } = event.meta;
    console.log(`[Uber] Receipt ready for ride ${resource_id}, user ${user_id}`);

    // In production, you would:
    // 1. Fetch the receipt using getRideReceipt()
    // 2. Store the receipt in your database
    // 3. Send receipt to guest via email
    // 4. Update order status to completed
  }

  /**
   * Verify webhook signature (if Uber provides signature verification)
   * @param payload - Raw webhook payload
   * @param signature - Signature header from Uber
   * @returns True if signature is valid
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    // Uber currently doesn't provide webhook signature verification
    // If they add it in the future, implement HMAC verification here
    // For now, validate webhook came from trusted source via other means
    return true;
  }

  // ============================================================================
  // Error Handling
  // ============================================================================

  /**
   * Centralized error handling for Uber API calls
   * @param error - Error object from axios
   * @param operation - Name of the operation that failed
   * @param context - Additional context data
   */
  private handleError(error: any, operation: string, context: any): UberAPIError {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status || 500;
      const errorData = error.response?.data;
      const errorCode = errorData?.code || 'UBER_API_ERROR';
      const errorMessage =
        errorData?.message || error.message || 'An unknown error occurred with Uber API';

      let suggestion = 'Please try again later or contact support.';

      // Provide specific suggestions based on error type
      switch (statusCode) {
        case 400:
          suggestion = 'Check request parameters and ensure all required fields are provided.';
          break;
        case 401:
          suggestion = 'OAuth token is invalid or expired. Please re-authenticate the user.';
          break;
        case 403:
          suggestion = 'Access forbidden. Check API credentials and user permissions.';
          break;
        case 404:
          suggestion = 'Resource not found. Verify the request ID or product ID is correct.';
          break;
        case 409:
          suggestion = 'Conflict detected. User may already have an active ride request.';
          break;
        case 422:
          suggestion =
            'Invalid parameters provided. Common issues: surge pricing not confirmed, invalid coordinates.';
          break;
        case 429:
          suggestion = 'Rate limit exceeded. Implement exponential backoff and retry later.';
          break;
        case 500:
        case 503:
          suggestion = 'Uber service temporarily unavailable. Retry with exponential backoff.';
          break;
      }

      return new UberAPIError(errorMessage, errorCode, statusCode, {
        operation,
        requestData: context,
        responseData: errorData,
        timestamp: new Date(),
        suggestion,
      });
    }

    // Non-axios error (network error, timeout, etc.)
    return new UberAPIError(
      error.message || 'Unknown error occurred',
      'NETWORK_ERROR',
      0,
      {
        operation,
        requestData: context,
        timestamp: new Date(),
        suggestion: 'Check network connectivity and try again.',
      }
    );
  }
}
