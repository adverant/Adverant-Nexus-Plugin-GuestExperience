import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { config } from '../config/config';
import {
  UpsellItem,
  UpsellOrder,
  CreateUpsellOrderDto,
  UpsellCategory,
  UpsellOrderStatus,
  UberRideEstimate,
} from '../types';
import { UberService } from './integrations/uber.service';
import { DoorDashService } from './integrations/doordash.service';
import { InstacartService } from './integrations/instacart.service';

export class UpsellService {
  private redis: Redis;
  private uberService: UberService;
  private doorDashService: DoorDashService;
  private instacartService: InstacartService;

  private readonly CACHE_PREFIX = 'upsell:';
  private readonly CATALOG_CACHE_KEY = 'upsell:catalog';
  private readonly CACHE_TTL = 1800; // 30 minutes

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
    });

    this.uberService = new UberService();
    this.doorDashService = new DoorDashService();
    this.instacartService = new InstacartService();
  }

  /**
   * Get upsell catalog for a property
   */
  async getUpsellCatalog(propertyId: string): Promise<UpsellItem[]> {
    // Check cache first
    const cached = await this.getCachedCatalog(propertyId);
    if (cached) {
      return cached;
    }

    // Build catalog (in production, fetch from database)
    const catalog: UpsellItem[] = [
      // Transportation
      {
        id: uuidv4(),
        category: UpsellCategory.TRANSPORTATION,
        name: 'Uber Ride',
        description: 'Request an Uber ride to anywhere in the city',
        price: 0, // Dynamic pricing
        currency: 'USD',
        available: true,
        metadata: { provider: 'uber', dynamic_pricing: true },
      },

      // Food Delivery
      {
        id: uuidv4(),
        category: UpsellCategory.FOOD_DELIVERY,
        name: 'DoorDash Food Delivery',
        description: 'Order food from local restaurants',
        price: 0, // Variable based on order
        currency: 'USD',
        available: true,
        metadata: { provider: 'doordash', placeholder: true },
      },

      // Grocery Delivery
      {
        id: uuidv4(),
        category: UpsellCategory.GROCERY_DELIVERY,
        name: 'Instacart Grocery Delivery',
        description: 'Fresh groceries delivered to your door',
        price: 0, // Variable based on order
        currency: 'USD',
        available: true,
        metadata: { provider: 'instacart', placeholder: true },
      },

      // Early Check-in
      {
        id: uuidv4(),
        category: UpsellCategory.EARLY_CHECKIN,
        name: 'Early Check-in (11 AM)',
        description: 'Check in 3 hours early, subject to availability',
        price: 50.00,
        currency: 'USD',
        available: true,
      },

      // Late Checkout
      {
        id: uuidv4(),
        category: UpsellCategory.LATE_CHECKOUT,
        name: 'Late Checkout (2 PM)',
        description: 'Check out 3 hours late, subject to availability',
        price: 50.00,
        currency: 'USD',
        available: true,
      },

      // Extra Cleaning
      {
        id: uuidv4(),
        category: UpsellCategory.EXTRA_CLEANING,
        name: 'Mid-Stay Cleaning',
        description: 'Full cleaning service during your stay',
        price: 75.00,
        currency: 'USD',
        available: true,
      },

      // Local Activities
      {
        id: uuidv4(),
        category: UpsellCategory.LOCAL_ACTIVITIES,
        name: 'City Tour Package',
        description: '3-hour guided city tour with local expert',
        price: 120.00,
        currency: 'USD',
        available: true,
      },
      {
        id: uuidv4(),
        category: UpsellCategory.LOCAL_ACTIVITIES,
        name: 'Wine Tasting Tour',
        description: 'Visit 3 local wineries with transportation included',
        price: 150.00,
        currency: 'USD',
        available: true,
      },

      // Restaurant Reservations
      {
        id: uuidv4(),
        category: UpsellCategory.RESTAURANT_RESERVATION,
        name: 'Premium Restaurant Reservation',
        description: 'Reserved table at top-rated local restaurant',
        price: 25.00,
        currency: 'USD',
        available: true,
      },
    ];

    // Cache catalog
    await this.cacheCatalog(propertyId, catalog);

    return catalog;
  }

  /**
   * Create upsell order
   */
  async createUpsellOrder(
    dto: CreateUpsellOrderDto,
    guestId: string,
    propertyId: string
  ): Promise<UpsellOrder> {
    // Get catalog to validate items
    const catalog = await this.getUpsellCatalog(propertyId);

    // Calculate total and validate items
    let totalAmount = 0;
    const orderItems = dto.items.map(item => {
      const catalogItem = catalog.find(c => c.id === item.upsellId);
      if (!catalogItem) {
        throw new Error(`Upsell item not found: ${item.upsellId}`);
      }

      if (!catalogItem.available) {
        throw new Error(`Upsell item not available: ${catalogItem.name}`);
      }

      const itemTotal = catalogItem.price * item.quantity;
      totalAmount += itemTotal;

      return {
        upsellId: item.upsellId,
        quantity: item.quantity,
        price: catalogItem.price,
        metadata: item.metadata,
      };
    });

    // Create order
    const order: UpsellOrder = {
      id: uuidv4(),
      reservationId: dto.reservationId,
      propertyId,
      guestId,
      items: orderItems,
      totalAmount,
      currency: 'USD',
      status: UpsellOrderStatus.PENDING,
      scheduledFor: dto.scheduledFor,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store order (in production, save to database)
    await this.cacheOrder(order);

    // Process external integrations if applicable
    await this.processExternalIntegrations(order, catalog);

    return order;
  }

  /**
   * Process external integrations (Uber, DoorDash, Instacart)
   * Handles provider-specific order creation and status tracking
   */
  private async processExternalIntegrations(
    order: UpsellOrder,
    catalog: UpsellItem[]
  ): Promise<void> {
    for (const item of order.items) {
      const catalogItem = catalog.find(c => c.id === item.upsellId);
      if (!catalogItem?.metadata?.provider) {
        continue;
      }

      const provider = catalogItem.metadata.provider as string;

      try {
        switch (provider) {
          case 'uber':
            await this.processUberRideRequest(order, item, catalogItem);
            break;

          case 'doordash':
            await this.processDoorDashDelivery(order, item, catalogItem);
            break;

          case 'instacart':
            await this.processInstacartOrder(order, item, catalogItem);
            break;

          default:
            console.warn(`[Upsell] Unknown provider: ${provider}`);
        }
      } catch (error) {
        console.error(`[Upsell] Failed to process ${provider} integration:`, error);
        // Update order status to reflect the error
        await this.updateOrderStatus(
          order.id,
          UpsellOrderStatus.PENDING,
          undefined,
          provider
        );
        // Don't fail the entire order, just log the error
        // In production, this should trigger a notification to staff
      }
    }
  }

  /**
   * Process Uber ride request
   * @param order - Upsell order
   * @param item - Order item
   * @param catalogItem - Catalog item with metadata
   */
  private async processUberRideRequest(
    order: UpsellOrder,
    item: any,
    catalogItem: UpsellItem
  ): Promise<void> {
    console.log(`[Uber] Processing ride request for order ${order.id}`);

    // Extract ride details from item metadata
    const rideMetadata = item.metadata;
    if (!rideMetadata?.userToken || !rideMetadata?.productId) {
      throw new Error('Missing required Uber metadata: userToken and productId');
    }

    const { userToken, productId, startLat, startLng, endLat, endLng, fareId } = rideMetadata;

    try {
      // Request the ride via Uber API
      const rideResponse = await this.uberService.requestRide(userToken, {
        product_id: productId,
        start_latitude: startLat,
        start_longitude: startLng,
        end_latitude: endLat,
        end_longitude: endLng,
        fare_id: fareId,
      });

      // Update order with Uber request ID
      await this.updateOrderStatus(
        order.id,
        UpsellOrderStatus.CONFIRMED,
        rideResponse.request_id,
        'uber'
      );

      console.log(`[Uber] Ride requested successfully: ${rideResponse.request_id}`);

      // In production, send notification to guest with:
      // - Ride details (driver, vehicle, ETA)
      // - Tracking link
      // - Driver contact info

      // Example: await this.notificationService.sendUberRideConfirmation(order, rideResponse);
    } catch (error) {
      console.error('[Uber] Failed to request ride:', error);
      throw new Error(`Uber ride request failed: ${error.message}`);
    }
  }

  /**
   * Process DoorDash delivery
   * @param order - Upsell order
   * @param item - Order item
   * @param catalogItem - Catalog item with metadata
   */
  private async processDoorDashDelivery(
    order: UpsellOrder,
    item: any,
    catalogItem: UpsellItem
  ): Promise<void> {
    console.log(`[DoorDash] Processing delivery for order ${order.id}`);

    // Extract delivery details from item metadata
    const deliveryMetadata = item.metadata;
    if (
      !deliveryMetadata?.pickupAddress ||
      !deliveryMetadata?.deliveryAddress ||
      !deliveryMetadata?.items
    ) {
      throw new Error('Missing required DoorDash metadata: addresses and items');
    }

    const {
      pickupAddress,
      deliveryAddress,
      items,
      pickupContact,
      deliveryContact,
      pickupInstructions,
      deliveryInstructions,
    } = deliveryMetadata;

    try {
      // First, get a quote
      const quote = await this.doorDashService.getDeliveryQuote(
        pickupAddress,
        deliveryAddress,
        items,
        pickupContact,
        deliveryContact
      );

      console.log(`[DoorDash] Quote received: $${quote.fee / 100}, ETA: ${quote.estimated_delivery_time}`);

      // Create the delivery
      const delivery = await this.doorDashService.createDelivery(
        quote,
        pickupAddress,
        deliveryAddress,
        items,
        pickupContact,
        deliveryContact,
        pickupInstructions,
        deliveryInstructions
      );

      // Update order with DoorDash delivery ID
      await this.updateOrderStatus(
        order.id,
        UpsellOrderStatus.CONFIRMED,
        delivery.external_delivery_id,
        'doordash'
      );

      console.log(`[DoorDash] Delivery created successfully: ${delivery.external_delivery_id}`);

      // In production, send notification to guest with:
      // - Delivery details (dasher, ETA)
      // - Tracking link
      // - Estimated delivery time

      // Example: await this.notificationService.sendDoorDashConfirmation(order, delivery);
    } catch (error) {
      console.error('[DoorDash] Failed to create delivery:', error);
      throw new Error(`DoorDash delivery creation failed: ${error.message}`);
    }
  }

  /**
   * Process Instacart grocery order
   * @param order - Upsell order
   * @param item - Order item
   * @param catalogItem - Catalog item with metadata
   */
  private async processInstacartOrder(
    order: UpsellOrder,
    item: any,
    catalogItem: UpsellItem
  ): Promise<void> {
    console.log(`[Instacart] Processing grocery order for ${order.id}`);

    // Extract order details from item metadata
    const orderMetadata = item.metadata;
    if (
      !orderMetadata?.storeId ||
      !orderMetadata?.items ||
      !orderMetadata?.deliveryAddress ||
      !orderMetadata?.contactPhone ||
      !orderMetadata?.contactEmail
    ) {
      throw new Error('Missing required Instacart metadata: storeId, items, address, and contact info');
    }

    const {
      storeId,
      items,
      deliveryAddress,
      contactPhone,
      contactEmail,
      deliveryInstructions,
      scheduledFor,
      tip,
    } = orderMetadata;

    try {
      // First, get price estimate
      const estimate = await this.instacartService.getOrderEstimate(
        storeId,
        items,
        deliveryAddress,
        tip
      );

      console.log(`[Instacart] Estimate received: $${estimate.total / 100}, ETA: ${estimate.estimated_delivery_time}`);

      // Create the order
      const instacartOrder = await this.instacartService.createOrder(
        storeId,
        items,
        deliveryAddress,
        contactPhone,
        contactEmail,
        deliveryInstructions,
        scheduledFor ? new Date(scheduledFor) : undefined,
        tip
      );

      // Update order with Instacart order ID
      await this.updateOrderStatus(
        order.id,
        UpsellOrderStatus.CONFIRMED,
        instacartOrder.order_id,
        'instacart'
      );

      console.log(`[Instacart] Order created successfully: ${instacartOrder.order_id}`);

      // In production, send notification to guest with:
      // - Order details (items, shopper, ETA)
      // - Tracking link
      // - Estimated delivery time
      // - Replacement preferences

      // Example: await this.notificationService.sendInstacartConfirmation(order, instacartOrder);
    } catch (error) {
      console.error('[Instacart] Failed to create order:', error);
      throw new Error(`Instacart order creation failed: ${error.message}`);
    }
  }

  /**
   * Get Uber ride estimates
   */
  async getUberRideEstimates(
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number
  ): Promise<UberRideEstimate[]> {
    return this.uberService.getPriceEstimates(startLat, startLng, endLat, endLng);
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string): Promise<UpsellOrder | null> {
    const cached = await this.getCachedOrder(orderId);
    if (cached) {
      return cached;
    }

    // In production, fetch from database
    return null;
  }

  /**
   * Get orders by reservation
   */
  async getOrdersByReservation(reservationId: string): Promise<UpsellOrder[]> {
    // In production, query database
    // For now, return empty array
    return [];
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    orderId: string,
    status: UpsellOrderStatus,
    externalOrderId?: string,
    externalProvider?: string
  ): Promise<UpsellOrder> {
    const order = await this.getOrderById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const updated: UpsellOrder = {
      ...order,
      status,
      externalOrderId,
      externalProvider,
      updatedAt: new Date(),
    };

    if (status === UpsellOrderStatus.COMPLETED) {
      updated.completedAt = new Date();
    } else if (status === UpsellOrderStatus.CANCELLED) {
      updated.cancelledAt = new Date();
    } else if (status === UpsellOrderStatus.REFUNDED) {
      updated.refundedAt = new Date();
    }

    await this.cacheOrder(updated);

    return updated;
  }

  /**
   * Cache catalog
   */
  private async cacheCatalog(propertyId: string, catalog: UpsellItem[]): Promise<void> {
    const key = `${this.CATALOG_CACHE_KEY}:${propertyId}`;
    await this.redis.setex(key, this.CACHE_TTL, JSON.stringify(catalog));
  }

  /**
   * Get cached catalog
   */
  private async getCachedCatalog(propertyId: string): Promise<UpsellItem[] | null> {
    const key = `${this.CATALOG_CACHE_KEY}:${propertyId}`;
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  /**
   * Cache order
   */
  private async cacheOrder(order: UpsellOrder): Promise<void> {
    const key = `${this.CACHE_PREFIX}order:${order.id}`;
    await this.redis.setex(key, this.CACHE_TTL, JSON.stringify(order));
  }

  /**
   * Get cached order
   */
  private async getCachedOrder(orderId: string): Promise<UpsellOrder | null> {
    const key = `${this.CACHE_PREFIX}order:${orderId}`;
    const cached = await this.redis.get(key);
    if (!cached) {
      return null;
    }

    const data = JSON.parse(cached);
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : undefined,
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      cancelledAt: data.cancelledAt ? new Date(data.cancelledAt) : undefined,
      refundedAt: data.refundedAt ? new Date(data.refundedAt) : undefined,
    };
  }

  /**
   * Cleanup
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
