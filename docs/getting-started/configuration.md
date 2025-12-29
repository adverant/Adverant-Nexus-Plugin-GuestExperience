# Configuration

## Environment Variables

Copy `.env.example` to `.env` and configure the following:

```bash
cp .env.example .env
```

## Required Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Service port | `9020` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `JWT_SECRET` | JWT signing secret | - |

## Optional Configuration

See `.env.example` for all available options.
