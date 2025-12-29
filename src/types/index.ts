import { FastifyRequest } from 'fastify';

// ============================================================================
// Service Request Types
// ============================================================================

export enum ServiceRequestType {
  HOUSEKEEPING = 'housekeeping',
  MAINTENANCE = 'maintenance',
  AMENITY = 'amenity',
  CONCIERGE = 'concierge',
}

export enum ServiceRequestPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum ServiceRequestStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface ServiceRequest {
  id: string;
  reservationId: string;
  propertyId: string;
  guestId: string;
  type: ServiceRequestType;
  priority: ServiceRequestPriority;
  status: ServiceRequestStatus;
  title: string;
  description: string;
  location?: string;
  photoUrls?: string[];
  assignedTo?: string;
  assignedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  guestRating?: number;
  guestFeedback?: string;
  estimatedCompletionTime?: Date;
  slaDeadline: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateServiceRequestDto {
  reservationId: string;
  type: ServiceRequestType;
  priority: ServiceRequestPriority;
  title: string;
  description: string;
  location?: string;
  photoUrls?: string[];
}

export interface UpdateServiceRequestDto {
  status?: ServiceRequestStatus;
  assignedTo?: string;
  priority?: ServiceRequestPriority;
  estimatedCompletionTime?: Date;
}

export interface RateServiceRequestDto {
  rating: number; // 1-5
  feedback?: string;
}

// ============================================================================
// Upsell Types
// ============================================================================

export enum UpsellCategory {
  FOOD_DELIVERY = 'food_delivery',
  GROCERY_DELIVERY = 'grocery_delivery',
  TRANSPORTATION = 'transportation',
  EARLY_CHECKIN = 'early_checkin',
  LATE_CHECKOUT = 'late_checkout',
  EXTRA_CLEANING = 'extra_cleaning',
  LOCAL_ACTIVITIES = 'local_activities',
  RESTAURANT_RESERVATION = 'restaurant_reservation',
}

export enum UpsellOrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export interface UpsellItem {
  id: string;
  category: UpsellCategory;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl?: string;
  available: boolean;
  metadata?: Record<string, any>;
}

export interface UpsellOrder {
  id: string;
  reservationId: string;
  propertyId: string;
  guestId: string;
  items: Array<{
    upsellId: string;
    quantity: number;
    price: number;
    metadata?: Record<string, any>;
  }>;
  totalAmount: number;
  currency: string;
  status: UpsellOrderStatus;
  paymentIntentId?: string;
  externalOrderId?: string;
  externalProvider?: string;
  scheduledFor?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  refundedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUpsellOrderDto {
  reservationId: string;
  items: Array<{
    upsellId: string;
    quantity: number;
    metadata?: Record<string, any>;
  }>;
  scheduledFor?: Date;
}

export interface UberRideEstimate {
  productId: string;
  productName: string;
  estimate: string;
  estimatedDuration: number;
  estimatedPrice: {
    low: number;
    high: number;
    currency: string;
  };
}

// ============================================================================
// Chat Types
// ============================================================================

export enum ChatMessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  reservationId: string;
  role: ChatMessageRole;
  content: string;
  metadata?: {
    model?: string;
    tokens?: number;
    sentiment?: {
      score: number;
      label: 'positive' | 'neutral' | 'negative';
    };
    intent?: string;
    escalated?: boolean;
  };
  createdAt: Date;
}

export interface ChatConversation {
  id: string;
  reservationId: string;
  propertyId: string;
  guestId: string;
  language: string;
  active: boolean;
  escalated: boolean;
  escalatedTo?: string;
  escalatedAt?: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SendMessageDto {
  reservationId: string;
  content: string;
  language?: string;
}

export interface ChatContext {
  reservation: {
    id: string;
    checkIn: Date;
    checkOut: Date;
    guestCount: number;
  };
  property: {
    id: string;
    name: string;
    address: string;
    amenities: string[];
    wifiPassword?: string;
    checkInInstructions?: string;
  };
  guest: {
    id: string;
    firstName: string;
    lastName: string;
    language: string;
    preferences?: Record<string, any>;
  };
  history: ChatMessage[];
}

export interface AIResponse {
  content: string;
  model: string;
  tokens: number;
  sentiment: {
    score: number;
    label: 'positive' | 'neutral' | 'negative';
  };
  intent?: string;
  shouldEscalate: boolean;
}

// ============================================================================
// Authentication
// ============================================================================

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  propertyId?: string;
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: JWTPayload;
}

// ============================================================================
// Nexus Integration
// ============================================================================

export interface NexusMemoryQuery {
  query: string;
  limit?: number;
  scoreThreshold?: number;
}

export interface NexusMemoryResult {
  content: string;
  score: number;
  metadata?: Record<string, any>;
}

export interface NexusStoreMemoryDto {
  content: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

// ============================================================================
// Event Types
// ============================================================================

export enum EventType {
  SERVICE_REQUEST_CREATED = 'service_request.created',
  SERVICE_REQUEST_UPDATED = 'service_request.updated',
  SERVICE_REQUEST_COMPLETED = 'service_request.completed',
  UPSELL_ORDER_CREATED = 'upsell_order.created',
  UPSELL_ORDER_COMPLETED = 'upsell_order.completed',
  CHAT_MESSAGE_SENT = 'chat.message.sent',
  CHAT_ESCALATED = 'chat.escalated',
}

export interface DomainEvent {
  id: string;
  type: EventType;
  aggregateId: string;
  aggregateType: string;
  payload: Record<string, any>;
  timestamp: Date;
  userId?: string;
}
