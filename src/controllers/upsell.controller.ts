import { FastifyRequest, FastifyReply } from 'fastify';
import { UpsellService } from '../services/upsell.service';
import { CreateUpsellOrderDto, AuthenticatedRequest } from '../types';

export class UpsellController {
  private upsellService: UpsellService;

  constructor() {
    this.upsellService = new UpsellService();
  }

  /**
   * Get upsell catalog
   */
  async getCatalog(
    request: FastifyRequest<{ Params: { propertyId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { propertyId } = request.params;
      const catalog = await this.upsellService.getUpsellCatalog(propertyId);

      reply.send({
        success: true,
        data: catalog,
      });
    } catch (error) {
      request.log.error('Failed to get upsell catalog:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to get upsell catalog',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Create upsell order
   */
  async createOrder(
    request: FastifyRequest<{ Body: CreateUpsellOrderDto }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const authReq = request as AuthenticatedRequest;
      const { userId } = authReq.user;

      // In production, fetch propertyId from reservation
      const propertyId = 'property-123'; // Placeholder

      const order = await this.upsellService.createUpsellOrder(
        request.body,
        userId,
        propertyId
      );

      reply.code(201).send({
        success: true,
        data: order,
      });
    } catch (error) {
      request.log.error('Failed to create upsell order:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to create upsell order',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.params;
      const order = await this.upsellService.getOrderById(id);

      if (!order) {
        reply.code(404).send({
          success: false,
          error: 'Order not found',
        });
        return;
      }

      reply.send({
        success: true,
        data: order,
      });
    } catch (error) {
      request.log.error('Failed to get order:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to get order',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get orders by reservation
   */
  async getOrdersByReservation(
    request: FastifyRequest<{ Params: { reservationId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { reservationId } = request.params;
      const orders = await this.upsellService.getOrdersByReservation(reservationId);

      reply.send({
        success: true,
        data: orders,
      });
    } catch (error) {
      request.log.error('Failed to get orders:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to get orders',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get Uber ride estimates
   */
  async getUberEstimates(
    request: FastifyRequest<{
      Querystring: {
        startLat: string;
        startLng: string;
        endLat: string;
        endLng: string;
      };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { startLat, startLng, endLat, endLng } = request.query;

      const estimates = await this.upsellService.getUberRideEstimates(
        parseFloat(startLat),
        parseFloat(startLng),
        parseFloat(endLat),
        parseFloat(endLng)
      );

      reply.send({
        success: true,
        data: estimates,
      });
    } catch (error) {
      request.log.error('Failed to get Uber estimates:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to get Uber estimates',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
