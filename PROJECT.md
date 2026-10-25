# Project: UACM (Unified Multi-Platform Ad Manager) — Sprint 1

## Architecture

- **Monorepo Topology**: Turborepo + pnpm workspace coordinating 2 applications (`apps/api`, `apps/web`) and 2 shared packages (`packages/shared-types`, `packages/database`).
- **Backend Modular Monolith**: NestJS in `apps/api` consuming `@uacm/shared-types` and `@uacm/database`. No network-separated microservices. Bounded contexts communicate via exported services and transactional outbox domain events.
- **Frontend App Router**: Next.js 14 App Router in `apps/web` with TypeScript, Tailwind CSS, shadcn/ui primitives, RTL support via CSS logical properties, React Hook Form with zodResolver consuming `@uacm/shared-types`.
- **Data & Precision Tier**:
  - PostgreSQL 16 (OLTP) via Prisma ORM for accounts, campaigns, workspaces, encrypted tokens, outbox events, and saga states. Non-destructive migrations.
  - Strict Financial Precision: All currency amounts stored as `BigInt` micros (1 USD = 1,000,000 micros) or integer cents. Zero float/number types for money.
  - Redis 7 for distributed mutex lock during OAuth token refresh and rate limiting.
  - RabbitMQ 3 for asynchronous background queues and DLQs.
  - ClickHouse (OLAP) on port 9004 native / 8123 HTTP for high-throughput time-series analytics.
  - MinIO S3 object storage on port 9000 API / 9001 console for direct presigned media uploads.

## Feature Inventory

| #   | Feature                           | Description                                                                                                         | Milestone | Source |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- | ------ |
| 1   | Turborepo & pnpm Workspace        | Root pnpm-workspace.yaml, package.json, and turbo.json coordinating build, test, lint, dev                          | M1        | R1     |
| 2   | Codebase Reorganization           | Move existing backend into apps/api without data loss, preserving all 300 tests                                     | M1        | R1     |
| 3   | Database Package Setup            | Create packages/database with Prisma schema, 8 historical migrations, and client generation                         | M1        | R1     |
| 4   | Docker Compose Services           | 5 services: PostgreSQL 16, Redis 7 (63790), RabbitMQ 3 (5672/15672), ClickHouse (8123/9004), MinIO (9000/9001)      | M1        | R1     |
| 5   | Financial Precision Currency      | CurrencyMicros BigInt, ISO-4217, conversion functions (dollarsToMicros, microsToCents, centsToMicros, formatMicros) | M2        | R2     |
| 6   | Canonical 3-Tier Hierarchy        | UnifiedCampaign -> UnifiedTargetingSet -> UnifiedCreativeAd models with BigInt micros                               | M2        | R2     |
| 7   | Meta Ads Zod Overrides            | Strict Zod validation: specialAdCategories, buyingType, advantageCampaignBudget, RSA, placements                    | M2        | R2     |
| 8   | Google Ads Zod Overrides          | Strict Zod validation: customerId, RSA headlines (3-15, <=30 chars), descriptions (2-4, <=90 chars)                 | M2        | R2     |
| 9   | Adapter Standard & Exceptions     | IAdPlatformAdapter contract & PlatformNormalizedException (errorCategory, isRetryable, humanReadableMessageAr)      | M2        | R2     |
| 10  | Saga & Outbox Domain Payloads     | 8-state CampaignStatus enum, valid transitions, domain event payloads, step checkpointing                           | M2        | R2     |
| 11  | Backend Workspace Consumption     | apps/api configured to consume @uacm/shared-types and @uacm/database with tsconfig path aliases                     | M3        | R3     |
| 12  | Workspaces Module & CRUD          | Bounded context workspaces module with CRUD controllers, services, and DTOs                                         | M3        | R3     |
| 13  | Multi-Tenancy Context Interceptor | WorkspaceContextInterceptor extracting x-workspace-id header and enforcing membership                               | M3        | R3     |
| 14  | RBAC Roles Guard                  | WorkspaceRolesGuard enforcing OWNER, ADMIN, MEDIA_BUYER, ANALYST, CLIENT_VIEWER                                     | M3        | R3     |
| 15  | AES-256-GCM Token Encryption      | TokenEncryptionService (v1:iv:tag:ciphertext) with tamper rejection and key derivation tests                        | M3        | R3, R5 |
| 16  | Swagger & Health Endpoints        | GET /api/health (excluded from api/v1 prefix) and GET /api/v1/workspaces with Swagger OpenAPI docs on /docs         | M3        | R3     |
| 17  | Next.js 14 App Router Frontend    | apps/web scaffold with TS, Tailwind CSS, and shadcn/ui primitives                                                   | M4        | R4     |
| 18  | Frontend RTL Support              | Full RTL layout support using CSS logical properties (dir="rtl", ms-_, pe-_, start-_, end-_)                        | M4        | R4     |
| 19  | Shared Types Form Validation      | React Hook Form + zodResolver directly consuming Zod schemas from @uacm/shared-types                                | M4        | R4     |
| 20  | App Shell & Navigation            | Sidebar navigation, Header with WorkspaceSwitcher dropdown and role badges                                          | M4        | R4     |
| 21  | Zero-CLS Skeleton Loaders         | Skeletons matching exact dimensions of tables, cards, and dropdowns (CLS = 0)                                       | M4        | R4     |
| 22  | Hermetic QA Test Matrix           | 100% hermetic tests (zero real external ad network calls), mocked fixtures                                          | M5        | R5     |
| 23  | Currency & Precision Tests        | Unit tests verifying BigInt micros / cents conversions and floating-point prevention                                | M5        | R5     |
| 24  | AES-256-GCM Tamper Tests          | Unit tests verifying authenticated encryption, IV uniqueness, and tamper rejection                                  | M5        | R5     |
| 25  | Workspace Isolation Tests         | Tests verifying cross-tenant isolation and 403 Forbidden for unauthorized workspaces                                | M5        | R5     |
| 26  | Zero 'any' & Monorepo Build       | Strict mode enabled across all tsconfig.json files, zero 'any' types, turbo build succeeds, pnpm test passes        | M5        | R5     |

## Milestones

| #   | Name                                  | Scope                                                                                                        | Dependencies   | Status      |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------- | ----------- |
| M1  | Monorepo & Infrastructure             | Turborepo setup, pnpm-workspace.yaml, docker-compose.yml, packages/database, reorganize apps/api             | none           | DONE        |
| M2  | Canonical Contracts & Shared Types    | packages/shared-types: 3-tier models, currency micros, Zod schemas, IAdPlatformAdapter, Saga payloads        | none           | DONE        |
| M3  | Modular Monolith Backend              | apps/api: workspaces module, multi-tenancy interceptor, RBAC guard, AES-256-GCM, health, swagger             | M1, M2         | DONE        |
| M4  | Next.js 14 Frontend Scaffolding       | apps/web: Tailwind, shadcn/ui, RTL, React Hook Form, App Shell, WorkspaceSwitcher, CLS=0 skeletons           | M1, M2         | DONE        |
| M5  | Hermetic QA Suite & Full Verification | Hermetic tests, currency tests, AES tamper tests, workspace isolation tests, turbo build & test verification | M1, M2, M3, M4 | DONE        |

## Interface Contracts

### packages/shared-types ↔ apps/api & apps/web

- `CurrencyMicros = bigint`, `MICROS_MULTIPLIER = 1_000_000n`, `CENTS_MULTIPLIER = 10_000n`.
- `dollarsToMicros(amount: number | string): CurrencyMicros`
- `microsToCents(micros: CurrencyMicros): bigint`
- `centsToMicros(cents: bigint | number): CurrencyMicros`
- `formatMicros(micros: CurrencyMicros, currency?: CurrencyCode): string`
- `UnifiedCampaign`, `UnifiedTargetingSet`, `UnifiedCreativeAd` 3-tier models.
- `MetaCampaignOverrideSchema`, `GoogleCampaignOverrideSchema` (RSA headlines: 3-15 items <=30 chars; descriptions: 2-4 items <=90 chars).
- `IAdPlatformAdapter` interface & `PlatformNormalizedException` class.
- `CampaignStatus` enum: `DRAFT`, `PRE_VALIDATING`, `PROCESSING_MEDIA`, `QUEUED_FOR_PUBLISH`, `PARTIALLY_LIVE`, `LIVE`, `PAUSED`, `FAILED`.
- `WorkspaceRole` enum: `OWNER`, `ADMIN`, `MEDIA_BUYER`, `ANALYST`, `CLIENT_VIEWER`.

### packages/database ↔ apps/api

- Exports `PrismaClient`, `PrismaService`, and all generated Prisma models and enums.
- Non-destructive schema including `Workspace`, `WorkspaceMember`, `User`, `RefreshToken`, `ConnectedAccount`, `UnifiedCampaign`, `UnifiedTargetingSet`, `UnifiedCreativeAd`, `PlatformExecutionRecord`, `SagaInstance`, `OutboxEvent`, `IdempotencyRecord`, `AuditLog`.

### apps/api ↔ apps/web (REST API)

- `GET /api/health`: 200 OK `{ "status": "ok", "timestamp": "...", "uptime": number, "version": "1.0.0" }`
- `GET /api/v1/workspaces`: returns list of workspaces for authenticated user with user's role in each.
- `POST /api/v1/workspaces`: body `{ "name": string, "baseCurrency": string }` -> returns created workspace.
- Header `x-workspace-id`: UUID string passed in requests for tenant isolation.

## Code Layout

```
c:\Users\Pc\Desktop\Nest Js\UACM\
├── package.json               # Monorepo root package.json
├── pnpm-workspace.yaml        # pnpm workspace definition
├── turbo.json                 # Turborepo task pipeline
├── docker-compose.yml         # 5 services: postgres, redis, rabbitmq, clickhouse, minio
├── tsconfig.base.json         # Base strict TypeScript config
├── packages/
│   ├── shared-types/          # @uacm/shared-types (contracts, Zod schemas, enums, currency)
│   └── database/              # @uacm/database (Prisma schema, migrations, client)
└── apps/
    ├── api/                   # @uacm/api (NestJS modular monolith)
    └── web/                   # @uacm/web (Next.js 14 App Router frontend)
```
