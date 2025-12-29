import { FastifyRequest, FastifyReply } from 'fastify';
import { ServiceRequestService } from '../services/service-request.service';
import {
  CreateServiceRequestDto,
  UpdateServiceRequestDto,
  RateServiceRequestDto,
  AuthenticatedRequest,
} from '../types';

export class ServiceRequestController {
  private serviceRequestService: ServiceRequestService;

  constructor() {
    this.serviceRequestService = new ServiceRequestService();
  }

  /**
   * Create a new service request
   */
  async createServiceRequest(
    request: FastifyRequest<{ Body: CreateServiceRequestDto }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const authReq = request as AuthenticatedRequest;
      const { userId } = authReq.user;

      // In production, fetch propertyId from reservation
      const propertyId = 'property-123'; // Placeholder

      const serviceRequest = await this.serviceRequestService.createServiceRequest(
        request.body,
        userId,
        propertyId
      );

      reply.code(201).send({
        success: true,
        data: serviceRequest,
      });
    } catch (error) {
      request.log.error('Failed to create service request:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to create service request',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get service request by ID
   */
  async getServiceRequestById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.params;
      const serviceRequest = await this.serviceRequestService.getServiceRequestById(id);

      if (!serviceRequest) {
        reply.code(404).send({
          success: false,
          error: 'Service request not found',
        });
        return;
      }

      reply.send({
        success: true,
        data: serviceRequest,
      });
    } catch (error) {
      request.log.error('Failed to get service request:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to get service request',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get service requests by reservation
   */
  async getServiceRequestsByReservation(
    request: FastifyRequest<{ Params: { reservationId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { reservationId } = request.params;
      const serviceRequests = await this.serviceRequestService.getServiceRequestsByReservation(
        reservationId
      );

      reply.send({
        success: true,
        data: serviceRequests,
      });
    } catch (error) {
      request.log.error('Failed to get service requests:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to get service requests',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Update service request
   */
  async updateServiceRequest(
    request: FastifyRequest<{
      Params: { id: string };
      Body: UpdateServiceRequestDto;
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.params;
      const updated = await this.serviceRequestService.updateServiceRequest(
        id,
        request.body
      );

      reply.send({
        success: true,
        data: updated,
      });
    } catch (error) {
      request.log.error('Failed to update service request:', error);
      const statusCode = error instanceof Error && error.message.includes('not found')
        ? 404
        : 500;

      reply.code(statusCode).send({
        success: false,
        error: 'Failed to update service request',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Rate service request
   */
  async rateServiceRequest(
    request: FastifyRequest<{
      Params: { id: string };
      Body: RateServiceRequestDto;
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.params;
      const rated = await this.serviceRequestService.rateServiceRequest(
        id,
        request.body
      );

      reply.send({
        success: true,
        data: rated,
      });
    } catch (error) {
      request.log.error('Failed to rate service request:', error);
      const statusCode = error instanceof Error &&
        (error.message.includes('not found') || error.message.includes('completed'))
        ? 400
        : 500;

      reply.code(statusCode).send({
        success: false,
        error: 'Failed to rate service request',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Assign service request to staff
   */
  async assignServiceRequest(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { staffId: string; estimatedCompletion?: string };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.params;
      const { staffId, estimatedCompletion } = request.body;

      const assigned = await this.serviceRequestService.assignServiceRequest(
        id,
        staffId,
        estimatedCompletion ? new Date(estimatedCompletion) : undefined
      );

      reply.send({
        success: true,
        data: assigned,
      });
    } catch (error) {
      request.log.error('Failed to assign service request:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to assign service request',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
