import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import Redis from 'ioredis';
import { config } from '../config/config';
import {
  ServiceRequest,
  CreateServiceRequestDto,
  UpdateServiceRequestDto,
  RateServiceRequestDto,
  ServiceRequestStatus,
  ServiceRequestPriority,
} from '../types';

export class ServiceRequestService {
  private redis: Redis;
  private readonly CACHE_PREFIX = 'service-request:';
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
    });
  }

  /**
   * Create a new service request
   */
  async createServiceRequest(
    dto: CreateServiceRequestDto,
    guestId: string,
    propertyId: string
  ): Promise<ServiceRequest> {
    const now = new Date();
    const slaMinutes = this.getSLAMinutes(dto.priority);
    const slaDeadline = dayjs(now).add(slaMinutes, 'minute').toDate();

    const serviceRequest: ServiceRequest = {
      id: uuidv4(),
      reservationId: dto.reservationId,
      propertyId,
      guestId,
      type: dto.type,
      priority: dto.priority,
      status: ServiceRequestStatus.PENDING,
      title: dto.title,
      description: dto.description,
      location: dto.location,
      photoUrls: dto.photoUrls,
      slaDeadline,
      createdAt: now,
      updatedAt: now,
    };

    // Store in Redis (in production, also store in database)
    await this.cacheServiceRequest(serviceRequest);

    // Publish event for notification
    await this.publishServiceRequestCreatedEvent(serviceRequest);

    return serviceRequest;
  }

  /**
   * Get service request by ID
   */
  async getServiceRequestById(id: string): Promise<ServiceRequest | null> {
    const cached = await this.getCachedServiceRequest(id);
    if (cached) {
      return cached;
    }

    // In production, fetch from database
    // For now, return null if not in cache
    return null;
  }

  /**
   * Get all service requests for a reservation
   */
  async getServiceRequestsByReservation(
    reservationId: string
  ): Promise<ServiceRequest[]> {
    // In production, query database
    // For now, return empty array
    // This would be: SELECT * FROM service_requests WHERE reservationId = ?
    return [];
  }

  /**
   * Update service request
   */
  async updateServiceRequest(
    id: string,
    dto: UpdateServiceRequestDto
  ): Promise<ServiceRequest> {
    const existing = await this.getServiceRequestById(id);
    if (!existing) {
      throw new Error('Service request not found');
    }

    const updated: ServiceRequest = {
      ...existing,
      ...dto,
      updatedAt: new Date(),
    };

    // Handle status-specific updates
    if (dto.status) {
      switch (dto.status) {
        case ServiceRequestStatus.ASSIGNED:
          if (dto.assignedTo) {
            updated.assignedAt = new Date();
          }
          break;
        case ServiceRequestStatus.COMPLETED:
          updated.completedAt = new Date();
          break;
        case ServiceRequestStatus.CANCELLED:
          updated.cancelledAt = new Date();
          break;
      }
    }

    // Update cache
    await this.cacheServiceRequest(updated);

    // Publish update event
    await this.publishServiceRequestUpdatedEvent(updated);

    return updated;
  }

  /**
   * Rate a completed service request
   */
  async rateServiceRequest(
    id: string,
    dto: RateServiceRequestDto
  ): Promise<ServiceRequest> {
    const existing = await this.getServiceRequestById(id);
    if (!existing) {
      throw new Error('Service request not found');
    }

    if (existing.status !== ServiceRequestStatus.COMPLETED) {
      throw new Error('Can only rate completed service requests');
    }

    if (dto.rating < 1 || dto.rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const updated: ServiceRequest = {
      ...existing,
      guestRating: dto.rating,
      guestFeedback: dto.feedback,
      updatedAt: new Date(),
    };

    await this.cacheServiceRequest(updated);

    return updated;
  }

  /**
   * Assign service request to staff
   */
  async assignServiceRequest(
    id: string,
    staffId: string,
    estimatedCompletion?: Date
  ): Promise<ServiceRequest> {
    return this.updateServiceRequest(id, {
      status: ServiceRequestStatus.ASSIGNED,
      assignedTo: staffId,
      estimatedCompletionTime: estimatedCompletion,
    });
  }

  /**
   * Get SLA minutes based on priority
   */
  private getSLAMinutes(priority: ServiceRequestPriority): number {
    switch (priority) {
      case ServiceRequestPriority.LOW:
        return config.sla.low;
      case ServiceRequestPriority.NORMAL:
        return config.sla.normal;
      case ServiceRequestPriority.HIGH:
        return config.sla.high;
      case ServiceRequestPriority.URGENT:
        return config.sla.urgent;
      default:
        return config.sla.normal;
    }
  }

  /**
   * Check if service request is overdue
   */
  isOverdue(serviceRequest: ServiceRequest): boolean {
    if (serviceRequest.status === ServiceRequestStatus.COMPLETED ||
        serviceRequest.status === ServiceRequestStatus.CANCELLED) {
      return false;
    }

    return dayjs().isAfter(serviceRequest.slaDeadline);
  }

  /**
   * Get overdue service requests
   */
  async getOverdueServiceRequests(propertyId: string): Promise<ServiceRequest[]> {
    // In production, query database:
    // SELECT * FROM service_requests
    // WHERE propertyId = ?
    //   AND status NOT IN ('completed', 'cancelled')
    //   AND slaDeadline < NOW()
    return [];
  }

  /**
   * Cache service request in Redis
   */
  private async cacheServiceRequest(serviceRequest: ServiceRequest): Promise<void> {
    const key = `${this.CACHE_PREFIX}${serviceRequest.id}`;
    await this.redis.setex(key, this.CACHE_TTL, JSON.stringify(serviceRequest));
  }

  /**
   * Get cached service request from Redis
   */
  private async getCachedServiceRequest(id: string): Promise<ServiceRequest | null> {
    const key = `${this.CACHE_PREFIX}${id}`;
    const cached = await this.redis.get(key);
    if (!cached) {
      return null;
    }

    const data = JSON.parse(cached);

    // Parse dates
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      slaDeadline: new Date(data.slaDeadline),
      assignedAt: data.assignedAt ? new Date(data.assignedAt) : undefined,
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      cancelledAt: data.cancelledAt ? new Date(data.cancelledAt) : undefined,
      estimatedCompletionTime: data.estimatedCompletionTime
        ? new Date(data.estimatedCompletionTime)
        : undefined,
    };
  }

  /**
   * Publish service request created event
   */
  private async publishServiceRequestCreatedEvent(
    serviceRequest: ServiceRequest
  ): Promise<void> {
    // In production, publish to RabbitMQ for notification service
    console.log('Service request created event:', {
      id: serviceRequest.id,
      type: serviceRequest.type,
      priority: serviceRequest.priority,
      propertyId: serviceRequest.propertyId,
    });
  }

  /**
   * Publish service request updated event
   */
  private async publishServiceRequestUpdatedEvent(
    serviceRequest: ServiceRequest
  ): Promise<void> {
    // In production, publish to RabbitMQ
    console.log('Service request updated event:', {
      id: serviceRequest.id,
      status: serviceRequest.status,
    });
  }

  /**
   * Cleanup
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
