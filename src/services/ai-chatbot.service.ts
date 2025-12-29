import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import Sentiment from 'sentiment';
import axios from 'axios';
import { config } from '../config/config';
import {
  ChatContext,
  AIResponse,
  ChatMessage,
  NexusMemoryQuery,
  NexusMemoryResult,
} from '../types';

const sentiment = new Sentiment();

export class AIChatbotService {
  private openai: OpenAI;
  private anthropic: Anthropic;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });

    this.anthropic = new Anthropic({
      apiKey: config.anthropic.apiKey,
    });
  }

  /**
   * Generate AI response using GPT-4 with Claude fallback
   */
  async generateResponse(
    userMessage: string,
    context: ChatContext
  ): Promise<AIResponse> {
    try {
      // Try OpenAI GPT-4 first
      return await this.generateWithOpenAI(userMessage, context);
    } catch (error) {
      console.error('OpenAI failed, falling back to Claude:', error);
      // Fallback to Anthropic Claude
      return await this.generateWithClaude(userMessage, context);
    }
  }

  /**
   * Generate response using OpenAI GPT-4
   */
  private async generateWithOpenAI(
    userMessage: string,
    context: ChatContext
  ): Promise<AIResponse> {
    // Retrieve relevant memories from Nexus
    const memories = await this.recallFromNexus(userMessage, context);

    // Build system prompt with context
    const systemPrompt = this.buildSystemPrompt(context, memories);

    // Build conversation history
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...context.history.map((msg) => ({
        role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content,
      })),
      { role: 'user', content: userMessage },
    ];

    // Call OpenAI API
    const completion = await this.openai.chat.completions.create({
      model: config.openai.model,
      messages,
      max_tokens: config.openai.maxTokens,
      temperature: config.openai.temperature,
    });

    const responseContent = completion.choices[0]?.message?.content || '';
    const tokensUsed = completion.usage?.total_tokens || 0;

    // Analyze sentiment
    const sentimentResult = sentiment.analyze(responseContent);
    const sentimentScore = sentimentResult.score / Math.max(1, responseContent.split(' ').length);

    // Determine if escalation needed
    const shouldEscalate = this.shouldEscalate(userMessage, sentimentResult);

    // Detect intent
    const intent = this.detectIntent(userMessage);

    // Store interaction in Nexus
    await this.storeToNexus(userMessage, responseContent, context);

    return {
      content: responseContent,
      model: config.openai.model,
      tokens: tokensUsed,
      sentiment: {
        score: sentimentScore,
        label: this.getSentimentLabel(sentimentScore),
      },
      intent,
      shouldEscalate,
    };
  }

  /**
   * Generate response using Anthropic Claude (fallback)
   */
  private async generateWithClaude(
    userMessage: string,
    context: ChatContext
  ): Promise<AIResponse> {
    // Retrieve relevant memories from Nexus
    const memories = await this.recallFromNexus(userMessage, context);

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(context, memories);

    // Build conversation history
    const messages: Anthropic.MessageParam[] = context.history.map((msg) => ({
      role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
      content: msg.content,
    }));

    messages.push({
      role: 'user',
      content: userMessage,
    });

    // Call Anthropic API
    const completion = await this.anthropic.messages.create({
      model: config.anthropic.model,
      system: systemPrompt,
      messages,
      max_tokens: config.anthropic.maxTokens,
    });

    const responseContent = completion.content[0]?.type === 'text'
      ? completion.content[0].text
      : '';

    const tokensUsed = completion.usage.input_tokens + completion.usage.output_tokens;

    // Analyze sentiment
    const sentimentResult = sentiment.analyze(responseContent);
    const sentimentScore = sentimentResult.score / Math.max(1, responseContent.split(' ').length);

    // Determine if escalation needed
    const shouldEscalate = this.shouldEscalate(userMessage, sentimentResult);

    // Detect intent
    const intent = this.detectIntent(userMessage);

    // Store interaction in Nexus
    await this.storeToNexus(userMessage, responseContent, context);

    return {
      content: responseContent,
      model: config.anthropic.model,
      tokens: tokensUsed,
      sentiment: {
        score: sentimentScore,
        label: this.getSentimentLabel(sentimentScore),
      },
      intent,
      shouldEscalate,
    };
  }

  /**
   * Build system prompt with full context
   */
  private buildSystemPrompt(context: ChatContext, memories: NexusMemoryResult[]): string {
    const { property, reservation, guest } = context;

    let prompt = `You are a helpful AI concierge for ${property.name}, a vacation rental property.
Your role is to assist guests with their questions and needs during their stay.

## Property Information
- Name: ${property.name}
- Address: ${property.address}
- Amenities: ${property.amenities.join(', ')}`;

    if (property.wifiPassword) {
      prompt += `\n- WiFi Password: ${property.wifiPassword}`;
    }

    if (property.checkInInstructions) {
      prompt += `\n\n## Check-in Instructions\n${property.checkInInstructions}`;
    }

    prompt += `\n\n## Guest Information
- Name: ${guest.firstName} ${guest.lastName}
- Preferred Language: ${guest.language}
- Check-in: ${reservation.checkIn.toLocaleDateString()}
- Check-out: ${reservation.checkOut.toLocaleDateString()}
- Guest Count: ${reservation.guestCount}`;

    if (guest.preferences && Object.keys(guest.preferences).length > 0) {
      prompt += `\n- Preferences: ${JSON.stringify(guest.preferences)}`;
    }

    // Add relevant memories from Nexus
    if (memories.length > 0) {
      prompt += '\n\n## Relevant Past Interactions\n';
      memories.forEach((memory, idx) => {
        prompt += `${idx + 1}. ${memory.content} (relevance: ${(memory.score * 100).toFixed(0)}%)\n`;
      });
    }

    prompt += `\n\n## Guidelines
- Be friendly, professional, and helpful
- Provide accurate information about the property and local area
- If you don't know something, admit it and offer to escalate to staff
- Recommend upsell services when appropriate (food delivery, transportation, activities)
- Use the guest's preferred language when possible
- Be concise but thorough
- Show empathy and understanding
- If the guest seems frustrated or has a serious issue, suggest escalating to human staff

## Common Queries You Can Handle
- WiFi password and connectivity
- Check-in/check-out procedures
- Amenity locations and usage
- Local restaurant recommendations
- Transportation options
- Nearby attractions
- House rules
- Appliance instructions
- Parking information

## When to Escalate to Human Staff
- Maintenance emergencies
- Security concerns
- Billing disputes
- Complex complaints
- Guest appears very frustrated (negative sentiment)
- Issues you cannot resolve

Respond in ${guest.language} when appropriate.`;

    return prompt;
  }

  /**
   * Retrieve relevant memories from Nexus GraphRAG
   */
  private async recallFromNexus(
    query: string,
    context: ChatContext
  ): Promise<NexusMemoryResult[]> {
    try {
      if (!config.nexus.apiUrl) {
        return [];
      }

      const searchQuery: NexusMemoryQuery = {
        query: `${query} property:${context.property.id} guest:${context.guest.id}`,
        limit: 5,
        scoreThreshold: 0.3,
      };

      const response = await axios.post(
        `${config.nexus.apiUrl}/api/v1/memory/recall`,
        searchQuery,
        {
          headers: {
            'Authorization': `Bearer ${config.nexus.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 5000, // 5 second timeout
        }
      );

      return response.data.results || [];
    } catch (error) {
      console.error('Failed to recall from Nexus:', error);
      return []; // Graceful degradation
    }
  }

  /**
   * Store interaction in Nexus for future learning
   */
  private async storeToNexus(
    userMessage: string,
    aiResponse: string,
    context: ChatContext
  ): Promise<void> {
    try {
      if (!config.nexus.apiUrl) {
        return;
      }

      const memory = {
        content: `User: ${userMessage}\nAssistant: ${aiResponse}`,
        tags: [
          'guest-chat',
          `property:${context.property.id}`,
          `guest:${context.guest.id}`,
          `reservation:${context.reservation.id}`,
        ],
        metadata: {
          propertyId: context.property.id,
          guestId: context.guest.id,
          reservationId: context.reservation.id,
          timestamp: new Date().toISOString(),
        },
      };

      await axios.post(
        `${config.nexus.apiUrl}/api/v1/memory/store`,
        memory,
        {
          headers: {
            'Authorization': `Bearer ${config.nexus.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        }
      );
    } catch (error) {
      console.error('Failed to store to Nexus:', error);
      // Don't throw - this is non-critical
    }
  }

  /**
   * Detect user intent from message
   */
  private detectIntent(message: string): string {
    const lowerMessage = message.toLowerCase();

    const intents = [
      { keywords: ['wifi', 'password', 'internet', 'connection'], intent: 'wifi_help' },
      { keywords: ['check in', 'arrive', 'arrival', 'key', 'access'], intent: 'check_in' },
      { keywords: ['check out', 'leave', 'departure'], intent: 'check_out' },
      { keywords: ['clean', 'housekeeping', 'towel', 'linen'], intent: 'housekeeping' },
      { keywords: ['broken', 'fix', 'repair', 'not working', 'maintenance'], intent: 'maintenance' },
      { keywords: ['restaurant', 'food', 'eat', 'dining', 'delivery'], intent: 'food' },
      { keywords: ['uber', 'lyft', 'taxi', 'transport', 'ride'], intent: 'transportation' },
      { keywords: ['activity', 'things to do', 'attraction', 'tour'], intent: 'activities' },
      { keywords: ['parking', 'car', 'garage'], intent: 'parking' },
      { keywords: ['pool', 'gym', 'amenity', 'hot tub'], intent: 'amenities' },
    ];

    for (const { keywords, intent } of intents) {
      if (keywords.some(keyword => lowerMessage.includes(keyword))) {
        return intent;
      }
    }

    return 'general_inquiry';
  }

  /**
   * Determine if conversation should be escalated to human
   */
  private shouldEscalate(userMessage: string, sentimentResult: any): boolean {
    const lowerMessage = userMessage.toLowerCase();

    // Check for negative sentiment
    const sentimentScore = sentimentResult.score / Math.max(1, userMessage.split(' ').length);
    if (sentimentScore < config.sentiment.negativeThreshold) {
      return true;
    }

    // Check for escalation keywords
    const escalationKeywords = [
      'speak to manager',
      'human',
      'person',
      'staff',
      'help me',
      'emergency',
      'urgent',
      'complaint',
      'refund',
      'unacceptable',
      'disappointed',
    ];

    if (escalationKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return true;
    }

    return false;
  }

  /**
   * Get sentiment label from score
   */
  private getSentimentLabel(score: number): 'positive' | 'neutral' | 'negative' {
    if (score > config.sentiment.positiveThreshold) {
      return 'positive';
    }
    if (score < config.sentiment.negativeThreshold) {
      return 'negative';
    }
    return 'neutral';
  }

  /**
   * Translate text to target language (placeholder)
   */
  async translateText(text: string, targetLanguage: string): Promise<string> {
    // In production, integrate with Google Translate API or similar
    // For now, return original text
    console.log(`Translation requested to ${targetLanguage}: ${text}`);
    return text;
  }
}
