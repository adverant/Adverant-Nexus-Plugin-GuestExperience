# GuestAI Quick Start Guide

Increase guest satisfaction by 25% and boost repeat bookings by 40% with AI-powered personalization, sentiment analysis, and proactive service recovery. Get your first guest profile running in under 5 minutes.

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Nexus Platform | 1.0.0+ | Plugin runtime environment |
| Node.js | 20+ | JavaScript runtime (for SDK) |
| API Key | - | Authentication |

## Installation Methods

### Method 1: Nexus Marketplace (Recommended)

1. Navigate to **Marketplace** in your Nexus Dashboard
2. Search for "GuestAI"
3. Click **Install** and select your pricing tier
4. The plugin activates automatically within 60 seconds

### Method 2: Nexus CLI

```bash
nexus plugin install nexus-guestexperience
nexus config set GUESTEXPERIENCE_API_KEY your-api-key-here
```

### Method 3: API Installation

```bash
curl -X POST https://api.adverant.ai/v1/plugins/install \
  -H "Authorization: Bearer YOUR_NEXUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "pluginId": "nexus-guestexperience",
    "tier": "professional",
    "autoActivate": true
  }'
```

---

## Your First Operation: Create a Guest Profile

### Step 1: Set Your API Key

```bash
export NEXUS_API_KEY="your-api-key-here"
```

### Step 2: Create Guest Profile

```bash
curl -X POST "https://api.adverant.ai/proxy/guest/api/v1/profile" \
  -H "Authorization: Bearer $NEXUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "guest@example.com",
    "name": "Sarah Johnson",
    "preferences": {
      "roomType": "ocean_view",
      "pillowType": "firm",
      "dietaryRestrictions": ["vegetarian"]
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "guestId": "guest-abc123",
    "profileComplete": true,
    "personalizationScore": 0.85,
    "createdAt": "2025-01-01T10:30:00Z"
  }
}
```

---

## API Reference

**Base URL:** `https://api.adverant.ai/proxy/guest/api/v1`

### Create/Update Guest Profile
```bash
curl -X POST "https://api.adverant.ai/proxy/guest/api/v1/profile" \
  -H "Authorization: Bearer $NEXUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "guest@example.com",
    "name": "Sarah Johnson",
    "preferences": {"roomType": "ocean_view"}
  }'
```

### Get Personalized Recommendations
```bash
curl -X GET "https://api.adverant.ai/proxy/guest/api/v1/recommendations/guest-abc123" \
  -H "Authorization: Bearer $NEXUS_API_KEY"
```

### Analyze Guest Feedback
```bash
curl -X POST "https://api.adverant.ai/proxy/guest/api/v1/feedback/analyze" \
  -H "Authorization: Bearer $NEXUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "guestId": "guest-abc123",
    "feedback": "The room was clean but the check-in took too long.",
    "source": "post_stay_survey"
  }'
```

### Get Guest Insights
```bash
curl -X GET "https://api.adverant.ai/proxy/guest/api/v1/insights?period=last_30_days" \
  -H "Authorization: Bearer $NEXUS_API_KEY"
```

---

## SDK Examples

### TypeScript

```typescript
import { NexusClient } from '@adverant/nexus-sdk';

const nexus = new NexusClient({
  apiKey: process.env.NEXUS_API_KEY
});

const guest = nexus.plugin('nexus-guestexperience');

// Create guest profile
const profile = await guest.profile.create({
  email: 'guest@example.com',
  name: 'Sarah Johnson',
  preferences: {
    roomType: 'ocean_view',
    pillowType: 'firm'
  }
});

console.log(`Guest ID: ${profile.guestId}`);

// Get personalized recommendations
const recommendations = await guest.recommendations.get({
  guestId: profile.guestId,
  context: 'pre_arrival',
  limit: 5
});

recommendations.items.forEach(rec => {
  console.log(`${rec.category}: ${rec.title}`);
});

// Analyze feedback
const analysis = await guest.feedback.analyze({
  guestId: profile.guestId,
  feedback: 'Great stay! The pool was amazing.',
  source: 'review'
});

console.log(`Sentiment: ${analysis.sentiment}`);
console.log(`Score: ${analysis.score}/10`);
```

### Python

```python
from adverant_nexus import NexusClient
import os

nexus = NexusClient(api_key=os.environ["NEXUS_API_KEY"])
guest = nexus.plugin("nexus-guestexperience")

# Create guest profile
profile = guest.profile.create(
    email="guest@example.com",
    name="Sarah Johnson",
    preferences={
        "room_type": "ocean_view",
        "pillow_type": "firm"
    }
)

print(f"Guest ID: {profile.guest_id}")

# Analyze feedback sentiment
analysis = guest.feedback.analyze(
    guest_id=profile.guest_id,
    feedback="The room was clean but check-in was slow.",
    source="post_stay_survey"
)

print(f"Sentiment: {analysis.sentiment}")
print(f"Key Issues: {analysis.issues}")

# Get insights
insights = guest.insights.get(period="last_30_days")
print(f"NPS Score: {insights.nps}")
print(f"Top Issue: {insights.top_issues[0]}")
```

---

## Pricing

| Tier | Price | Guests/mo | Features |
|------|-------|-----------|----------|
| **Starter** | $99/mo | 1,000 | Basic profiles, Feedback collection |
| **Professional** | $299/mo | 10,000 | Personalization, Sentiment analysis, Recommendations |
| **Enterprise** | Custom | Unlimited | Loyalty integration, Custom models |

---

## Next Steps

- [Use Cases Guide](./USE-CASES.md) - Real-world implementation scenarios
- [Architecture Overview](./ARCHITECTURE.md) - System design and integration
- [API Reference](./docs/api-reference/endpoints.md) - Complete endpoint documentation

## Support

- **Documentation**: [docs.adverant.ai/plugins/guestexperience](https://docs.adverant.ai/plugins/guestexperience)
- **Community**: [community.adverant.ai](https://community.adverant.ai)
- **Email**: plugins@adverant.ai