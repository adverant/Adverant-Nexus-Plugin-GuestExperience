import { FastifyInstance } from 'fastify';
import { ChatbotController } from '../controllers/chatbot.controller';
import { authenticate } from '../middleware/auth.middleware';

export async function chatbotRoutes(server: FastifyInstance): Promise<void> {
  const controller = new ChatbotController();

  // Send message
  server.post(
    '/message',
    {
      preHandler: [authenticate],
    },
    controller.sendMessage.bind(controller)
  );

  // Get chat history
  server.get(
    '/history/:reservationId',
    {
      preHandler: [authenticate],
    },
    controller.getChatHistoryForReservation.bind(controller)
  );

  // Escalate conversation
  server.post(
    '/escalate/:reservationId',
    {
      preHandler: [authenticate],
    },
    controller.escalateConversation.bind(controller)
  );
}
