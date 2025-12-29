import axios, { AxiosError, AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { config } from '../../config/config';

// ============================================================================
// TypeScript Type Definitions
// ============================================================================

interface DoorDashAddress {
  street: string;
  city: string;
  state: string;
  zip_code: string;
  country?: string;
  subpremise?: string; // Unit/Apt number
  lat?: number;
  lng?: number;
}

interface DoorDashContact {
  first_name: string;
  last_name: string;
  phone_number: string;
  email?: string;
  send_notifications?: boolean;
}

interface DoorDashItem {
  name: string;
  description?: string;
  quantity: number;
  price: number; // In cents
  external_id?: string;
}

interface DoorDashDeliveryQuote {
  external_delivery_id: string;
  fee: number; // In cents
  currency: string;
  estimated_pickup_time: string;
  estimated_delivery_time: string;
  expires_at: string;
}

interface DoorDashDelivery {
  external_delivery_id: string;
  delivery_status: DoorDashDeliveryStatus;
  tracking_url?: string;
  dasher?: {
    name?: string;
    phone_number?: string;
    location?: {
      lat: number;
      lng: number;
    };
  };
  pickup_time?: string;
  delivery_time?: string;
  cancellation_reason?: string;
  fee: number;
  currency: string;
}

enum DoorDashDeliveryStatus {
  CREATED = 'created',
  SCHEDULED = 'scheduled',
  CONFIRMED = 'confirmed',
  DASHER_CONFIRMED = 'dasher_confirmed',
  PICKING_UP = 'picking_up',
  PICKED_UP = 'picked_up',
  DELIVERING = 'delivering',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  RETURNED = 'returned',
}

interface DoorDashWebhookEvent {
  event_id: string;
  event_name: DoorDashWebhookEventType;
  event_time: string;
  external_delivery_id: string;
  delivery_status: DoorDashDeliveryStatus;
  dasher?: {
    name?: string;
    phone_number?: string;
  };
}

enum DoorDashWebhookEventType {
  DELIVERY_CREATED = 'delivery.created',
  DELIVERY_CONFIRMED = 'delivery.confirmed',
  DELIVERY_PICKED_UP = 'delivery.picked_up',
  DELIVERY_DELIVERED = 'delivery.delivered',
  DELIVERY_CANCELLED = 'delivery.cancelled',
  DELIVERY_RETURNED = 'delivery.returned',
}

/**
 * Custom error class for DoorDash API errors
 */
class DoorDashAPIError extends Error {
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
    this.name = 'DoorDashAPIError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// ============================================================================
// DoorDash Drive Service Implementation
// ============================================================================

/**
 * DoorDash Drive API Integration Service
 *
 * Implements full integration with DoorDash Drive API for on-demand delivery.
 * Features:
 * - JWT authentication
 * - Delivery quote and creation
 * - Real-time status tracking
 * - Webhook event processing
 * - Comprehensive error handling with retries
 *
 * Documentation: https://developer.doordash.com/
 */
export class DoorDashService {
  private readonly baseUrl: string;
  private readonly developerId: string;
  private readonly keyId: string;
  private readonly signingSecret: string;
  private readonly axiosInstance: AxiosInstance;

  constructor() {
    this.baseUrl = config.thirdParty.doordash.sandboxMode
      ? 'https://openapi.doordash.com/drive/v2'
      : 'https://openapi.doordash.com/drive/v2';

    this.developerId = config.thirdParty.doordash.developerId;
    this.keyId = config.thirdParty.doordash.keyId;
    this.signingSecret = config.thirdParty.doordash.signingSecret;

    // Configure axios with retry logic
    this.axiosInstance = axios.create({
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Setup axios interceptors for request/response handling
   */
  private setupInterceptors(): void {
    // Request interceptor - add JWT to every request
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        const jwt = this.generateJWT();
        config.headers.Authorization = `Bearer ${jwt}`;
        console.log(`[DoorDash API] ${config.method?.toUpperCase()} ${config.url}`);
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
            console.log(
              `[DoorDash API] Retrying after ${delay}ms (attempt ${originalRequest._retry}/3)`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            return this.axiosInstance(originalRequest);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // ============================================================================
  // JWT Authentication
  // ============================================================================

  /**
   * Generate JWT token for DoorDash API authentication
   * @returns JWT token string
   */
  private generateJWT(): string {
    const header = {
      alg: 'HS256',
      typ: 'JWT',
      dd-ver: 'DD-JWT-V1',
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      aud: 'doordash',
      iss: this.developerId,
      kid: this.keyId,
      exp: now + 300, // Expires in 5 minutes
      iat: now,
      nbf: now,
    };

    // Encode header and payload
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

    // Create signature
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
      .createHmac('sha256', this.signingSecret)
      .update(signatureInput)
      .digest('base64url');

    return `${signatureInput}.${signature}`;
  }

  // ============================================================================
  // Quote & Delivery APIs
  // ============================================================================

  /**
   * Get delivery quote
   * @param pickupAddress - Pickup location details
   * @param deliveryAddress - Delivery destination details
   * @param items - List of items to be delivered
   * @param pickupContact - Contact information for pickup
   * @param deliveryContact - Contact information for delivery
   * @returns Delivery quote with pricing and time estimates
   */
  async getDeliveryQuote(
    pickupAddress: DoorDashAddress,
    deliveryAddress: DoorDashAddress,
    items: DoorDashItem[],
    pickupContact: DoorDashContact,
    deliveryContact: DoorDashContact
  ): Promise<DoorDashDeliveryQuote> {
    try {
      const externalDeliveryId = `quote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const requestBody = {
        external_delivery_id: externalDeliveryId,
        pickup_address: this.formatAddress(pickupAddress),
        pickup_business_name: 'Property Location',
        pickup_phone_number: pickupContact.phone_number,
        pickup_instructions: 'Contact guest upon arrival',
        delivery_address: this.formatAddress(deliveryAddress),
        delivery_business_name: deliveryContact.first_name + ' ' + deliveryContact.last_name,
        delivery_phone_number: deliveryContact.phone_number,
        delivery_instructions: 'Leave at door if no answer',
        order_value: this.calculateOrderValue(items),
        items: items.map((item) => ({
          name: item.name,
          description: item.description || '',
          quantity: item.quantity,
          external_id: item.external_id || '',
        })),
      };

      const response = await this.axiosInstance.post(
        `${this.baseUrl}/quotes`,
        requestBody
      );

      return {
        external_delivery_id: externalDeliveryId,
        fee: response.data.fee,
        currency: response.data.currency || 'USD',
        estimated_pickup_time: response.data.estimated_pickup_time,
        estimated_delivery_time: response.data.estimated_delivery_time,
        expires_at: response.data.expires_at,
      };
    } catch (error) {
      throw this.handleError(error, 'getDeliveryQuote', {
        pickupAddress,
        deliveryAddress,
        items,
      });
    }
  }

  /**
   * Create delivery
   * @param quote - Quote obtained from getDeliveryQuote
   * @param pickupAddress - Pickup location details
   * @param deliveryAddress - Delivery destination details
   * @param items - List of items to be delivered
   * @param pickupContact - Contact information for pickup
   * @param deliveryContact - Contact information for delivery
   * @param pickupInstructions - Optional instructions for pickup
   * @param deliveryInstructions - Optional instructions for delivery
   * @returns Created delivery details
   */
  async createDelivery(
    quote: DoorDashDeliveryQuote,
    pickupAddress: DoorDashAddress,
    deliveryAddress: DoorDashAddress,
    items: DoorDashItem[],
    pickupContact: DoorDashContact,
    deliveryContact: DoorDashContact,
    pickupInstructions?: string,
    deliveryInstructions?: string
  ): Promise<DoorDashDelivery> {
    try {
      const requestBody = {
        external_delivery_id: quote.external_delivery_id,
        pickup_address: this.formatAddress(pickupAddress),
        pickup_business_name: 'Property Location',
        pickup_phone_number: pickupContact.phone_number,
        pickup_instructions: pickupInstructions || 'Contact guest upon arrival',
        delivery_address: this.formatAddress(deliveryAddress),
        delivery_business_name: deliveryContact.first_name + ' ' + deliveryContact.last_name,
        delivery_phone_number: deliveryContact.phone_number,
        delivery_instructions: deliveryInstructions || 'Leave at door if no answer',
        order_value: this.calculateOrderValue(items),
        items: items.map((item) => ({
          name: item.name,
          description: item.description || '',
          quantity: item.quantity,
          external_id: item.external_id || '',
        })),
        tip: Math.round(quote.fee * 0.15), // 15% tip
        pickup_time: quote.estimated_pickup_time,
        dropoff_time: quote.estimated_delivery_time,
        contactless_dropoff: true,
        action_if_undeliverable: 'return_to_pickup',
      };

      const response = await this.axiosInstance.post(
        `${this.baseUrl}/deliveries`,
        requestBody
      );

      return {
        external_delivery_id: response.data.external_delivery_id,
        delivery_status: response.data.delivery_status,
        tracking_url: response.data.tracking_url,
        fee: response.data.fee,
        currency: response.data.currency || 'USD',
        pickup_time: response.data.pickup_time,
        delivery_time: response.data.dropoff_time,
      };
    } catch (error) {
      throw this.handleError(error, 'createDelivery', {
        quote,
        pickupAddress,
        deliveryAddress,
      });
    }
  }

  /**
   * Get delivery status
   * @param externalDeliveryId - Delivery ID from quote/create
   * @returns Current delivery status and details
   */
  async getDeliveryStatus(externalDeliveryId: string): Promise<DoorDashDelivery> {
    try {
      const response = await this.axiosInstance.get(
        `${this.baseUrl}/deliveries/${externalDeliveryId}`
      );

      return {
        external_delivery_id: response.data.external_delivery_id,
        delivery_status: response.data.delivery_status,
        tracking_url: response.data.tracking_url,
        dasher: response.data.dasher,
        pickup_time: response.data.pickup_time,
        delivery_time: response.data.dropoff_time,
        fee: response.data.fee,
        currency: response.data.currency || 'USD',
        cancellation_reason: response.data.cancellation_reason,
      };
    } catch (error) {
      throw this.handleError(error, 'getDeliveryStatus', { externalDeliveryId });
    }
  }

  /**
   * Update delivery
   * @param externalDeliveryId - Delivery ID to update
   * @param updates - Fields to update
   */
  async updateDelivery(
    externalDeliveryId: string,
    updates: {
      delivery_address?: DoorDashAddress;
      delivery_phone_number?: string;
      delivery_instructions?: string;
      tip?: number;
    }
  ): Promise<DoorDashDelivery> {
    try {
      const requestBody: any = {};

      if (updates.delivery_address) {
        requestBody.delivery_address = this.formatAddress(updates.delivery_address);
      }
      if (updates.delivery_phone_number) {
        requestBody.delivery_phone_number = updates.delivery_phone_number;
      }
      if (updates.delivery_instructions) {
        requestBody.delivery_instructions = updates.delivery_instructions;
      }
      if (updates.tip !== undefined) {
        requestBody.tip = updates.tip;
      }

      const response = await this.axiosInstance.patch(
        `${this.baseUrl}/deliveries/${externalDeliveryId}`,
        requestBody
      );

      return {
        external_delivery_id: response.data.external_delivery_id,
        delivery_status: response.data.delivery_status,
        tracking_url: response.data.tracking_url,
        fee: response.data.fee,
        currency: response.data.currency || 'USD',
      };
    } catch (error) {
      throw this.handleError(error, 'updateDelivery', { externalDeliveryId, updates });
    }
  }

  /**
   * Cancel delivery
   * @param externalDeliveryId - Delivery ID to cancel
   * @returns Cancellation result
   */
  async cancelDelivery(externalDeliveryId: string): Promise<void> {
    try {
      await this.axiosInstance.delete(`${this.baseUrl}/deliveries/${externalDeliveryId}`);
    } catch (error) {
      throw this.handleError(error, 'cancelDelivery', { externalDeliveryId });
    }
  }

  // ============================================================================
  // Webhook Processing
  // ============================================================================

  /**
   * Process DoorDash webhook events
   * @param event - Webhook event payload from DoorDash
   * @returns Processed event data
   */
  async processWebhook(event: DoorDashWebhookEvent): Promise<{
    eventId: string;
    eventName: string;
    externalDeliveryId: string;
    deliveryStatus: string;
    processedAt: Date;
  }> {
    console.log(`[DoorDash Webhook] Processing event: ${event.event_name} (${event.event_id})`);

    try {
      switch (event.event_name) {
        case DoorDashWebhookEventType.DELIVERY_CREATED:
          await this.handleDeliveryCreated(event);
          break;

        case DoorDashWebhookEventType.DELIVERY_CONFIRMED:
          await this.handleDeliveryConfirmed(event);
          break;

        case DoorDashWebhookEventType.DELIVERY_PICKED_UP:
          await this.handleDeliveryPickedUp(event);
          break;

        case DoorDashWebhookEventType.DELIVERY_DELIVERED:
          await this.handleDeliveryDelivered(event);
          break;

        case DoorDashWebhookEventType.DELIVERY_CANCELLED:
          await this.handleDeliveryCancelled(event);
          break;

        case DoorDashWebhookEventType.DELIVERY_RETURNED:
          await this.handleDeliveryReturned(event);
          break;

        default:
          console.warn(`[DoorDash Webhook] Unknown event type: ${event.event_name}`);
      }

      return {
        eventId: event.event_id,
        eventName: event.event_name,
        externalDeliveryId: event.external_delivery_id,
        deliveryStatus: event.delivery_status,
        processedAt: new Date(),
      };
    } catch (error) {
      console.error(`[DoorDash Webhook] Failed to process event ${event.event_id}:`, error);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   * @param payload - Raw webhook payload
   * @param signature - Signature header from DoorDash
   * @returns True if signature is valid
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      const computedSignature = crypto
        .createHmac('sha256', this.signingSecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(computedSignature)
      );
    } catch (error) {
      console.error('[DoorDash] Webhook signature verification failed:', error);
      return false;
    }
  }

  // ============================================================================
  // Private Webhook Handlers
  // ============================================================================

  private async handleDeliveryCreated(event: DoorDashWebhookEvent): Promise<void> {
    console.log(`[DoorDash] Delivery created: ${event.external_delivery_id}`);
    // Update order status to 'confirmed' in database
    // Send notification to guest: "Your delivery has been created"
  }

  private async handleDeliveryConfirmed(event: DoorDashWebhookEvent): Promise<void> {
    console.log(`[DoorDash] Delivery confirmed: ${event.external_delivery_id}`);
    // Update order status to 'in_progress' in database
    // Send notification to guest: "Dasher has been assigned"
    // Include dasher info if available
  }

  private async handleDeliveryPickedUp(event: DoorDashWebhookEvent): Promise<void> {
    console.log(`[DoorDash] Delivery picked up: ${event.external_delivery_id}`);
    // Update order status in database
    // Send notification to guest: "Your order is on the way!"
  }

  private async handleDeliveryDelivered(event: DoorDashWebhookEvent): Promise<void> {
    console.log(`[DoorDash] Delivery completed: ${event.external_delivery_id}`);
    // Update order status to 'completed' in database
    // Send notification to guest: "Your order has been delivered"
    // Request feedback/rating
  }

  private async handleDeliveryCancelled(event: DoorDashWebhookEvent): Promise<void> {
    console.log(`[DoorDash] Delivery cancelled: ${event.external_delivery_id}`);
    // Update order status to 'cancelled' in database
    // Send notification to guest: "Your delivery was cancelled"
    // Process refund if needed
  }

  private async handleDeliveryReturned(event: DoorDashWebhookEvent): Promise<void> {
    console.log(`[DoorDash] Delivery returned: ${event.external_delivery_id}`);
    // Update order status to 'returned' in database
    // Send notification to guest: "Delivery could not be completed and was returned"
    // Handle refund/rescheduling
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Format address for DoorDash API
   */
  private formatAddress(address: DoorDashAddress): string {
    let formatted = address.street;
    if (address.subpremise) {
      formatted += ` ${address.subpremise}`;
    }
    formatted += `, ${address.city}, ${address.state} ${address.zip_code}`;
    if (address.country) {
      formatted += `, ${address.country}`;
    }
    return formatted;
  }

  /**
   * Calculate total order value from items
   */
  private calculateOrderValue(items: DoorDashItem[]): number {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  // ============================================================================
  // Error Handling
  // ============================================================================

  /**
   * Centralized error handling for DoorDash API calls
   * @param error - Error object from axios
   * @param operation - Name of the operation that failed
   * @param context - Additional context data
   */
  private handleError(error: any, operation: string, context: any): DoorDashAPIError {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status || 500;
      const errorData = error.response?.data;
      const errorCode = errorData?.code || 'DOORDASH_API_ERROR';
      const errorMessage =
        errorData?.message || error.message || 'An unknown error occurred with DoorDash API';

      let suggestion = 'Please try again later or contact support.';

      // Provide specific suggestions based on error type
      switch (statusCode) {
        case 400:
          suggestion =
            'Invalid request parameters. Check address format, phone numbers, and item details.';
          break;
        case 401:
          suggestion = 'Authentication failed. Verify JWT credentials are correct.';
          break;
        case 403:
          suggestion = 'Access forbidden. Check API permissions and developer account status.';
          break;
        case 404:
          suggestion = 'Delivery not found. Verify the external_delivery_id is correct.';
          break;
        case 409:
          suggestion =
            'Conflict detected. Delivery may already exist with this external_delivery_id.';
          break;
        case 422:
          suggestion =
            'Validation error. Common issues: address out of service area, invalid time window.';
          break;
        case 429:
          suggestion = 'Rate limit exceeded. Implement exponential backoff and retry later.';
          break;
        case 500:
        case 503:
          suggestion = 'DoorDash service temporarily unavailable. Retry with exponential backoff.';
          break;
      }

      return new DoorDashAPIError(errorMessage, errorCode, statusCode, {
        operation,
        requestData: context,
        responseData: errorData,
        timestamp: new Date(),
        suggestion,
      });
    }

    // Non-axios error (network error, timeout, etc.)
    return new DoorDashAPIError(
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
