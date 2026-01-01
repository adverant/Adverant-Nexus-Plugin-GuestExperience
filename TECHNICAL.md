# GuestExperience Technical Specification

Complete technical reference for integrating the GuestExperience plugin.

---

## API Reference

### Base URL

```
https://api.adverant.ai/proxy/nexus-guestexperience/api/v1/guest
```

All endpoints require authentication via Bearer token in the Authorization header.

---

### Endpoints

#### Create/Update Guest Profile

```http
POST /profile
```

Creates or updates a guest profile with preferences and history.

**Request Body:**
```json
{
  "guestId": "guest_abc123 (optional - omit for new)",
  "email": "john.smith@example.com",
  "firstName": "John",
  "lastName": "Smith",
  "phone": "+1-555-123-4567",
  "preferences": {
    "roomTemperature": 72,
    "pillowType": "firm",
    "dietaryRestrictions": ["gluten-free"],
    "communicationChannel": "sms",
    "language": "en"
  },
  "loyaltyInfo": {
    "tier": "gold",
    "pointsBalance": 15000,
    "memberSince": "2020-06-15"
  },
  "tags": ["business_traveler", "frequent_guest"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "guestId": "guest_abc123",
    "email": "john.smith@example.com",
    "name": "John Smith",
    "profileComplete": true,
    "preferences": {...},
    "loyaltyTier": "gold",
    "totalStays": 12,
    "lifetimeValue": 8500,
    "createdAt": "2020-06-15T10:30:00Z",
    "updatedAt": "2024-01-15T14:30:00Z"
  }
}
```

---

#### Get Personalized Recommendations

```http
GET /recommendations/:guestId
```

Returns AI-powered personalized recommendations based on guest profile, stay context, and property amenities.

**Query Parameters:**
- `category`: `dining | activities | services | experiences | all`
- `propertyId`: Filter by property
- `stayDate`: Current or upcoming stay date
- `limit`: Number of recommendations

**Response:**
```json
{
  "success": true,
  "data": {
    "guestId": "guest_abc123",
    "recommendations": [
      {
        "id": "rec_xyz789",
        "category": "dining",
        "type": "restaurant",
        "title": "Ocean View Bistro",
        "description": "Farm-to-table restaurant with gluten-free options",
        "reason": "Based on your dietary preferences and past dining choices",
        "rating": 4.8,
        "distance": "0.3 miles",
        "priceRange": "$$",
        "matchScore": 0.95,
        "bookingUrl": "https://...",
        "availableSlots": ["18:00", "19:30", "21:00"]
      },
      {
        "id": "rec_abc456",
        "category": "activities",
        "type": "experience",
        "title": "Sunrise Yoga on the Beach",
        "description": "Start your day with oceanfront yoga",
        "reason": "Popular with business travelers seeking relaxation",
        "rating": 4.9,
        "duration": "60 minutes",
        "price": 45,
        "matchScore": 0.88
      }
    ],
    "context": {
      "stayDates": "2024-01-20 to 2024-01-23",
      "propertyId": "prop_abc123",
      "guestPreferences": ["gluten-free", "wellness"]
    }
  }
}
```

---

#### Analyze Guest Feedback

```http
POST /feedback/analyze
```

Analyzes guest feedback using sentiment analysis and topic extraction.

**Request Body:**
```json
{
  "feedbackId": "fb_xyz789 (optional)",
  "guestId": "guest_abc123",
  "stayId": "stay_def456",
  "source": "survey | review | email | chat | social",
  "text": "The room was beautiful and the staff was incredibly helpful. However, the WiFi was slow during my stay.",
  "rating": 4,
  "createdAt": "2024-01-15T10:30:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "feedbackId": "fb_xyz789",
    "analysis": {
      "overallSentiment": "positive",
      "sentimentScore": 0.72,
      "topics": [
        {
          "topic": "room_quality",
          "sentiment": "positive",
          "score": 0.95,
          "phrases": ["room was beautiful"]
        },
        {
          "topic": "staff_service",
          "sentiment": "positive",
          "score": 0.92,
          "phrases": ["staff was incredibly helpful"]
        },
        {
          "topic": "wifi_connectivity",
          "sentiment": "negative",
          "score": -0.65,
          "phrases": ["WiFi was slow"]
        }
      ],
      "emotions": {
        "satisfaction": 0.75,
        "frustration": 0.25,
        "delight": 0.60
      },
      "actionItems": [
        {
          "priority": "high",
          "category": "infrastructure",
          "issue": "WiFi performance issues",
          "suggestedAction": "Review WiFi capacity and consider upgrade"
        }
      ],
      "responseRecommendation": {
        "tone": "appreciative_with_acknowledgment",
        "keyPoints": [
          "Thank for positive feedback on room and staff",
          "Acknowledge WiFi issue and explain improvement plans"
        ],
        "draftResponse": "Dear John, Thank you for your wonderful feedback..."
      }
    }
  }
}
```

---

#### Get Guest Insights

```http
GET /insights
```

Returns aggregated insights across all guests.

**Query Parameters:**
- `propertyId`: Filter by property
- `dateRange`: `week | month | quarter | year | custom`
- `startDate`: For custom range
- `endDate`: For custom range
- `segment`: `all | loyalty | first_time | repeat`

**Response:**
```json
{
  "success": true,
  "data": {
    "period": {
      "start": "2024-01-01",
      "end": "2024-01-31"
    },
    "overview": {
      "totalGuests": 1250,
      "newGuests": 380,
      "returningGuests": 870,
      "averageSatisfaction": 4.5,
      "nps": 72
    },
    "sentimentTrends": {
      "overall": {
        "positive": 0.78,
        "neutral": 0.15,
        "negative": 0.07
      },
      "byCategory": {
        "room": { "positive": 0.85, "trend": "up" },
        "service": { "positive": 0.82, "trend": "stable" },
        "amenities": { "positive": 0.75, "trend": "up" },
        "dining": { "positive": 0.72, "trend": "down" }
      }
    },
    "topIssues": [
      {
        "category": "wifi",
        "mentions": 45,
        "sentiment": -0.6,
        "trend": "increasing"
      }
    ],
    "topPraises": [
      {
        "category": "staff_friendliness",
        "mentions": 180,
        "sentiment": 0.9,
        "trend": "stable"
      }
    ],
    "loyaltyMetrics": {
      "activeMembers": 5200,
      "pointsRedeemed": 2500000,
      "tierDistribution": {
        "bronze": 2500,
        "silver": 1800,
        "gold": 700,
        "platinum": 200
      }
    }
  }
}
```

---

#### Send AI Chat Message

```http
POST /chat
```

Sends a message through the AI chatbot.

**Request Body:**
```json
{
  "reservationId": "res_abc123",
  "guestId": "guest_xyz789",
  "message": "What time is check-in and can I get early check-in?",
  "channel": "sms | whatsapp | email | in_app",
  "context": {
    "propertyId": "prop_abc123",
    "checkIn": "2024-02-15",
    "checkOut": "2024-02-18"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "msg_abc123",
    "response": "Hi John! Check-in time is 3:00 PM. I'd be happy to check on early check-in availability for you. Based on current bookings, it looks like early check-in at 1:00 PM should be possible for an additional $25. Would you like me to arrange that for you?",
    "intent": "check_in_inquiry",
    "confidence": 0.95,
    "upsellOffered": {
      "type": "early_check_in",
      "price": 25,
      "availability": true
    },
    "sentAt": "2024-01-15T10:30:00Z",
    "channel": "sms"
  }
}
```

---

#### Create Upsell Offer

```http
POST /upsells/offer
```

Generates a personalized upsell offer.

**Request Body:**
```json
{
  "guestId": "guest_abc123",
  "reservationId": "res_xyz789",
  "offerTypes": ["early_check_in", "late_checkout", "room_upgrade", "experience"],
  "context": {
    "arrivalTime": "11:00",
    "departureTime": "14:00"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "offers": [
      {
        "offerId": "offer_abc123",
        "type": "early_check_in",
        "title": "Early Check-In at 11:00 AM",
        "description": "Start your stay earlier",
        "originalPrice": 50,
        "discountedPrice": 35,
        "discount": 0.30,
        "reason": "Frequent guest discount",
        "availability": true,
        "expiresAt": "2024-02-14T23:59:59Z"
      },
      {
        "offerId": "offer_def456",
        "type": "room_upgrade",
        "title": "Ocean View Suite Upgrade",
        "description": "Upgrade to our premium ocean view suite",
        "originalPrice": 150,
        "discountedPrice": 100,
        "discount": 0.33,
        "reason": "Gold member exclusive",
        "availability": true
      }
    ],
    "totalPotentialRevenue": 135
  }
}
```

---

## Authentication

### Bearer Token

```bash
curl -X GET "https://api.adverant.ai/proxy/nexus-guestexperience/api/v1/guest/insights" \
  -H "Authorization: Bearer YOUR_NEXUS_API_TOKEN"
```

### Token Scopes

| Scope | Description |
|-------|-------------|
| `guest:read` | View guest profiles and insights |
| `guest:write` | Create/update guest profiles |
| `guest:feedback` | Analyze feedback |
| `guest:recommendations` | Get recommendations |
| `guest:chat` | Use AI chatbot |
| `guest:upsell` | Create upsell offers |

---

## Rate Limits

| Tier | Requests/Minute | Guests/Month |
|------|-----------------|--------------|
| Starter | 60 | 1,000 |
| Professional | 120 | 10,000 |
| Enterprise | 300 | Unlimited |

---

## Data Models

### Guest Profile

```typescript
interface GuestProfile {
  guestId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  preferences: GuestPreferences;
  loyaltyInfo?: LoyaltyInfo;
  tags: string[];
  totalStays: number;
  lifetimeValue: number;
  averageRating: number;
  lastStay?: string;
  createdAt: string;
  updatedAt: string;
}

interface GuestPreferences {
  roomTemperature?: number;
  pillowType?: string;
  floorPreference?: 'high' | 'low' | 'any';
  bedType?: 'king' | 'queen' | 'twin';
  dietaryRestrictions?: string[];
  communicationChannel: 'sms' | 'email' | 'whatsapp' | 'in_app';
  language: string;
  specialRequests?: string[];
}

interface LoyaltyInfo {
  memberId?: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  pointsBalance: number;
  memberSince: string;
  lifetimePoints: number;
}
```

### Feedback Analysis

```typescript
interface FeedbackAnalysis {
  feedbackId: string;
  guestId: string;
  stayId: string;
  source: FeedbackSource;
  text: string;
  rating?: number;
  analysis: {
    overallSentiment: 'positive' | 'neutral' | 'negative';
    sentimentScore: number;
    topics: TopicAnalysis[];
    emotions: EmotionScores;
    actionItems: ActionItem[];
    responseRecommendation?: ResponseRecommendation;
  };
  createdAt: string;
}

type FeedbackSource = 'survey' | 'review' | 'email' | 'chat' | 'social';

interface TopicAnalysis {
  topic: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  score: number;
  phrases: string[];
}
```

### Recommendation

```typescript
interface Recommendation {
  id: string;
  category: 'dining' | 'activities' | 'services' | 'experiences';
  type: string;
  title: string;
  description: string;
  reason: string;
  rating?: number;
  distance?: string;
  priceRange?: string;
  price?: number;
  duration?: string;
  matchScore: number;
  bookingUrl?: string;
  availableSlots?: string[];
}
```

---

## SDK Integration

### JavaScript/TypeScript SDK

```typescript
import { NexusClient } from '@nexus/sdk';

const nexus = new NexusClient({
  apiKey: process.env.NEXUS_API_KEY,
});

// Create guest profile
const guest = await nexus.guest.createProfile({
  email: 'john@example.com',
  firstName: 'John',
  lastName: 'Smith',
  preferences: {
    communicationChannel: 'sms',
    dietaryRestrictions: ['gluten-free'],
  },
});

// Get recommendations
const recommendations = await nexus.guest.getRecommendations(guest.guestId, {
  category: 'dining',
  propertyId: 'prop_abc123',
});

// Analyze feedback
const analysis = await nexus.guest.analyzeFeedback({
  guestId: guest.guestId,
  text: 'Great stay! The room was perfect.',
  source: 'survey',
  rating: 5,
});

// Send chat message
const response = await nexus.guest.chat({
  guestId: guest.guestId,
  reservationId: 'res_xyz',
  message: 'What time is checkout?',
  channel: 'sms',
});

console.log(response.response);
```

### Python SDK

```python
from nexus import NexusClient

client = NexusClient(api_key=os.environ["NEXUS_API_KEY"])

# Create guest profile
guest = client.guest.create_profile(
    email="john@example.com",
    first_name="John",
    last_name="Smith",
    preferences={
        "communication_channel": "sms",
        "dietary_restrictions": ["gluten-free"]
    }
)

# Get recommendations
recommendations = client.guest.get_recommendations(
    guest.guest_id,
    category="dining",
    property_id="prop_abc123"
)

# Analyze feedback
analysis = client.guest.analyze_feedback(
    guest_id=guest.guest_id,
    text="Great stay! The room was perfect.",
    source="survey",
    rating=5
)

print(f"Sentiment: {analysis.analysis.overall_sentiment}")
```

---

## WebSocket API

### Real-time Chat

```javascript
const ws = new WebSocket('wss://api.adverant.ai/proxy/nexus-guestexperience/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'YOUR_API_TOKEN'
  }));

  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'chat',
    guestId: 'guest_abc123'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'guest_message') {
    console.log(`Guest: ${message.text}`);
  } else if (message.type === 'ai_response') {
    console.log(`AI: ${message.response}`);
  }
};
```

---

## Error Handling

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Malformed request body |
| `GUEST_NOT_FOUND` | 404 | Guest profile not found |
| `RESERVATION_NOT_FOUND` | 404 | Reservation not found |
| `AUTHENTICATION_REQUIRED` | 401 | Missing or invalid token |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `QUOTA_EXCEEDED` | 402 | Monthly guest limit reached |

---

## Deployment Requirements

### Container Specifications

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 500m | 1000m |
| Memory | 1Gi | 2Gi |
| Storage | 2Gi | 5Gi |
| Timeout | 2 min | 5 min |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXUS_API_KEY` | Yes | Nexus platform API key |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GRAPHRAG_URL` | Yes | GraphRAG service URL |
| `MAGEAGENT_URL` | Yes | MageAgent AI service URL |
| `TWILIO_ACCOUNT_SID` | No | Twilio for SMS |
| `TWILIO_AUTH_TOKEN` | No | Twilio authentication |

### Health Checks

```yaml
livenessProbe:
  httpGet:
    path: /live
    port: 8080
  initialDelaySeconds: 30

readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 5
```

---

## Integrations

### Communication Channels

| Channel | Provider | Features |
|---------|----------|----------|
| SMS | Twilio | Two-way messaging |
| WhatsApp | Twilio | Rich media support |
| Email | SendGrid | Templates, tracking |
| In-App | Native | Real-time chat |

### Service Integrations

| Service | Features |
|---------|----------|
| DoorDash | Food delivery |
| Uber | Transportation |
| Instacart | Grocery delivery |
| OpenTable | Restaurant reservations |
| Viator | Experience booking |

---

## Quotas and Limits

| Limit | Starter | Professional | Enterprise |
|-------|---------|--------------|------------|
| Guests/Month | 1,000 | 10,000 | Unlimited |
| Messages/Day | 500 | 5,000 | Unlimited |
| Feedback Analyses | 100 | 1,000 | Unlimited |
| Recommendations/Day | 500 | 5,000 | Unlimited |
| Custom Models | No | No | Yes |

---

## Support

- **Documentation**: [docs.adverant.ai/plugins/guestexperience](https://docs.adverant.ai/plugins/guestexperience)
- **API Status**: [status.adverant.ai](https://status.adverant.ai)
- **Support Email**: support@adverant.ai
- **Discord**: [discord.gg/adverant](https://discord.gg/adverant)
