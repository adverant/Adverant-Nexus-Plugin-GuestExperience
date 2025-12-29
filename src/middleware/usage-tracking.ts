/**
 * Usage Tracking Middleware for Guest Experience Service
 *
 * Production-grade Fastify middleware that tracks API usage and reports to nexus-auth.
 * Implements fire-and-forget pattern for non-blocking usage reporting.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ============================================================================
// Configuration
// ============================================================================

const SERVICE_NAME = 'guest-experience';

const USAGE_TRACKING_CONFIG = {
  trackingEndpoint: process.env.USAGE_TRACKING_URL || 'http://nexus-auth:9101/internal/track-usage',
  batchSize: parseInt(process.env.USAGE_BATCH_SIZE || '10', 10),
  batchFlushIntervalMs: parseInt(process.env.USAGE_BATCH_FLUSH_MS || '5000', 10),
  enableBatching: process.env.USAGE_ENABLE_BATCHING === 'true',
  enableDetailedMetrics: process.env.USAGE_DETAILED_METRICS !== 'false',
  charsPerToken: 4,
  trackingTimeoutMs: parseInt(process.env.USAGE_TRACKING_TIMEOUT_MS || '5000', 10),
  maxRetries: parseInt(process.env.USAGE_MAX_RETRIES || '2', 10),
  retryDelayMs: parseInt(process.env.USAGE_RETRY_DELAY_MS || '1000', 10),
};

// ============================================================================
// Types
// ============================================================================

interface TenantContext {
  userId?: string;
  companyId?: string;
  appId?: string;
  requestId?: string;
  sessionId?: string;
}

interface UsageReport {
  userId: string;
  apiKeyId?: string;
  organizationId?: string;
  appId?: string;
  appUserId?: string;
  externalUserId?: string;
  departmentId?: string;
  region?: string;
  complianceMode?: string;
  courseId?: string;
  projectContext?: Record<string, unknown>;
  service: string;
  operation: string;
  model?: string;
  pluginType?: string;
  pluginId?: string;
  pluginName?: string;
  inputTokens: number;
  outputTokens: number;
  embeddingCount: number;
  gpuSeconds: number;
  storageBytes: number;
  bandwidthBytes: number;
  requestId?: string;
  sessionId?: string;
  ipAddress?: string;
  durationMs: number;
  httpStatus: number;
  metadata?: Record<string, unknown>;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  embeddingCount: number;
  model?: string;
}

interface UsageTrackingContext {
  startTime: number;
  inputTokens?: number;
  outputTokens?: number;
  embeddingCount?: number;
  model?: string;
  operation?: string;
  requestBody?: unknown;
  responseBody?: unknown;
  gpuSeconds?: number;
  storageBytes?: number;
  bandwidthBytes?: number;
}

// Extend FastifyRequest
declare module 'fastify' {
  interface FastifyRequest {
    tenantContext?: TenantContext;
    _usageTracking?: UsageTrackingContext;
  }
}

// ============================================================================
// Batch Queue
// ============================================================================

const usageQueue: UsageReport[] = [];
let batchFlushTimer: NodeJS.Timeout | null = null;

function queueReport(report: UsageReport): void {
  usageQueue.push(report);

  if (usageQueue.length >= USAGE_TRACKING_CONFIG.batchSize) {
    flushBatch();
  } else if (!batchFlushTimer) {
    batchFlushTimer = setTimeout(flushBatch, USAGE_TRACKING_CONFIG.batchFlushIntervalMs);
  }
}

async function flushBatch(): Promise<void> {
  if (batchFlushTimer) {
    clearTimeout(batchFlushTimer);
    batchFlushTimer = null;
  }

  if (usageQueue.length === 0) return;

  const batch = usageQueue.splice(0, USAGE_TRACKING_CONFIG.batchSize);

  await Promise.allSettled(
    batch.map((report) => sendUsageReport(report))
  );
}

// ============================================================================
// Token Counting
// ============================================================================

function estimateTokens(text: string | undefined | null): number {
  if (!text) return 0;
  const cleanText = typeof text === 'string' ? text : JSON.stringify(text);
  return Math.ceil(cleanText.length / USAGE_TRACKING_CONFIG.charsPerToken);
}

function calculateTokenUsage(req: FastifyRequest, responseBody?: unknown): TokenUsage {
  const tracking = req._usageTracking;

  if (tracking?.inputTokens !== undefined || tracking?.outputTokens !== undefined) {
    return {
      inputTokens: tracking.inputTokens || 0,
      outputTokens: tracking.outputTokens || 0,
      embeddingCount: tracking.embeddingCount || 0,
      model: tracking.model,
    };
  }

  const inputText = tracking?.requestBody
    ? JSON.stringify(tracking.requestBody)
    : JSON.stringify(req.body);

  const outputText = responseBody ? JSON.stringify(responseBody) : '';

  return {
    inputTokens: estimateTokens(inputText),
    outputTokens: estimateTokens(outputText),
    embeddingCount: tracking?.embeddingCount || 0,
    model: tracking?.model,
  };
}

// ============================================================================
// Operation Detection
// ============================================================================

function detectOperation(req: FastifyRequest): string {
  const path = req.url.toLowerCase();
  const method = req.method.toUpperCase();

  // Guest Experience API operations
  if (path.includes('/chat')) {
    if (path.includes('/message')) return 'chat_message';
    if (path.includes('/history')) return 'chat_history';
    return 'chat_operation';
  }
  if (path.includes('/service-request')) {
    if (method === 'POST') return 'service_request_create';
    if (method === 'PUT' || method === 'PATCH') return 'service_request_update';
    return 'service_request_query';
  }
  if (path.includes('/upsell')) {
    if (path.includes('/order')) return 'upsell_order';
    if (path.includes('/catalog')) return 'upsell_catalog';
    return 'upsell_operation';
  }
  if (path.includes('/feedback')) return 'feedback_operation';
  if (path.includes('/review')) return 'review_operation';
  if (path.includes('/concierge')) return 'concierge_operation';
  if (path.includes('/notification')) return 'notification_operation';
  if (path.includes('/escalation')) return 'escalation_operation';
  if (path.includes('/sentiment')) return 'sentiment_analysis';

  return `${method.toLowerCase()}_${path.split('/').filter(Boolean).pop() || 'unknown'}`;
}

// ============================================================================
// Usage Report Sending
// ============================================================================

async function sendUsageReport(report: UsageReport, retryCount = 0): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), USAGE_TRACKING_CONFIG.trackingTimeoutMs);

  try {
    const response = await fetch(USAGE_TRACKING_CONFIG.trackingEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Request': 'true',
        'X-Source': `nexus-${SERVICE_NAME}`,
      },
      body: JSON.stringify(report),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status === 204 || response.ok) {
      return;
    }

    const errorBody = await response.text().catch(() => 'unknown');
    console.warn(`[Usage Tracking] Error response: ${response.status} - ${errorBody}`);

    if (response.status >= 500 && retryCount < USAGE_TRACKING_CONFIG.maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, USAGE_TRACKING_CONFIG.retryDelayMs));
      return sendUsageReport(report, retryCount + 1);
    }
  } catch (error) {
    clearTimeout(timeout);

    const errorMessage = error instanceof Error ? error.message : String(error);

    if (!errorMessage.includes('abort')) {
      console.warn(`[Usage Tracking] Failed to send report: ${errorMessage}`);
    }

    if (retryCount < USAGE_TRACKING_CONFIG.maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, USAGE_TRACKING_CONFIG.retryDelayMs));
      return sendUsageReport(report, retryCount + 1);
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function isExemptPath(path: string): boolean {
  const exemptPaths = ['/health', '/healthz', '/ready', '/readiness', '/liveness', '/startup', '/metrics', '/ping', '/'];
  return exemptPaths.some((exempt) => path === exempt || path.startsWith(`${exempt}/`) || path.startsWith(`${exempt}?`));
}

function extractUserId(req: FastifyRequest): string | undefined {
  if (req.tenantContext?.userId) return req.tenantContext.userId;
  const headerUserId = req.headers['x-user-id'];
  if (typeof headerUserId === 'string' && headerUserId) return headerUserId;
  const apiKeyUserId = req.headers['x-api-key-user-id'];
  if (typeof apiKeyUserId === 'string' && apiKeyUserId) return apiKeyUserId;
  return undefined;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractApiKeyId(req: FastifyRequest): string | undefined {
  const apiKeyId = req.headers['x-api-key-id'];
  if (typeof apiKeyId === 'string' && apiKeyId && UUID_REGEX.test(apiKeyId)) return apiKeyId;
  return undefined;
}

function extractAppUserId(req: FastifyRequest): string | undefined {
  const appUserId = req.headers['x-app-user-id'];
  return typeof appUserId === 'string' ? appUserId : undefined;
}

function extractExternalUserId(req: FastifyRequest): string | undefined {
  const externalUserId = req.headers['x-external-user-id'];
  return typeof externalUserId === 'string' ? externalUserId : undefined;
}

function extractPluginType(req: FastifyRequest): string | undefined {
  const pluginType = req.headers['x-plugin-type'];
  if (typeof pluginType === 'string' && (pluginType === 'core' || pluginType === 'marketplace')) return pluginType;
  return 'core';
}

function extractPluginId(req: FastifyRequest): string | undefined {
  const pluginId = req.headers['x-plugin-id'];
  return typeof pluginId === 'string' ? pluginId : undefined;
}

function extractPluginName(req: FastifyRequest): string | undefined {
  const pluginName = req.headers['x-plugin-name'];
  return typeof pluginName === 'string' ? pluginName : undefined;
}

function extractHeader(req: FastifyRequest, headerName: string): string | undefined {
  const value = req.headers[headerName];
  return typeof value === 'string' ? value : undefined;
}

function extractProjectContext(req: FastifyRequest): Record<string, unknown> | undefined {
  const body = req.body as Record<string, unknown> | undefined;
  if (body && typeof body === 'object' && body.projectContext) {
    return body.projectContext as Record<string, unknown>;
  }
  const headerContext = req.headers['x-project-context'];
  if (typeof headerContext === 'string') {
    try {
      return JSON.parse(headerContext) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// ============================================================================
// Fastify Plugin
// ============================================================================

export async function usageTrackingPlugin(fastify: FastifyInstance): Promise<void> {
  // onRequest hook - initialize tracking context
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    if (isExemptPath(request.url)) return;

    request._usageTracking = {
      startTime: Date.now(),
    };
  });

  // preHandler hook - capture request body
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    if (!request._usageTracking) return;

    request._usageTracking.requestBody = request.body;
  });

  // onResponse hook - send usage report
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request._usageTracking) return;

    const userId = extractUserId(request);
    if (!userId) return;

    const durationMs = Date.now() - request._usageTracking.startTime;
    const tokenUsage = calculateTokenUsage(request, request._usageTracking.responseBody);
    const operation = request._usageTracking.operation || detectOperation(request);

    const report: UsageReport = {
      userId,
      apiKeyId: extractApiKeyId(request),
      organizationId: request.tenantContext?.companyId,
      appId: request.tenantContext?.appId,
      appUserId: extractAppUserId(request),
      externalUserId: extractExternalUserId(request),
      departmentId: extractHeader(request, 'x-department-id'),
      region: extractHeader(request, 'x-region'),
      complianceMode: extractHeader(request, 'x-compliance-mode'),
      courseId: extractHeader(request, 'x-course-id'),
      projectContext: extractProjectContext(request),
      service: SERVICE_NAME,
      operation,
      model: tokenUsage.model,
      pluginType: extractPluginType(request),
      pluginId: extractPluginId(request),
      pluginName: extractPluginName(request),
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      embeddingCount: tokenUsage.embeddingCount,
      gpuSeconds: request._usageTracking.gpuSeconds || 0,
      storageBytes: request._usageTracking.storageBytes || 0,
      bandwidthBytes: request._usageTracking.bandwidthBytes || 0,
      requestId: request.tenantContext?.requestId || extractHeader(request, 'x-request-id') || request.id,
      sessionId: request.tenantContext?.sessionId || extractHeader(request, 'x-session-id'),
      ipAddress: request.ip,
      durationMs,
      httpStatus: reply.statusCode,
      metadata: USAGE_TRACKING_CONFIG.enableDetailedMetrics
        ? { method: request.method, path: request.url, userAgent: request.headers['user-agent'], contentLength: request.headers['content-length'] }
        : undefined,
    };

    if (USAGE_TRACKING_CONFIG.enableBatching) {
      queueReport(report);
    } else {
      sendUsageReport(report).catch((err) => {
        console.error(`[Usage Tracking] Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  });
}

// ============================================================================
// Public Helpers
// ============================================================================

export function setTokenUsage(
  req: FastifyRequest,
  usage: { inputTokens?: number; outputTokens?: number; embeddingCount?: number; model?: string }
): void {
  if (!req._usageTracking) req._usageTracking = { startTime: Date.now() };
  if (usage.inputTokens !== undefined) req._usageTracking.inputTokens = usage.inputTokens;
  if (usage.outputTokens !== undefined) req._usageTracking.outputTokens = usage.outputTokens;
  if (usage.embeddingCount !== undefined) req._usageTracking.embeddingCount = usage.embeddingCount;
  if (usage.model !== undefined) req._usageTracking.model = usage.model;
}

export function setOperation(req: FastifyRequest, operation: string): void {
  if (!req._usageTracking) req._usageTracking = { startTime: Date.now() };
  req._usageTracking.operation = operation;
}

export function setResourceUsage(
  req: FastifyRequest,
  usage: { gpuSeconds?: number; storageBytes?: number; bandwidthBytes?: number }
): void {
  if (!req._usageTracking) req._usageTracking = { startTime: Date.now() };
  if (usage.gpuSeconds !== undefined) req._usageTracking.gpuSeconds = usage.gpuSeconds;
  if (usage.storageBytes !== undefined) req._usageTracking.storageBytes = usage.storageBytes;
  if (usage.bandwidthBytes !== undefined) req._usageTracking.bandwidthBytes = usage.bandwidthBytes;
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

export async function flushPendingReports(): Promise<void> {
  console.log(`[Usage Tracking] Flushing pending reports: ${usageQueue.length}`);
  await flushBatch();
}

process.on('beforeExit', async () => {
  await flushPendingReports();
});
