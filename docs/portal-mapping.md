# Portal Mapping

## Stack

- Runtime: Node.js + Express
- Database: MongoDB with Mongoose
- Views: Pug templates
- Realtime: Socket.IO
- Payments: Razorpay
- AI integrations: OpenAI, NewsAPI, mail workflows

## Entry Points

- `config/server.js`: starts the server, opens the MongoDB connection, and initializes Socket.IO.
- `app.js`: global middleware, JWT-derived request context, role portals, and root API mounting.
- `routes/api.js`: primary API aggregator for task, user, AI, tooling, and footwear APIs.

## Major Domains

### Auth and Session

- `routes/auth.js`
- `controller/auth.js`
- `middleware/check-auth.js`

Responsibilities:
- Login/logout/reset
- JWT verification
- Role-based access control

### Role Portals

- `routes/superAdmin.js`
- `routes/admin.js`
- `routes/bdm.js`
- `routes/manager.js`
- `routes/teamlead.js`
- `routes/expert.js`
- `routes/clients.js`

Views are mirrored by role in:
- `views/superAdmin`
- `views/admin`
- `views/bdm`
- `views/manager`
- `views/teamlead`
- `views/expert`
- `views/clients`

### Task Operations Platform

Core routes:
- `routes/task/task.js`
- `routes/task/order.js`
- `routes/task/status.js`
- `routes/task/payment.js`
- `routes/task/comment.js`
- `routes/task/comm.js`
- `routes/task/briefupload.js`
- `routes/task/solutionupload.js`

Core models:
- `models/task.js`
- `models/order.js`
- `models/status.js`
- `models/payment.js`
- `models/comments.js`
- `models/comm.js`
- `models/briefupload.js`
- `models/solutionupload.js`
- `models/transaction.js`
- `models/effortsheet.js`

Responsibilities:
- Task lifecycle
- Task comments and communication
- File uploads
- Payment tracking
- Effort sheet reporting
- Client and employee work coordination

### User and Org Management

Routes:
- `routes/user/client.js`
- `routes/user/employee.js`
- `routes/user/freelancer.js`
- `routes/user/userAccountInfo.js`

Models:
- `models/user.js`
- `models/userAccountInfo.js`
- `models/attendance.js`
- `models/notification.js`

Responsibilities:
- Employee, freelancer, and client management
- User profile/account data
- Attendance and notifications

### AI and Utility Tools

Routes:
- `routes/gpt3.js`
- `routes/teamlead/aitools.js`

Controllers:
- `controller/gpt3/gpt3.js`
- `controller/gpt3/aitools.js`
- `controller/teamlead/aitools.js`
- `controller/tools/tools.js`
- `controller/superAdmin.js`

Models:
- `models/openailogs.js`
- `models/credits.js`
- `models/token.js`
- `models/paraphaser.js`
- `models/emailgenrator.js`

Responsibilities:
- Email generation
- Quiz answering
- Code generation
- Topic generation
- Keyword extraction
- Token and credit tracking
- Misc document utilities

### Footwear Operations Module

Route root:
- `routes/footwears/index.js`

Sub-routes:
- `routes/footwears/store.routes.js`
- `routes/footwears/storeLocation.routes.js`
- `routes/footwears/article.routes.js`
- `routes/footwears/sku.routes.js`
- `routes/footwears/audit.routes.js`
- `routes/footwears/stockLedger.routes.js`
- `routes/footwears/report.routes.js`
- `routes/footwears/party.routes.js`
- `routes/footwears/bill.routes.js`
- `routes/footwears/stockIn.routes.js`
- `routes/footwears/inventory.routes.js`

Models:
- `models/footwears/Store.js`
- `models/footwears/StoreLocation.js`
- `models/footwears/Article.js`
- `models/footwears/Sku.js`
- `models/footwears/Audit.js`
- `models/footwears/AuditLine.js`
- `models/footwears/StockLedger.js`
- `models/footwears/Party.js`
- `models/footwears/PartyLedger.js`
- `models/footwears/Bill.js`
- `models/footwears/BillLine.js`
- `models/footwears/StockInBill.js`
- `models/footwears/StockInBillLine.js`
- `models/footwears/Rack.js`
- `models/footwears/RackStock.js`
- `models/footwears/Return.js`

Responsibilities:
- Store and location setup
- Article and SKU catalog management
- Stock-in and stock ledger management
- Audits and variance reporting
- Party ledger tracking
- Billing and sales stock deduction
- Rack inventory placement

## Current Architecture Shape

- This is a monolithic Express app with multiple business domains sharing one deployable.
- The super-admin controller acts as both page controller and utility/API controller.
- The footwear module is more domain-structured than the legacy task module and is a good candidate to become the template for future cleanup.

## Hotspots

- `controller/superAdmin.js`: oversized mixed-responsibility controller.
- `controller/task/task.js`: large task domain controller with many aggregate/report endpoints.
- `routes/api.js`: central router for many unrelated domains.
- `views/*/partials`: role UI duplication that will slow portal-wide design updates.

## Recommended Upgrade Order

1. Configuration and secret isolation
2. Authentication consistency across all APIs
3. Controller decomposition by domain/service
4. Shared UI shell/components across roles
5. Query optimization and pagination normalization
6. Introduce tests around billing, stock, auth, and task APIs
