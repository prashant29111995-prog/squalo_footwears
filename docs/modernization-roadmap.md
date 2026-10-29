# Modernization Roadmap

## What Was Fixed In This Pass

- Moved hard-coded service credentials behind environment variables.
- Added an `.env.example` with the keys required to run the portal.
- Protected the footwear API behind authentication.
- Fixed bill listing pagination so large datasets do not return unbounded results.
- Recalculate bill totals whenever lines change.
- Allow SKU-mode bills to finalize correctly by deriving breakup rows when needed.

## Priority Backlog

### P0: Safety and Stability

- Remove every remaining checked-in secret from git history and rotate them.
- Add request validation middleware for all write endpoints.
- Add centralized error logging and request correlation IDs.
- Standardize authenticated API behavior for both JSON and browser flows.

### P1: Maintainability

- Break `controller/superAdmin.js` into page controllers, reports, and AI tool services.
- Break `controller/task/task.js` into list/detail/report/workflow modules.
- Introduce `services/` for billing, stock, ledger, and AI integrations.
- Normalize naming and casing inconsistencies such as `store` vs `Store`.

### P1: Usability

- Consolidate duplicated role layouts into shared partials/components.
- Add consistent pagination, filtering, and sort patterns across list endpoints.
- Add lightweight health and diagnostics pages for admins.

### P2: Scale

- Add indexes driven by real query patterns in task, comments, notifications, and footwear ledgers.
- Move long-running reports and AI jobs to background workers.
- Add API versioning and domain isolation so modules can evolve independently.
- Add tests for bill finalize, stock-in confirm, audit approve, and auth middleware.

## Suggested Delivery Plan

1. Secure config and auth boundaries
2. Stabilize footwear stock/billing workflows with tests
3. Decompose the super-admin and task controllers
4. Build shared UI primitives to reduce duplicated portal maintenance
5. Add operational observability and background job support
