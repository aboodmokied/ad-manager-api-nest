# E2E Test Infra: UACM Sprint 1

## Test Philosophy

- 100% Hermetic & Deterministic: Zero live external ad network calls (Meta Graph API, Google Ads API).
- Methodology: Category-Partition + Boundary Value Analysis + Combinatorial Testing + Workload Verification.
- Financial Safety: Strict verification that all currency calculations and storage use BigInt micros or integer cents with zero float drift.

## Feature Inventory Coverage Matrix

| #   | Feature                           | Requirement Source        | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
| --- | --------------------------------- | ------------------------- | :----: | :----: | :----: | :----: |
| 1   | Turborepo Workspace Linking       | ORIGINAL_REQUEST § R1     |   5    |   5    |   ✓    |   ✓    |
| 2   | BigInt Currency Conversion        | ORIGINAL_REQUEST § R2     |   5    |   5    |   ✓    |   ✓    |
| 3   | Meta & Google Zod Overrides       | ORIGINAL_REQUEST § R2     |   5    |   5    |   ✓    |   ✓    |
| 4   | Adapter Interface & Exception     | ORIGINAL_REQUEST § R2     |   5    |   5    |   ✓    |   ✓    |
| 5   | Multi-Tenancy Context Interceptor | ORIGINAL_REQUEST § R3     |   5    |   5    |   ✓    |   ✓    |
| 6   | Workspace Roles RBAC Guard        | ORIGINAL_REQUEST § R3     |   5    |   5    |   ✓    |   ✓    |
| 7   | AES-256-GCM Token Encryption      | ORIGINAL_REQUEST § R3, R5 |   5    |   5    |   ✓    |   ✓    |
| 8   | Swagger & Health Endpoints        | ORIGINAL_REQUEST § R3     |   5    |   5    |   ✓    |   ✓    |
| 9   | Frontend Skeletons & RTL          | ORIGINAL_REQUEST § R4     |   5    |   5    |   ✓    |   ✓    |
| 10  | Hermetic QA Suite Execution       | ORIGINAL_REQUEST § R5     |   5    |   5    |   ✓    |   ✓    |

## Test Architecture

- Test Runner: Jest (Node.js) for unit/integration, Playwright for web E2E.
- Mock Layer: In-memory `MockPrisma`, `MockRedis`, `MockRabbitMQ`, `MockMailer`, and deterministic HTTP fixtures.
- Pass/Fail Criteria: All tests exit code 0, 0 failures, 0 leaked descriptors, zero `any` types.
