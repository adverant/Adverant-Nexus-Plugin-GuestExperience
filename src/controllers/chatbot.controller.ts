import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { AIChatbotService } from '../services/ai-chatbot.service';
import {
  SendMessageDto,
  ChatMessage,
  ChatContext,
  ChatMessageRole,
  AuthenticatedRequest,
} from '../types';
import { config } from '../config/config';

export class ChatbotController {
  private chatbotService: AIChatbotService;
  private redis: Redis;
  private readonly CHAT_HISTORY_PREFIX = 'chat:history:';
  private readonly CHAT_HISTORY_LIMIT = 50;

  constructor() {
    this.chatbotService = new AIChatbotService();
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
    });
  }

  /**
   * Send message and get AI response
   */
  async sendMessage(
    request: FastifyRequest<{ Body: SendMessageDto }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const authReq = request as AuthenticatedRequest;
      const { userId } = authReq.user;
      const { reservationId, content, language } = request.body;

      // Get conversation context
      const context = await this.getConversationContext(reservationId, userId, language);

      // Get chat history
      const history = await this.getChatHistory(reservationId);

      // Add history to context
      context.history = history;

      // Create user message
      const userMessage: ChatMessage = {
        id: uuidv4(),
        conversationId: `conv-${reservationId}`,
        reservationId,
        role: ChatMessageRole.USER,
        content,
        createdAt: new Date(),
      };

      // Store user message
      await this.storeChatMessage(userMessage);

      // Generate AI response
      const aiResponse = await this.chatbotService.generateResponse(content, context);

      // Create assistant message
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        conversationId: `conv-${reservationId}`,
        reservationId,
        role: ChatMessageRole.ASSISTANT,
        content: aiResponse.content,
        metadata: {
          model: aiResponse.model,
          tokens: aiResponse.tokens,
          sentiment: aiResponse.sentiment,
          intent: aiResponse.intent,
          escalated: aiResponse.shouldEscalate,
        },
        createdAt: new Date(),
      };

      // Store assistant message
      await this.storeChatMessage(assistantMessage);

      // Return response
      reply.send({
        success: true,
        data: {
          message: assistantMessage,
          shouldEscalate: aiResponse.shouldEscalate,
        },
      });
    } catch (error) {
      request.log.error('Failed to process chat message:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to process chat message',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get chat history for a reservation
   */
  async getChatHistoryForReservation(
    request: FastifyRequest<{ Params: { reservationId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { reservationId } = request.params;
      const history = await this.getChatHistory(reservationId);

      reply.send({
        success: true,
        data: history,
      });
    } catch (error) {
      request.log.error('Failed to get chat history:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to get chat history',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Escalate conversation to human staff
   */
  async escalateConversation(
    request: FastifyRequest<{ Params: { reservationId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { reservationId } = request.params;

      // In production, create a notification/ticket for staff
      // For now, just log it
      request.log.info(`Conversation escalated for reservation ${reservationId}`);

      // Store escalation message
      const escalationMessage: ChatMessage = {
        id: uuidv4(),
        conversationId: `conv-${reservationId}`,
        reservationId,
        role: ChatMessageRole.SYSTEM,
        content: 'This conversation has been escalated to staff. A team member will respond shortly.',
        metadata: {
          escalated: true,
        },
        createdAt: new Date(),
      };

      await this.storeChatMessage(escalationMessage);

      reply.send({
        success: true,
        data: {
          message: 'Conversation escalated to staff',
          escalationMessage,
        },
      });
    } catch (error) {
      request.log.error('Failed to escalate conversation:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to escalate conversation',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get conversation context
   */
  private async getConversationContext(
    reservationId: string,
    userId: string,
    language?: string
  ): Promise<ChatContext> {
    // In production, fetch from Property Management Service
    // For now, return mock data

    return {
      reservation: {
        id: reservationId,
        checkIn: new Date('2024-12-01'),
        checkOut: new Date('2024-12-05'),
        guestCount: 2,
      },
      property: {
        id: 'property-123',
        name: 'Luxury Downtown Apartment',
        address: '123 Main St, San Francisco, CA 94102',
        amenities: [
          'WiFi',
          'Kitchen',
          'Washer/Dryer',
          'Parking',
          'Pool',
          'Gym',
          'Hot Tub',
        ],
        wifiPassword: 'Welcome2024!',
        checkInInstructions: `
Check-in Instructions:
1. Use code 1234# to access building
2. Take elevator to 3rd floor
3. Your unit is 3B, use lockbox code 5678
4. Key is inside lockbox on the door handle
5. Check-in time is 3 PM
        `,
      },
      guest: {
        id: userId,
        firstName: 'John',
        lastName: 'Doe',
        language: language || 'en',
        preferences: {
          quiet_hours: true,
          eco_friendly: true,
        },
      },
      history: [], // Will be populated by caller
    };
  }

  /**
   * Get chat history from Redis
   */
  private async getChatHistory(reservationId: string): Promise<ChatMessage[]> {
    const key = `${this.CHAT_HISTORY_PREFIX}${reservationId}`;
    const messages = await this.redis.lrange(key, 0, this.CHAT_HISTORY_LIMIT - 1);

    return messages.map(msg => {
      const data = JSON.parse(msg);
      return {
        ...data,
        createdAt: new Date(data.createdAt),
      };
    });
  }

  /**
   * Store chat message in Redis
   */
  private async storeChatMessage(message: ChatMessage): Promise<void> {
    const key = `${this.CHAT_HISTORY_PREFIX}${message.reservationId}`;

    // Add to list (prepend for newest first)
    await this.redis.lpush(key, JSON.stringify(message));

    // Trim to keep only recent messages
    await this.redis.ltrim(key, 0, this.CHAT_HISTORY_LIMIT - 1);

    // Set expiration (30 days)
    await this.redis.expire(key, 30 * 24 * 60 * 60);
  }

  /**
   * Cleanup
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
