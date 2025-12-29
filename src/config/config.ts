import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

export const config = {
  // Server Configuration
  env: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV !== 'production',
  port: parseInt(process.env.PORT || '3006', 10),
  host: process.env.HOST || '0.0.0.0',
  logLevel: process.env.LOG_LEVEL || 'info',

  // Security
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),

  // AI Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.AI_MODEL_PRIMARY || 'gpt-4-turbo-preview',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '1000', 10),
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.AI_MODEL_FALLBACK || 'claude-3-sonnet-20240229',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '1000', 10),
  },

  // Nexus GraphRAG Integration
  nexus: {
    apiUrl: process.env.NEXUS_API_URL || 'http://nexus-graphrag:9001',
    apiKey: process.env.NEXUS_API_KEY || '',
  },

  // Service URLs
  services: {
    propertyManagement: process.env.PROPERTY_MANAGEMENT_URL || 'http://nexus-property-management:3001',
    communication: process.env.COMMUNICATION_SERVICE_URL || 'http://nexus-communication:3005',
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'nexus-redis',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '4', 10),
  },

  // RabbitMQ Configuration
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://nexus-rabbitmq:5672',
    exchange: process.env.RABBITMQ_EXCHANGE || 'nexus-events',
    queue: process.env.RABBITMQ_QUEUE || 'guest-experience-events',
  },

  // Third-Party APIs
  thirdParty: {
    // Uber Rides API Configuration
    uber: {
      apiKey: process.env.UBER_API_KEY || '',
      apiSecret: process.env.UBER_API_SECRET || '',
      clientId: process.env.UBER_CLIENT_ID || '',
      sandboxMode: process.env.UBER_SANDBOX_MODE === 'true',
    },

    // DoorDash Drive API Configuration
    doordash: {
      developerId: process.env.DOORDASH_DEVELOPER_ID || '',
      keyId: process.env.DOORDASH_KEY_ID || '',
      signingSecret: process.env.DOORDASH_SIGNING_SECRET || '',
      sandboxMode: process.env.DOORDASH_SANDBOX_MODE === 'true',
    },

    // Instacart Platform API Configuration
    instacart: {
      apiKey: process.env.INSTACART_API_KEY || '',
      partnerId: process.env.INSTACART_PARTNER_ID || '',
      sandboxMode: process.env.INSTACART_SANDBOX_MODE === 'true',
    },
  },

  // File Upload Configuration
  fileUpload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB
    allowedMimeTypes: (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif,image/webp').split(','),
  },

  // Service Request SLA (in minutes)
  sla: {
    low: parseInt(process.env.SLA_LOW_MINUTES || '1440', 10), // 24 hours
    normal: parseInt(process.env.SLA_NORMAL_MINUTES || '240', 10), // 4 hours
    high: parseInt(process.env.SLA_HIGH_MINUTES || '60', 10), // 1 hour
    urgent: parseInt(process.env.SLA_URGENT_MINUTES || '15', 10), // 15 minutes
  },

  // Sentiment Analysis
  sentiment: {
    negativeThreshold: parseFloat(process.env.SENTIMENT_THRESHOLD_NEGATIVE || '-0.5'),
    positiveThreshold: parseFloat(process.env.SENTIMENT_THRESHOLD_POSITIVE || '0.5'),
  },
} as const;

// Validation
if (!config.isDevelopment) {
  const requiredEnvVars = [
    'JWT_SECRET',
    'OPENAI_API_KEY',
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
