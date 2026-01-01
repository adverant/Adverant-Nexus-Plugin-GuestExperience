
<h1 align="center">GuestExperience</h1>

<p align="center">
  <strong>AI-Powered Guest Communication</strong>
</p>

<p align="center">
  <a href="https://github.com/adverant/Adverant-Nexus-Plugin-GuestExperience/actions"><img src="https://github.com/adverant/Adverant-Nexus-Plugin-GuestExperience/workflows/CI/badge.svg" alt="CI Status"></a>
  <a href="https://github.com/adverant/Adverant-Nexus-Plugin-GuestExperience/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
  <a href="https://marketplace.adverant.ai/plugins/guest-experience"><img src="https://img.shields.io/badge/Nexus-Marketplace-purple.svg" alt="Nexus Marketplace"></a>
  <a href="https://discord.gg/adverant"><img src="https://img.shields.io/badge/Discord-Community-7289da.svg" alt="Discord"></a>
</p>

<p align="center">
  <a href="#features">Features</a> -
  <a href="#quick-start">Quick Start</a> -
  <a href="#use-cases">Use Cases</a> -
  <a href="#pricing">Pricing</a> -
  <a href="#documentation">Documentation</a>
</p>

---

## Delight Every Guest, Automatically

**GuestExperience** is a Nexus Marketplace plugin that transforms guest communications with AI-powered automated responses, intelligent concierge services, and proactive review management. Deliver 5-star experiences at scale without increasing staff.

### Why GuestExperience?

- **24/7 AI Concierge**: Instant responses to guest inquiries, any time of day
- **Smart Upselling**: Personalized offers for early check-in, late checkout, and local experiences
- **Sentiment Analysis**: Real-time monitoring of guest satisfaction
- **Multi-channel Support**: SMS, WhatsApp, Email, and in-app messaging
- **Review Management**: Automated review requests and response drafting

---

## Features

### AI-Powered Communication

| Feature | Description |
|---------|-------------|
| **AI Chatbot** | Natural language conversations powered by Claude and GPT-4 |
| **Automated Responses** | Pre-booking inquiries, check-in instructions, and FAQ handling |
| **Multi-language Support** | Communicate with guests in 50+ languages |
| **Context Awareness** | AI understands property details, booking info, and guest history |
| **Escalation Rules** | Smart routing to human agents when needed |

### Concierge Services

| Feature | Description |
|---------|-------------|
| **Local Recommendations** | Curated restaurant, activity, and attraction suggestions |
| **Service Marketplace** | Integrated DoorDash, Uber, and Instacart ordering |
| **Experience Booking** | Tours, events, and local experience reservations |
| **Transportation** | Airport transfers and car rental coordination |

### Review Management

| Feature | Description |
|---------|-------------|
| **Timing Optimization** | Request reviews at the optimal moment |
| **Response Drafting** | AI-generated review responses for approval |
| **Sentiment Tracking** | Monitor satisfaction trends across properties |

---

## Quick Start

### Installation

```bash
nexus plugin install nexus-guest-experience
```

### Send a Message via AI Chatbot

```bash
curl -X POST "https://api.adverant.ai/proxy/nexus-guest-experience/api/v1/chat" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "reservationId": "res_abc123",
    "message": "What time is check-in?",
    "channel": "sms"
  }'
```

---

## Use Cases

### Vacation Rental Hosts

#### 1. Automated Guest Communication
Let AI handle routine guest messages. From pre-booking questions to post-checkout reviews, automate the communication lifecycle.

#### 2. Revenue Opportunities
Increase revenue per booking with smart upsell offers for early check-in, late checkout, and local experiences.

### Property Management Companies

#### 3. Scale Without Hiring
Manage guest communications for hundreds of properties without proportionally increasing customer service staff.

---

## Pricing

| Feature | Starter | Professional | Enterprise |
|---------|---------|--------------|------------|
| **Price** | $99/mo | $299/mo | Custom |
| **Guests/month** | 1,000 | 10,000 | Unlimited |
| **Profiles** | Basic | + Personalization | Unlimited |
| **Sentiment Analysis** | - | Yes | Yes |
| **Custom Models** | - | - | Yes |

[View on Nexus Marketplace](https://marketplace.adverant.ai/plugins/guest-experience)

---

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/chat` | Send message to AI chatbot |
| `GET` | `/chat/:reservationId` | Get conversation history |
| `POST` | `/service-requests` | Create service request |
| `POST` | `/upsells/offer` | Generate upsell offer |
| `POST` | `/reviews/request` | Request a review |

Full API documentation: [docs/api-reference/endpoints.md](docs/api-reference/endpoints.md)

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/adverant/Adverant-Nexus-Plugin-GuestExperience.git
cd Adverant-Nexus-Plugin-GuestExperience
npm install
npm run dev
```

---

## Community & Support

- **Documentation**: [docs.adverant.ai/plugins/guest-experience](https://docs.adverant.ai/plugins/guest-experience)
- **Discord**: [discord.gg/adverant](https://discord.gg/adverant)
- **Email**: support@adverant.ai

---

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <strong>Built with care by <a href="https://adverant.ai">Adverant</a></strong>
</p>
