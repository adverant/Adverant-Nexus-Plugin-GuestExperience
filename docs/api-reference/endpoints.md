# API Reference

## Base URL

```
https://api.adverant.ai/proxy/<plugin-name>/api/v1
```

## Authentication

All endpoints require Bearer token authentication:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" ...
```

## Health Endpoints

### GET /health
Check service health status.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0"
}
```

## See Also

- [Installation](../getting-started/installation.md)
- [Configuration](../getting-started/configuration.md)
