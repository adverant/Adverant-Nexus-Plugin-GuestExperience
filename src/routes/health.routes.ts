import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export async function healthRoutes(server: FastifyInstance): Promise<void> {
  server.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      status: 'healthy',
      service: 'nexus-guest-experience',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  });

  server.get('/ready', async (_request: FastifyRequest, reply: FastifyReply) => {
    // In production, check dependencies (Redis, external APIs, etc.)
    const ready = true;

    if (ready) {
      reply.send({ status: 'ready' });
    } else {
      reply.code(503).send({ status: 'not ready' });
    }
  });

  server.get('/live', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.send({ status: 'alive' });
  });
}
