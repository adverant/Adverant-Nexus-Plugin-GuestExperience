import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import socketioServer from 'fastify-socket.io';
import { Server as SocketIOServer } from 'socket.io';
import Redis from 'ioredis';
import { config } from './config/config';
import { serviceRequestRoutes } from './routes/service-request.routes';
import { upsellRoutes } from './routes/upsell.routes';
import { chatbotRoutes } from './routes/chatbot.routes';
import { healthRoutes } from './routes/health.routes';
import { AIChatbotService } from './services/ai-chatbot.service';
import { usageTrackingPlugin, flushPendingReports } from './middleware/usage-tracking';
import {
  ChatMessage,
  ChatMessageRole,
  ChatContext,
} from './types';

// Initialize Redis for Socket.io pub/sub
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
});

const redisSub = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
});

// Initialize Fastify server
const server = Fastify({
  logger: {
    level: config.logLevel,
    transport: config.isDevelopment
      ? {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  },
});

// Register plugins
server.register(cors, {
  origin: config.corsOrigins,
  credentials: true,
});

server.register(helmet, {
  contentSecurityPolicy: config.isDevelopment ? false : undefined,
});

server.register(jwt, {
  secret: config.jwtSecret,
});

server.register(multipart, {
  limits: {
    fileSize: config.fileUpload.maxFileSize,
  },
});

// Usage tracking middleware
server.register(usageTrackingPlugin);

// Register Socket.io
server.register(socketioServer, {
  cors: {
    origin: config.corsOrigins,
    credentials: true,
  },
});

// Decorate server with Redis instance
server.decorate('redis', redis);

// Register routes
server.register(healthRoutes, { prefix: '/health' });
server.register(serviceRequestRoutes, { prefix: '/api/v1/service-requests' });
server.register(upsellRoutes, { prefix: '/api/v1/upsells' });
server.register(chatbotRoutes, { prefix: '/api/v1/chat' });

// Socket.io event handlers
server.ready().then(() => {
  const io: SocketIOServer = server.io;
  const chatbotService = new AIChatbotService();

  // Socket.io authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const decoded = server.jwt.verify(token);
      socket.data.user = decoded;
      next();
    } catch (error) {
      next(new Error('Invalid authentication token'));
    }
  });

  // Socket.io connection handler
  io.on('connection', (socket) => {
    const userId = socket.data.user?.userId;
    server.log.info(`Socket.io client connected: ${socket.id} (user: ${userId})`);

    // Join room based on reservation
    socket.on('join:reservation', (reservationId: string) => {
      socket.join(`reservation:${reservationId}`);
      server.log.info(`User ${userId} joined reservation room: ${reservationId}`);

      // Send acknowledgment
      socket.emit('joined:reservation', {
        reservationId,
        timestamp: new Date(),
      });
    });

    // Leave reservation room
    socket.on('leave:reservation', (reservationId: string) => {
      socket.leave(`reservation:${reservationId}`);
      server.log.info(`User ${userId} left reservation room: ${reservationId}`);
    });

    // Handle chat message
    socket.on('chat:message', async (data: {
      reservationId: string;
      content: string;
      language?: string;
    }) => {
      try {
        const { reservationId, content, language } = data;

        server.log.info(`Chat message from ${userId} in reservation ${reservationId}`);

        // Create user message
        const userMessage: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          conversationId: `conv-${reservationId}`,
          reservationId,
          role: ChatMessageRole.USER,
          content,
          createdAt: new Date(),
        };

        // Emit user message to room (including sender)
        io.to(`reservation:${reservationId}`).emit('chat:message:user', userMessage);

        // Store user message
        await storeChatMessage(userMessage);

        // Emit typing indicator
        io.to(`reservation:${reservationId}`).emit('chat:typing', {
          reservationId,
          isTyping: true,
        });

        // Get conversation context
        const context = await getConversationContext(
          reservationId,
          userId,
          language
        );

        // Get chat history
        const history = await getChatHistory(reservationId);
        context.history = history;

        // Generate AI response
        const aiResponse = await chatbotService.generateResponse(content, context);

        // Stop typing indicator
        io.to(`reservation:${reservationId}`).emit('chat:typing', {
          reservationId,
          isTyping: false,
        });

        // Create assistant message
        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
        await storeChatMessage(assistantMessage);

        // Emit assistant message to room
        io.to(`reservation:${reservationId}`).emit('chat:message:assistant', assistantMessage);

        // If escalation needed, notify staff
        if (aiResponse.shouldEscalate) {
          io.to(`reservation:${reservationId}`).emit('chat:escalation:suggested', {
            reservationId,
            reason: 'AI detected negative sentiment or escalation keywords',
          });
        }
      } catch (error) {
        server.log.error('Error processing chat message:', error);
        socket.emit('chat:error', {
          message: 'Failed to process message',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Handle typing indicator
    socket.on('chat:typing:start', (data: { reservationId: string }) => {
      socket.to(`reservation:${data.reservationId}`).emit('chat:typing', {
        reservationId: data.reservationId,
        userId,
        isTyping: true,
      });
    });

    socket.on('chat:typing:stop', (data: { reservationId: string }) => {
      socket.to(`reservation:${data.reservationId}`).emit('chat:typing', {
        reservationId: data.reservationId,
        userId,
        isTyping: false,
      });
    });

    // Handle service request updates
    socket.on('service-request:subscribe', (serviceRequestId: string) => {
      socket.join(`service-request:${serviceRequestId}`);
      server.log.info(`User ${userId} subscribed to service request: ${serviceRequestId}`);
    });

    socket.on('service-request:unsubscribe', (serviceRequestId: string) => {
      socket.leave(`service-request:${serviceRequestId}`);
    });

    // Handle upsell order updates
    socket.on('upsell:order:subscribe', (orderId: string) => {
      socket.join(`upsell:order:${orderId}`);
      server.log.info(`User ${userId} subscribed to upsell order: ${orderId}`);
    });

    socket.on('upsell:order:unsubscribe', (orderId: string) => {
      socket.leave(`upsell:order:${orderId}`);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      server.log.info(`Socket.io client disconnected: ${socket.id}`);
    });
  });

  // Helper function to get chat history
  async function getChatHistory(reservationId: string): Promise<ChatMessage[]> {
    const key = `chat:history:${reservationId}`;
    const messages = await redis.lrange(key, 0, 49);

    return messages.map(msg => {
      const data = JSON.parse(msg);
      return {
        ...data,
        createdAt: new Date(data.createdAt),
      };
    });
  }

  // Helper function to store chat message
  async function storeChatMessage(message: ChatMessage): Promise<void> {
    const key = `chat:history:${message.reservationId}`;
    await redis.lpush(key, JSON.stringify(message));
    await redis.ltrim(key, 0, 49);
    await redis.expire(key, 30 * 24 * 60 * 60); // 30 days
  }

  // Helper function to get conversation context
  async function getConversationContext(
    reservationId: string,
    userId: string,
    language?: string
  ): Promise<ChatContext> {
    // In production, fetch from Property Management Service
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
      history: [],
    };
  }
});

// Graceful shutdown
const gracefulShutdown = async () => {
  server.log.info('Received shutdown signal, closing connections...');

  // Flush pending usage reports
  await flushPendingReports();

  // Close Socket.io connections
  if (server.io) {
    server.io.close();
  }

  // Disconnect Redis
  await redis.quit();
  await redisSub.quit();

  // Close server
  await server.close();

  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const start = async () => {
  try {
    await server.listen({
      port: config.port,
      host: config.host,
    });

    server.log.info(
      `🚀 Guest Experience Service running on http://${config.host}:${config.port}`
    );
    server.log.info(`📡 Socket.io ready for real-time connections`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

// Type declarations
declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    io: SocketIOServer;
  }
}
