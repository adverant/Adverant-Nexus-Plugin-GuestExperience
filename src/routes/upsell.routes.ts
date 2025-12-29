import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UpsellController } from '../controllers/upsell.controller';
import { authenticate } from '../middleware/auth.middleware';
import { UberService } from '../services/integrations/uber.service';
import { DoorDashService } from '../services/integrations/doordash.service';
import { InstacartService } from '../services/integrations/instacart.service';

export async function upsellRoutes(server: FastifyInstance): Promise<void> {
  const controller = new UpsellController();

  // Initialize integration services for webhooks
  const uberService = new UberService();
  const doorDashService = new DoorDashService();
  const instacartService = new InstacartService();

  // ============================================================================
  // Upsell Order Management Routes
  // ============================================================================

  // Get upsell catalog
  server.get(
    '/catalog/:propertyId',
    {
      preHandler: [authenticate],
    },
    controller.getCatalog.bind(controller)
  );

  // Create upsell order
  server.post(
    '/order',
    {
      preHandler: [authenticate],
    },
    controller.createOrder.bind(controller)
  );

  // Get order by ID
  server.get(
    '/order/:id',
    {
      preHandler: [authenticate],
    },
    controller.getOrderById.bind(controller)
  );

  // Get orders by reservation
  server.get(
    '/orders/reservation/:reservationId',
    {
      preHandler: [authenticate],
    },
    controller.getOrdersByReservation.bind(controller)
  );

  // Get Uber ride estimates
  server.get(
    '/uber/estimates',
    {
      preHandler: [authenticate],
    },
    controller.getUberEstimates.bind(controller)
  );

  // ============================================================================
  // Provider Webhook Routes
  // ============================================================================

  /**
   * Uber Webhook Handler
   * Receives status updates for rides (driver assigned, arrived, completed, etc.)
   */
  server.post(
    '/webhooks/uber',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const event = request.body as any;

        server.log.info(`[Uber Webhook] Received event: ${event.event_type}`);

        // Process the webhook event
        const result = await uberService.processWebhook(event);

        // In production, you would:
        // 1. Update order status in database based on event type
        // 2. Send notification to guest about ride status
        // 3. Store event in Nexus for context
        // 4. Update external order tracking

        return reply.code(200).send({
          success: true,
          eventId: result.eventId,
          processedAt: result.processedAt,
        });
      } catch (error) {
        server.log.error('[Uber Webhook] Failed to process webhook:', error);
        return reply.code(500).send({
          success: false,
          error: 'Failed to process Uber webhook',
        });
      }
    }
  );

  /**
   * DoorDash Webhook Handler
   * Receives delivery status updates (dasher assigned, picked up, delivered, etc.)
   */
  server.post(
    '/webhooks/doordash',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const rawBody = JSON.stringify(request.body);
        const signature = request.headers['x-doordash-signature'] as string;

        // Verify webhook signature for security
        if (signature && !doorDashService.verifyWebhookSignature(rawBody, signature)) {
          server.log.warn('[DoorDash Webhook] Invalid signature');
          return reply.code(401).send({
            success: false,
            error: 'Invalid webhook signature',
          });
        }

        const event = request.body as any;

        server.log.info(`[DoorDash Webhook] Received event: ${event.event_name}`);

        // Process the webhook event
        const result = await doorDashService.processWebhook(event);

        // In production, you would:
        // 1. Update order status in database
        // 2. Send notification to guest about delivery status
        // 3. Store dasher info and ETA
        // 4. Handle delivery completion/cancellation

        return reply.code(200).send({
          success: true,
          eventId: result.eventId,
          processedAt: result.processedAt,
        });
      } catch (error) {
        server.log.error('[DoorDash Webhook] Failed to process webhook:', error);
        return reply.code(500).send({
          success: false,
          error: 'Failed to process DoorDash webhook',
        });
      }
    }
  );

  /**
   * Instacart Webhook Handler
   * Receives order status updates (shopping, delivering, delivered, replacements, etc.)
   */
  server.post(
    '/webhooks/instacart',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const rawBody = JSON.stringify(request.body);
        const signature = request.headers['x-instacart-signature'] as string;

        // Verify webhook signature for security
        if (signature && !instacartService.verifyWebhookSignature(rawBody, signature)) {
          server.log.warn('[Instacart Webhook] Invalid signature');
          return reply.code(401).send({
            success: false,
            error: 'Invalid webhook signature',
          });
        }

        const event = request.body as any;

        server.log.info(`[Instacart Webhook] Received event: ${event.event_type}`);

        // Process the webhook event
        const result = await instacartService.processWebhook(event);

        // In production, you would:
        // 1. Update order status in database
        // 2. Send notification to guest about order status
        // 3. Handle item replacements (request approval)
        // 4. Process refunds if items unavailable
        // 5. Send delivery completion notification

        return reply.code(200).send({
          success: true,
          eventId: result.eventId,
          processedAt: result.processedAt,
        });
      } catch (error) {
        server.log.error('[Instacart Webhook] Failed to process webhook:', error);
        return reply.code(500).send({
          success: false,
          error: 'Failed to process Instacart webhook',
        });
      }
    }
  );

  // ============================================================================
  // Provider-Specific Routes (for manual testing and status checks)
  // ============================================================================

  /**
   * Get Uber ride status
   * Allows manual checking of ride status
   */
  server.get(
    '/uber/ride/:requestId/status',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest<{ Params: { requestId: string } }>, reply: FastifyReply) => {
      try {
        const { requestId } = request.params;
        const userToken = (request as any).user.uberToken; // Assumes user token stored in JWT

        if (!userToken) {
          return reply.code(400).send({
            error: 'Uber user token not found. User must authenticate with Uber first.',
          });
        }

        const rideDetails = await uberService.getRideDetails(userToken, requestId);

        return reply.send({
          success: true,
          ride: rideDetails,
        });
      } catch (error) {
        server.log.error('[Uber] Failed to get ride status:', error);
        return reply.code(500).send({
          error: 'Failed to get ride status',
        });
      }
    }
  );

  /**
   * Get DoorDash delivery status
   * Allows manual checking of delivery status
   */
  server.get(
    '/doordash/delivery/:deliveryId/status',
    {
      preHandler: [authenticate],
    },
    async (
      request: FastifyRequest<{ Params: { deliveryId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { deliveryId } = request.params;

        const deliveryStatus = await doorDashService.getDeliveryStatus(deliveryId);

        return reply.send({
          success: true,
          delivery: deliveryStatus,
        });
      } catch (error) {
        server.log.error('[DoorDash] Failed to get delivery status:', error);
        return reply.code(500).send({
          error: 'Failed to get delivery status',
        });
      }
    }
  );

  /**
   * Get Instacart order status
   * Allows manual checking of order status
   */
  server.get(
    '/instacart/order/:orderId/status',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest<{ Params: { orderId: string } }>, reply: FastifyReply) => {
      try {
        const { orderId } = request.params;

        const orderStatus = await instacartService.getOrderStatus(orderId);

        return reply.send({
          success: true,
          order: orderStatus,
        });
      } catch (error) {
        server.log.error('[Instacart] Failed to get order status:', error);
        return reply.code(500).send({
          error: 'Failed to get order status',
        });
      }
    }
  );
}
