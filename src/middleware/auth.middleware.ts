import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticatedRequest, JWTPayload } from '../types';

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Verify JWT token
    const payload = await request.jwtVerify<JWTPayload>();

    // Attach user to request
    (request as AuthenticatedRequest).user = payload;
  } catch (error) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or missing authentication token',
    });
  }
}

export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    const payload = await request.jwtVerify<JWTPayload>();
    (request as AuthenticatedRequest).user = payload;
  } catch {
    // Optional auth - don't throw, just don't attach user
  }
}
