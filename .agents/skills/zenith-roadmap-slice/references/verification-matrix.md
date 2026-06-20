# Zenith Verification Matrix

Choose evidence according to the boundary being changed.

| Change type | Primary evidence | Additional evidence |
|---|---|---|
| Pure shared contract or conversion | Targeted Vitest, invalid inputs, round trip | Typecheck, lint, full unit suite |
| Snapshot import/export | Valid snapshot, unsupported version, malformed artifacts, JSON safety, full state restoration | Build; Playwright save/load smoke only if user flow changes |
| Browser state or command logic | Unit tests around state transitions and artifact result application | Typecheck, lint, relevant UI smoke |
| Svelte component | Component behavior or focused unit where practical | Typecheck, lint, limited Playwright if interaction changed |
| API route | Request/response schema, status, error normalization, abort behavior | Build, no-paid-call route tests |
| Server service | Mocked upstream behavior, error/cancel path | Build and route contract tests |
| Browser/server import boundary | Typecheck and production build | Inspect generated/import graph if needed |
| Graphics/media engine | Pure math/unit tests and targeted local fixtures | Build; manual browser check if hardware behavior is not automatable |
| Job/event work | Deterministic store/event tests; cancel/failure/idempotency cases | No paid calls; compatibility stream tests |
| Asset work | Hash/reference and storage adapter tests; missing/corrupt asset cases | Browser URL resolution and cleanup evidence |

## Evidence rules

- “No exception was thrown” is not sufficient restoration evidence.
- Snapshot round trips must assert prompts, configuration, selected state, QC, and artifact metadata—not only `version`.
- Verify that portable forms do not contain functions, DOM nodes, canvas objects, File/Blob objects, or transient object URLs.
- A build is evidence of bundling compatibility, not behavioral correctness.
- A mocked API test is evidence of local control flow, not upstream service behavior.
- Manual checks must name exact steps and observations.
- Do not make automated tests depend on API secrets, paid calls, network availability, or model output variability.
