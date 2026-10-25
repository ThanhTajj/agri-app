# Review notes — `POST /api/materials`

## 1. Scope and limitations

### Scope reviewed

- Requirements and working rules: `SPEC.md`, `AGENTS.md`.
- Endpoint flow: `src/routes/materialsRoutes.js`, `src/controllers/materialsController.js`, `src/services/materialsService.js`.
- Access control and errors: `src/middlewares/requireAuthentication.js`, `src/middlewares/requirePermission.js`, `src/middlewares/errorHandler.js`, `src/errors/HttpError.js`.
- Persistence: `src/repositories/materialRepository.js`, `src/repositories/idempotencyRepository.js`, `src/models/Material.js`, `src/models/IdempotencyRequest.js`, `src/database/migrations/20261025213000-create-materials-and-idempotency-requests.js`.
- Tests: `tests/unit/materials/createMaterial.test.js`, `tests/unit/materials/materialsRoute.test.js`, `tests/integration/materials/materialIdempotency.test.js`.
- Development-environment context only: `.gitignore`, `.env.example`, `docker-compose.yml`, `package.json`, `src/database/sequelize.js`, `src/database/checkConnection.js`. `.env` contents were not read.

### Workspace and review limitations

- The current `git status --short --untracked-files=all` output shows project files as staged additions (`A`); `review-notes.md` is `AM` (staged addition plus a worktree modification). This status does not establish who staged them or their original baseline. No other file was edited in this task, and no stage/unstage operation was performed.
- `.env` exists and `git check-ignore -v .env` reports it ignored. Its contents were not read.
- There is no production app entry point/authentication provider in the reviewed source tree. The router requires an injected `authenticate` function; its production implementation and permission provider could not be verified.
- This review covers the `POST /api/materials` slice and related idempotency/access controls, not stock receipt/issue APIs.

## 2. Correctness checklist

**FAIL — test/integration confidence is insufficient; this is not a confirmed service implementation defect.**

- **Validation and normalization:** Service trims and collapses whitespace, uppercases code, rejects unsupported fields and enforces lengths (`src/services/materialsService.js:11–60`). Unit tests cover normalization, required fields, length boundaries, client-supplied fields and stock initial value (`tests/unit/materials/createMaterial.test.js:140–243`).
- **Duplicate handling:** Service checks the normalized code and returns `409 MATERIAL_CODE_DUPLICATE`; the repository maps a unique-constraint error to the same API error (`src/services/materialsService.js:110–120`, `src/repositories/materialRepository.js:21–31`). A unique DB index exists (`src/database/migrations/20261025213000-create-materials-and-idempotency-requests.js:51–54`). Current unit coverage is sequential and uses an in-memory fake; no MySQL race test exists for two different idempotency keys using the same normalized code.
- **Initial stock and response:** Service creates with `stockQuantity: 0` and returns the normalized material shape (`src/services/materialsService.js:63–76, 121–125`); unit and route tests cover the value and `201` envelope.
- **Idempotency:** Unit tests cover replay, changed payload, expiry and concurrent requests in a fake harness (`tests/unit/materials/createMaterial.test.js:281–374`). MySQL integration cases cover persistence, expiry and concurrent same-key requests, but their code casing conflicts with service normalization; a previous MySQL run reported four failures. That integration suite was not rerun in this task.
- **Side effects:** Unit tests assert no material is created on validation/duplicate paths. Actual MySQL persistence and the cleanup behavior of the failing integration tests were not exercised in this task.

## 3. Security checklist

**NOT VERIFIED for production authentication; reviewed endpoint safeguards are present in the code.**

- **Authentication and authorization in route:** Router requires an injected `authenticate` function, then runs `requireAuthentication` and `requirePermission('materials:create')` before the controller (`src/routes/materialsRoutes.js:6–18`). The middleware checks server auth context (`src/middlewares/requireAuthentication.js:3–14`, `src/middlewares/requirePermission.js:3–12`).
- **Client-controlled identity/permissions:** Controller passes `req.auth.userId` and `req.auth.permissions`; service allow-lists request fields and rejects `userId`, `role`, `permissions`, and `stockQuantity` (`src/controllers/materialsController.js:4–8`, `src/services/materialsService.js:18–27`). Unit tests cover those rejected fields and a client-supplied permission not overriding a denied server context (`tests/unit/materials/createMaterial.test.js:217–243, 459–475`).
- **SQL injection and data exposure:** Material lookup/write uses Sequelize model methods and a fixed `where` value (`src/repositories/materialRepository.js:12–31`). Error middleware returns a generic `500 INTERNAL_ERROR` for unexpected errors without serializing the underlying error (`src/middlewares/errorHandler.js:3–42`); a unit test checks the database message is not present in the response (`tests/unit/materials/createMaterial.test.js:397–408`). No evidence of SQL injection or stack/detail leakage was found in the reviewed path.
- **Production auth limitation:** Route tests inject a fake middleware that assigns `req.auth` (`tests/unit/materials/materialsRoute.test.js:7–18`). This verifies route behavior for supplied contexts, not JWT signature/issuer/audience validation or a trusted permission provider. This is the already documented, unresolved `GAP-02` (`SPEC.md:371`); it is not evidence that a production deployment is currently vulnerable.

## 4. Consistency checklist

**FAIL — the integration test inputs/assertions do not follow the normalized-code contract.**

- Spec and service agree that code is normalized to uppercase and used consistently in storage/response (`SPEC.md:1–16, 31, 52`; `src/services/materialsService.js:40–41, 63–76`).
- Migration maps the specified `materials` columns and applies the case-sensitive code collation plus unique index; the Sequelize model maps `materialId` and `stockQuantity` to `material_id` and `stock_quantity` (`src/database/migrations/20261025213000-create-materials-and-idempotency-requests.js:20–54`; `src/models/Material.js:8–44`).
- Controller success response matches the `success/data/error` envelope and `201` status (`src/controllers/materialsController.js:4–15`).
- In contrast, MySQL integration tests generate lowercase UUID material codes and use those original values for assertions and cleanup (`tests/integration/materials/materialIdempotency.test.js:15, 58, 88, 114–115, 134, 167`). The service stores uppercase values, so the tests do not reflect the specified persisted value. This is a **test defect**, not evidence the implementation violates the normalization rule.
- `AGENTS.md` requires tests to reflect Spec, avoid trusting client identity/permissions and avoid reporting unverified results. This report keeps the known prior results distinct from work run in this task.

## 5. Findings

1. **[MINOR] Test defect — inconsistent normalized code in MySQL idempotency tests.** File: `tests/integration/materials/materialIdempotency.test.js`, lines 15, 58, 88, 114–115, 134, 167; compared with `src/services/materialsService.js`, lines 40–41. The test helper produces lowercase UUID characters, while the service uppercases code before storing/responding. Database count assertions and the expiry response assertion use the unnormalized input. The cleanup also queries with original lowercase codes, which will not match the uppercase values under the migration's case-sensitive collation. The previous MySQL run reported four failures consistent with this mismatch. **Impact:** integration tests fail when enabled; failing tests can leave material rows behind. **Fix:** normalize generated codes once and use that canonical value in requests, DB assertions and cleanup, or generate codes that are uppercase from the start. **Spec change:** not required; BR-003 and AC-MAT-02 already define the expected normalization.

2. **[MINOR] Missing test — concurrent duplicate normalized code with different idempotency keys.** Evidence: sequential fake-repository duplicate test at `tests/unit/materials/createMaterial.test.js:261–278`; existing MySQL concurrency tests at `tests/integration/materials/materialIdempotency.test.js:118–169` use the same key/payload or same key/different payload; DB unique index at `src/database/migrations/20261025213000-create-materials-and-idempotency-requests.js:51–54`; unique error mapping at `src/repositories/materialRepository.js:21–31`. No current test exercises two concurrent creates with different idempotency keys and the same normalized code. **Impact:** concurrency safety and the losing request's `409 MATERIAL_CODE_DUPLICATE` response are not demonstrated by tests. This is a missing test, not a proven implementation bug. **Fix:** add a MySQL integration case using two Sequelize instances, distinct idempotency keys and inputs that normalize to the same code; assert one successful create, one `409 MATERIAL_CODE_DUPLICATE`, one material row, and reliable cleanup. **Spec change:** not required; BR-002, AC-MAT-03 and the storage rule in section 6 cover uniqueness and concurrent protection.

3. **[SPEC GAP — NOT VERIFIED] Production authentication provider is not available for review.** Evidence: router accepts a dependency-injected `authenticate` middleware at `src/routes/materialsRoutes.js:6–18`; route tests supply their own middleware at `tests/unit/materials/materialsRoute.test.js:7–18`; `SPEC.md:371` records unresolved `GAP-02`. **Impact:** production token verification and permissions-provider behavior cannot be confirmed. This is not a finding that a vulnerability exists. **Next step:** obtain and approve GAP-02 deployment choices, integrate the trusted provider, and verify it with production-path tests before deployment.

## 6. AI shortcomings and evidence

### Finding 1 — test normalization defect

- **Evidence:** `createCode()` at `tests/integration/materials/materialIdempotency.test.js:15` returns a string containing lowercase UUID characters. The service uppercases normalized code at `src/services/materialsService.js:40–41`. Integration assertions query/compare the original codes at `materialIdempotency.test.js:88, 114–115, 134, 167`; `afterAll` cleanup queries `createdCodes` at lines 57–58.
- **Classification:** **Test defect.** The implementation's uppercase normalization matches Spec. No evidence supports classifying this as an implementation defect.
- **Observed effect:** the earlier integration run in this session reported four failures at the affected DB assertions/expiry comparison. Integration tests were not run again in the current task.
- **Concrete correction:** store the canonical uppercase code in the test fixture and use it consistently for DB queries, result expectations, and cleanup. Keep the tests asserting the public normalized code rather than weakening those assertions.

### Finding 2 — missing DB concurrency test for duplicate code

- **Evidence:** `createMaterial.test.js:261–278` tests duplicate handling sequentially with the in-memory `Map` harness. The MySQL concurrency cases at `materialIdempotency.test.js:118–169` concern idempotency-key races, not duplicate normalized code with independent keys. The migration has `uq_materials_code` and the repository translates unique-constraint failures, but that path is not exercised concurrently by an integration test.
- **Classification:** **Missing test**, not a confirmed implementation bug.
- **Concrete correction:** add the integration scenario described in Finding 2 and verify both response outcomes and final persisted row count, with cleanup using canonical code values.

These are two independently evidenced AI shortcomings. Neither requires changing a clear Spec rule.

## 7. Spec Traceability and Remediation

### Finding 1 — lowercase integration fixtures

1. **Spec reference:** BR-003 and AC-MAT-02 require trimming/collapsing whitespace and uppercasing code before storage and response. The schema description for `code` also specifies uppercase normalization and the case-sensitive collation (`SPEC.md:31, 52, 302`).
2. **Evidence:** lowercase-generating fixture and original-case assertions/cleanup at `tests/integration/materials/materialIdempotency.test.js:15, 58, 88, 114–115, 134, 167`; normalization in `src/services/materialsService.js:40–41`.
3. **Classification:** **Test defect**; implementation behavior is aligned with the Spec.
4. **Spec action:** `No Spec change required`.
5. **Proposed remediation:** generate a canonical uppercase material code and use it in every assertion and cleanup query. Preserve assertions that response/storage contain the canonical value.
6. **Verification:** after the test-only fix, set `$env:AGRISTOCK_MYSQL_TESTS='true'` in PowerShell and run `npm test` against an explicitly isolated test database; confirm the four existing persistence scenarios pass and that no test-created material remains. This is a proposed test run only; it was not run in this task.

### Finding 2 — missing concurrent unique-code integration case

1. **Spec reference:** BR-002 requires a duplicate normalized code to be rejected with `409 MATERIAL_CODE_DUPLICATE`; AC-MAT-03 specifies no second material is created. Section 6 explicitly requires a storage-level unique constraint on normalized code to prevent two concurrent requests from creating duplicates (`SPEC.md:30, 303, 277`).
2. **Evidence:** sequential fake-based duplicate test at `tests/unit/materials/createMaterial.test.js:261–278`; unique migration index at `src/database/migrations/20261025213000-create-materials-and-idempotency-requests.js:51–54`; repository unique-error mapping at `src/repositories/materialRepository.js:21–31`; no corresponding independent-key MySQL race case in `tests/integration/materials/materialIdempotency.test.js:66–169`.
3. **Classification:** **Missing test**, not a confirmed implementation defect. The expected business/storage behavior is already specified.
4. **Spec action:** `No Spec change required`.
5. **Proposed remediation:** add an integration test with two concurrent requests, different `Idempotency-Key` values, and inputs that normalize to the same code. Assert exactly one `201`, one `409 MATERIAL_CODE_DUPLICATE`, one persisted material, and reliable cleanup.
6. **Verification:** run the targeted integration test against the isolated MySQL test database after fixing fixture casing; confirm the response codes and final row count. Do not use a mocked repository as a substitute for this database constraint test. This test run is proposed only and was not run in this task.

### Finding 3 — unresolved production authentication integration

1. **Spec reference:** BR-014–BR-016 and AC-AUTH-01–03 require verified server auth context and server-verified permission; GAP-02 asks for the JWT scheme, algorithms, issuer/audience, key and trusted permission source (`SPEC.md:42–44, 327–329, 371`).
2. **Evidence:** the route requires an injected authenticator (`src/routes/materialsRoutes.js:6–18`), while tests inject a fake (`tests/unit/materials/materialsRoute.test.js:7–18`). The actual production provider and app mounting path were not present in the reviewed source.
3. **Classification:** **Spec gap / integration not verified**, already identified by GAP-02. Not a confirmed vulnerability or implementation defect.
4. **Spec action:** `Clarify or add acceptance criterion` only after the deployment owner supplies the unresolved values. GAP-02 already names the decisions needed; do not invent credentials, algorithms, issuer values or permissions sources during this review.
5. **Proposed wording for a future Spec update** (recorded here only; `SPEC.md` was not edited):

   > **Production authentication acceptance:** Before mounting `POST /api/materials` in a production application, approve and document the accepted Authorization scheme, JWT algorithms, issuer, audience, key source/rotation process, and trusted permissions provider. Integration tests using that provider must demonstrate: missing or invalid credentials return `401 AUTHENTICATION_REQUIRED`; a valid authenticated identity without server-granted `materials:create` returns `403 FORBIDDEN`; a valid identity with that permission can proceed; and client-supplied identity/role/permission fields cannot change the authenticated context. The production route must not be enabled while these deployment decisions or the trusted provider are absent.

6. **Verification:** once approved and integrated, run tests through the actual app/router wiring with valid, missing, invalid, and insufficient-permission credentials. Mock-only route tests do not satisfy this verification. No such test was run in this task.

## 8. Test evidence

### Results recorded from earlier runs

- `npm test` in the previous review run: **PASS** — 2 test files passed, 1 skipped; 31 tests passed, 4 skipped. This result is carried forward from that run, not produced in the current task.
- MySQL integration run during the earlier environment-setup task with `AGRISTOCK_MYSQL_TESTS=true npm test`: **FAIL** — 4 integration tests failed. The recorded failures were three case-sensitive DB count assertions returning zero for lowercase fixture codes, and one expiry assertion comparing the uppercase response code to the lowercase input. This is an earlier observed result, not a rerun in this task.

### Current task

- **No tests were run in this task.** In particular, the MySQL integration tests were not rerun because they can write records.
- No migration, database read/write, application startup, dependency installation, or service change was performed.

### Coverage and limitations

- Unit tests cover normalization, required fields, length limits, client-supplied forbidden fields, initial stock, sequential duplicate rejection, idempotency behaviors in the fake harness, and generic error envelopes.
- MySQL integration tests include replay, expiration and idempotency-key concurrency scenarios, but the earlier run failed and the current task did not rerun them. There is no integration test for duplicate normalized code racing under different idempotency keys.
- Authentication/authorization tests use mocked auth context/middleware. They do **not** prove production JWT signature, issuer, audience, algorithm, key management or permission-provider integration.

## 9. Conclusion and acceptance criteria

**Not ready to accept as fully verified end-to-end.**

Before treating this slice as verified:

1. Correct the integration test code casing and cleanup, then run the integration suite against an isolated test database; the existing recorded four failures must be resolved, not treated as passing.
2. Add and run a MySQL integration test for concurrent duplicate normalized codes using different idempotency keys. The test must prove exactly one persisted material and the duplicate request's `409 MATERIAL_CODE_DUPLICATE`.
3. Before production deployment, resolve GAP-02, integrate the trusted authentication/permission provider, and verify the actual production path. Mocked auth tests alone are insufficient.

No confirmed implementation defect was established by the two AI-shortcoming findings: the first is a test defect; the second is a missing test. The production authentication status remains **NOT VERIFIED**, not a claim of an exploitable vulnerability. No Spec change is required for the first two findings because their expected behavior is already specified. GAP-02 remains an unresolved owner decision; the proposed acceptance wording above is for a future approved Spec update only.
