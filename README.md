+# Error Handling and System Improvements

## 1. Overview

This project contains error-handling and reliability safeguards across the React Native client, Express API, and Supabase database layer. The implemented work helps prevent duplicate or conflicting actions, validate checkout and account inputs, preserve inventory consistency, control order state transitions, and present useful errors to users instead of allowing operations to fail silently.

This document records implementations that could be verified in the current project state. It does not treat every safeguard as new work from a previous task.

## 2. Implemented Error Handling

### Client checkout submission protection

- **Feature or module:** POS and online cart checkout
- **Problem being addressed:** Double taps or overlapping submissions could place the same order more than once.
- **Implementation details:** `checkoutInProgressRef` blocks repeated checkout calls, while `checkoutSubmitting` disables the cart action and displays **“Processing checkout...”**. POS and online checkout generate an idempotency key for each request.
- **Relevant file paths:** `client/App.js`

### API request and authentication errors

- **Feature or module:** Authenticated API calls
- **Problem being addressed:** Missing configuration, expired sessions, HTTP failures, and server-provided error messages need a consistent client-side result.
- **Implementation details:** `requestApi` verifies Supabase/API configuration and the authenticated session, attaches the bearer token and optional idempotency header, parses the JSON response, and throws the server error message or a fallback message when the request is unsuccessful.
- **Relevant file paths:** `client/App.js`, `server/index.js`

### Login and registration validation

- **Feature or module:** Account authentication
- **Problem being addressed:** Invalid credentials, incomplete profiles, inactive accounts, expired guest sessions, and unconfirmed registrations can prevent normal app use.
- **Implementation details:** The client maps authentication failures to concise messages and checks profile existence, supported roles, and active status. Registration requires a name, valid email, password of at least eight characters, and contact number. Guest names are restricted to 2–100 characters and guest accounts expire after 24 hours.
- **Relevant file paths:** `client/App.js`, `server/index.js`

### Cart inventory checks

- **Feature or module:** Cart and quantity controls
- **Problem being addressed:** Users could attempt to add or increase items beyond available stock or add an out-of-stock product.
- **Implementation details:** `addToCart` prevents quantities above the displayed product stock and shows the remaining-stock or out-of-stock message. Cart quantity controls do not increase beyond `item.stock`.
- **Relevant file paths:** `client/App.js`

### Checkout and order error display

- **Feature or module:** POS, online ordering, and order loading
- **Problem being addressed:** Checkout or order-loading failures could leave the user without an understandable result.
- **Implementation details:** `checkoutError`, `checkoutNotice`, and `orderLoadError` display success or failure state. API failures are logged in the client and rendered as user-facing text. Periodic order refresh remains a fallback when live Supabase updates fail.
- **Relevant file paths:** `client/App.js`

### Server authorization and role checks

- **Feature or module:** Protected Express API routes
- **Problem being addressed:** Unauthenticated users, inactive accounts, expired guests, inactive branches, and unauthorized roles must not perform protected operations.
- **Implementation details:** `requireUser` verifies the bearer token, loads the profile, checks active status, guest expiry, branch status, and permitted roles. It returns `401`, `403`, or another route-specific response before the operation continues.
- **Relevant file paths:** `server/index.js`

### Request body, payload size, and validation errors

- **Feature or module:** Express API middleware and route validation
- **Problem being addressed:** Malformed JSON, oversized bodies, missing checkout data, invalid pickup times, and invalid reward QR codes should not reach database operations.
- **Implementation details:** Express limits JSON bodies to 256 KB and has middleware for malformed JSON and oversized payload responses. Checkout routes validate branches/items, pickup dates and role eligibility, guest channels, idempotency keys, and required fields. Reward redemption validates reward selection and 32-character hexadecimal QR codes.
- **Relevant file paths:** `server/index.js`

### Checkout idempotency and replay protection

- **Feature or module:** POS and online order checkout
- **Problem being addressed:** Network retries or repeated POST requests may otherwise create duplicate orders or replay checkout work.
- **Implementation details:** Checkout requests require a valid `Idempotency-Key`. The server creates a reservation containing `processing`, `completed`, or `failed` state; completed requests replay their stored result, failed requests may be retried, and concurrent processing requests return `409`. Successful and failed outcomes update the stored checkout state.
- **Relevant file paths:** `server/index.js`, `supabase/migrations/011_checkout_safeguards.sql`

### Database stock reservation and transaction safeguards

- **Feature or module:** POS checkout, inventory adjustments, inventory transfers, and stock movements
- **Problem being addressed:** Orders can fail after partial work or inventory can become negative during concurrent sales and adjustments.
- **Implementation details:** Supabase RPC functions validate item quantities and active branches/products, lock inventory rows with `FOR UPDATE`, verify sufficient stock, subtract inventory, and write stock movements. Negative inventory adjustments are rejected. Transfer review functions verify source/destination stock and update quantities consistently.
- **Relevant file paths:** `supabase/migrations/006_multi_branch_pos_loyalty.sql`, `supabase/migrations/011_checkout_safeguards.sql`

### Order status transition safeguards

- **Feature or module:** Order queue lifecycle
- **Problem being addressed:** Invalid statuses, unauthorized branch updates, missing orders, repeated updates, and out-of-sequence state changes can corrupt queue history or inventory.
- **Implementation details:** The status endpoint validates allowed statuses and role access. The database function verifies actor permissions and branch scope, locks the order, rejects invalid status values and impossible transitions, and prevents an update from the same status when appropriate. Cancelling an order restores items to inventory and records stock movements; completing an order adds an audit record.
- **Relevant file paths:** `server/index.js`, `supabase/migrations/010_order_queue_and_activity_sync.sql`, `supabase/migrations/011_checkout_safeguards.sql`

### Low-stock notifications

- **Feature or module:** Inventory monitoring
- **Problem being addressed:** Staff and administrators need to know when inventory crosses a low-stock threshold.
- **Implementation details:** A database trigger or notification query detects inventory at or below the configured threshold and creates a low-stock notification for head administrators.
- **Relevant file paths:** `supabase/migrations/009_low_stock_alerts.sql`

### Audit and cleanup logging

- **Feature or module:** Operational activity and resource cleanup
- **Problem being addressed:** Database or external-resource failures may occur independently of the main operation and need traceability or cleanup.
- **Implementation details:** API activity logging catches and reports insert failures without masking the primary response. Product creation removes uploaded images or database rows after downstream stock/setup failures. Channel cleanup and several catalog, report, branch, and order lookups catch and log failures. The client also logs live subscription failures while periodic polling remains available.
- **Relevant file paths:** `client/App.js`, `server/index.js`

## 3. Identified Scenarios

- **Invalid authentication or registration input:** The client and API reject missing fields, weak passwords, malformed guest names, inactive profiles, expired guests, and unsupported roles.
- **Expired or missing sessions:** API calls show a session-expired message and stop when no bearer token or valid session exists.
- **Out-of-stock or insufficient inventory:** Cart controls block quantities above stock; database checkout functions lock stock and reject insufficient quantities.
- **Duplicate checkout submissions:** A submit lock prevents repeated client actions and idempotency records prevent repeated server processing.
- **Concurrent checkout requests:** The same user/key pair can be reserved only once; concurrent processing returns a conflict instead of creating a second order.
- **Database checkout failures:** Checkout state is marked failed with the error message, allowing later retry and diagnostic visibility.
- **Malformed or oversized API payloads:** Express returns clear `400` or `413` responses instead of an unhandled JSON/parser failure.
- **Invalid pickup or branch selections:** Checkout responses explain missing branches/items, invalid pickup times, or role/channel restrictions.
- **Reward-code reuse:** Loyalty validation returns `409` when a valid redemption code has already been used.
- **Invalid order status changes:** The API and database reject unknown statuses and transitions outside the queue lifecycle.
- **Unauthorized branch operations:** Branch staff cannot update orders outside their assigned branch; protected roles are checked before operations.
- **Order cancellation:** Cancelled order items are restored to inventory and stock movements are audited.
- **Low inventory:** Head administrators receive low-stock notifications based on inventory thresholds.
- **Failed live updates or catalog loading:** The client logs subscription/query failures and retains periodic refresh or existing state where available.

## 4. Testing and Verification

### Tested and passed

- No application test suite or test files were found in the inspected project structure.
- No test commands were run as part of this documentation task, in accordance with the resource limitations.

### Implemented but not tested

- Checkout idempotency and replay handling in `server/index.js` and `011_checkout_safeguards.sql`.
- Database stock locking and inventory safeguards in `006_multi_branch_pos_loyalty.sql`.
- Order status transitions and cancellation inventory restoration in `010_order_queue_and_activity_sync.sql` and `011_checkout_safeguards.sql`.
- Low-stock notifications in `009_low_stock_alerts.sql`.
- Client-side submit locking and error rendering in `client/App.js`.
- Express request validation and authentication checks in `server/index.js`.

### Unable to verify

- Whether the migrations have been applied to the connected Supabase instance.
- Whether all scenarios pass against live data or concurrent clients.
- Whether existing users experience all client states described in this document.
- Automated test pass/fail status, because the server package's test script is only a placeholder and no test suite was present.

## 5. Remaining Improvements

The following are observations from the relevant files and are recommendations only; they are not implemented changes:

- Add a real automated test suite for checkout retries, duplicate requests, insufficient stock, order transitions, and authorization failures.
- Add integration tests for migration application and Supabase RPC behavior.
- Harden client handling of non-JSON or unreachable API responses in `requestApi`.
- Define and test idempotency-key expiration or cleanup for old `checkout_requests` rows.
- Add consistent HTTP status mapping for database and unexpected server errors rather than relying mainly on `400` responses.
- Add retry or visible degraded-mode messaging for unavailable Supabase catalog and branch queries.
- Replace demo fallback credentials and demo-state behavior before production use.

## 6. Summary

The current project includes verified client-side submission guards and stock checks, authenticated Express route validation, checkout idempotency state, database locking for inventory operations, constrained order status transitions, low-stock notifications, and audit/cleanup behavior. The most significant recent reliability evidence is in `client/App.js`, `server/index.js`, and Supabase migrations `006_multi_branch_pos_loyalty.sql`, `009_low_stock_alerts.sql`, `010_order_queue_and_activity_sync.sql`, and `011_checkout_safeguards.sql`.

No application source code was changed during this documentation task. No test suite or test pass was available to claim verification beyond static implementation evidence.
