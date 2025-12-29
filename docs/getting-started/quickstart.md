# Quick Start

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

## 3. Run Database Migrations

```bash
npm run prisma:generate
npm run prisma:migrate
```

## 4. Start the Server

```bash
npm run dev
```

## 5. Test the API

```bash
curl http://localhost:9020/health
```
