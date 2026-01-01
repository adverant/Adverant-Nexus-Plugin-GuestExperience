# GuestAI Architecture

Technical architecture and system design for the AI-powered guest experience platform.

---

## System Overview

```mermaid
flowchart TB
    subgraph Client Layer
        A[Nexus Dashboard] --> B[API Gateway]
        C[Guest App] --> B
        D[Staff App] --> B
    end

    subgraph GuestAI Service
        B --> E[REST API Layer]
        E --> F[Profile Manager]
        E --> G[Recommendation Engine]
        E --> H[Sentiment Analyzer]
        E --> I[Insights Engine]
    end

    subgraph AI Services
        G --> J[MageAgent]
        H --> J
        I --> J
        F --> K[GraphRAG]
    end

    subgraph Data Layer
        F --> L[(PostgreSQL)]
        G --> L
        H --> L
        I --> L
        F --> M[(Vector Store)]
    end
```

---

## Core Components

### 1. REST API Layer

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/profile` | POST | Create/update guest profile |
| `/api/v1/recommendations/:guestId` | GET | Get personalized recommendations |
| `/api/v1/feedback/analyze` | POST | Analyze guest feedback |
| `/api/v1/insights` | GET | Get guest insights |

### 2. Profile Manager

Comprehensive guest profile management with preference learning.

**Capabilities:**
- Multi-source profile enrichment
- Preference inference from behavior
- Cross-property profile sync
- Privacy-compliant data handling

### 3. Recommendation Engine

AI-powered personalization engine.

**Features:**
- Context-aware recommendations
- Real-time personalization
- Multi-category suggestions
- A/B testing support

### 4. Sentiment Analyzer

Real-time sentiment analysis across all channels.

**Analysis Types:**
- Text sentiment (reviews, chat, email)
- Voice sentiment (call recordings)
- Behavioral sentiment (actions, patterns)

### 5. Insights Engine

Aggregated analytics and trend detection.

**Metrics:**
- NPS tracking
- Satisfaction trends
- Issue categorization
- Improvement recommendations

---

## Data Model

```mermaid
erDiagram
    GUESTS ||--o{ PROFILES : has
    GUESTS ||--o{ INTERACTIONS : generates
    GUESTS ||--o{ FEEDBACK : provides
    PROFILES ||--o{ PREFERENCES : contains
    GUESTS ||--o{ RECOMMENDATIONS : receives
    GUESTS ||--o{ LOYALTY : participates

    GUESTS {
        string guest_id PK
        string email
        string name
        string phone
        timestamp first_seen
        timestamp last_seen
    }

    PROFILES {
        uuid profile_id PK
        string guest_id FK
        jsonb preferences
        jsonb behavior_profile
        decimal satisfaction_score
        timestamp updated_at
    }

    PREFERENCES {
        uuid preference_id PK
        uuid profile_id FK
        string category
        string preference_key
        string preference_value
        decimal confidence
    }

    INTERACTIONS {
        uuid interaction_id PK
        string guest_id FK
        string channel
        string type
        text content
        string sentiment
        decimal sentiment_score
        timestamp created_at
    }

    FEEDBACK {
        uuid feedback_id PK
        string guest_id FK
        string property_id
        integer rating
        text content
        jsonb analysis
        timestamp created_at
    }

    RECOMMENDATIONS {
        uuid recommendation_id PK
        string guest_id FK
        string context
        jsonb items
        decimal relevance_score
        boolean accepted
        timestamp created_at
    }

    LOYALTY {
        uuid loyalty_id PK
        string guest_id FK
        string tier
        integer points_balance
        jsonb rewards_history
        timestamp enrolled_at
    }
```

---

## Security Model

### Authentication
- Bearer token via Nexus API Gateway
- Guest app uses secure token exchange
- Staff authenticated via SSO

### Authorization
- Role-based: Guest, Staff, Manager, Admin
- Property-level data isolation
- GDPR-compliant data access

### Data Protection
- PII encryption at rest and in transit
- Right to deletion support
- Consent management
- Data retention policies

```mermaid
flowchart LR
    A[Request] --> B{Valid Token?}
    B -->|No| C[401 Unauthorized]
    B -->|Yes| D{Data Access Check}
    D -->|Guest| E[Own Data Only]
    D -->|Staff| F[Property Guests]
    D -->|Admin| G[All Access]
```

---

## Deployment Architecture

### Kubernetes Configuration

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nexus-guestexperience
  namespace: nexus-plugins
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nexus-guestexperience
  template:
    spec:
      containers:
      - name: guest-api
        image: adverant/nexus-guestexperience:1.0.0
        ports:
        - containerPort: 8080
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /live
            port: 8080
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
```

### Resource Allocation

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 500m | 1000m |
| Memory | 1Gi | 2Gi |
| Disk | 3Gi | 5Gi |

---

## Integration Points

### MageAgent Integration

- **Sentiment Analysis**: Multi-modal understanding
- **Recommendation Generation**: Context-aware suggestions
- **Concierge Queries**: Natural language understanding

### GraphRAG Integration

- **Guest Knowledge**: Store and retrieve guest context
- **Property Knowledge**: Local recommendations
- **Preference Learning**: Pattern recognition

### Event Bus

| Event | Payload | Subscribers |
|-------|---------|-------------|
| `guest.profile.updated` | Profile changes | Recommendations, Analytics |
| `guest.feedback.received` | Feedback data | Sentiment, Insights |
| `guest.sentiment.negative` | Alert data | Service Recovery |

---

## Performance

### Rate Limits

| Tier | Requests/min | Guests/mo |
|------|--------------|-----------|
| Starter | 60 | 1,000 |
| Professional | 300 | 10,000 |
| Enterprise | Custom | Unlimited |

### Caching

- Guest profiles: 15 minute TTL
- Recommendations: 1 hour TTL (invalidated on profile update)
- Insights: 6 hour TTL

### Latency Targets

| Operation | Target | P99 |
|-----------|--------|-----|
| Profile Lookup | 50ms | 150ms |
| Recommendations | 200ms | 500ms |
| Sentiment Analysis | 100ms | 300ms |

---

## Monitoring

### Metrics (Prometheus)

```
# Guest metrics
guest_profiles_total
guest_interactions_total{channel, sentiment}
guest_satisfaction_score{property_id}

# Recommendation metrics
guest_recommendations_generated{category}
guest_recommendations_accepted{category}

# Sentiment metrics
guest_sentiment_scores{channel}
guest_service_recovery_triggered
```

### Alerting

| Alert | Condition | Severity |
|-------|-----------|----------|
| Negative Sentiment Spike | >20% negative in 1 hour | Warning |
| NPS Drop | >5 point drop | Warning |
| Service Recovery Backlog | >10 unresolved | Critical |

---

## Next Steps

- [Quick Start Guide](./QUICKSTART.md) - Get started quickly
- [Use Cases](./USE-CASES.md) - Implementation scenarios
- [API Reference](./docs/api-reference/endpoints.md) - Complete docs
