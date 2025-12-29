import { FastifyInstance } from 'fastify';
import { ServiceRequestController } from '../controllers/service-request.controller';
import { authenticate } from '../middleware/auth.middleware';

export async function serviceRequestRoutes(server: FastifyInstance): Promise<void> {
  const controller = new ServiceRequestController();

  // Create service request
  server.post(
    '/',
    {
      preHandler: [authenticate],
    },
    controller.createServiceRequest.bind(controller)
  );

  // Get service request by ID
  server.get(
    '/:id',
    {
      preHandler: [authenticate],
    },
    controller.getServiceRequestById.bind(controller)
  );

  // Get service requests by reservation
  server.get(
    '/reservation/:reservationId',
    {
      preHandler: [authenticate],
    },
    controller.getServiceRequestsByReservation.bind(controller)
  );

  // Update service request
  server.put(
    '/:id',
    {
      preHandler: [authenticate],
    },
    controller.updateServiceRequest.bind(controller)
  );

  // Rate service request
  server.post(
    '/:id/rate',
    {
      preHandler: [authenticate],
    },
    controller.rateServiceRequest.bind(controller)
  );

  // Assign service request to staff
  server.post(
    '/:id/assign',
    {
      preHandler: [authenticate],
    },
    controller.assignServiceRequest.bind(controller)
  );
}
