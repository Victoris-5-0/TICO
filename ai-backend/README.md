# TICO Python AI Backend

This directory contains the Python service for TICO's AI capabilities.

## Responsibilities

- Model/provider integrations
- Agent and workflow orchestration
- AI tutoring and coaching logic
- Code analysis and hint generation
- Personalized roadmap/mission generation
- AI evaluation and analytics logic
- API endpoints consumed by the Next.js client/backend

## Suggested layout

```text
ai-backend/
├── app/
│   ├── api/
│   ├── agents/
│   ├── services/
│   └── core/
├── tests/
└── README.md
```

Keep the service boundary explicit: the Next.js app should communicate with this backend through documented APIs rather than importing Python implementation details directly.
