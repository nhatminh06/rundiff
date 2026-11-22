# RunDiff

RunDiff is a developer-focused dashboard for comparing repeated benchmark measurements before and after a code change. It calculates descriptive latency statistics, highlights potential regressions, imports local CSV files, and lets authenticated users save private reports for invite-only, read-only review.

The application is built with React, TypeScript, and DeepSpace 0.44.2. Demo data is synthetic and clearly labeled. Imported CSV data remains in the browser unless the user explicitly saves a report.

## Screenshots

This repository does not commit generated screenshots. To capture the current UI locally:

1. Run `npm run dev`.
2. Open `http://localhost:5173/home`.
3. Capture the dashboard at a desktop viewport such as 1440×1000 and a mobile viewport such as 390×844.
4. Sign in and open `/reports` to capture saved-report and sharing views. Use test data rather than sensitive benchmark results in screenshots.

The scaffold also provides `npm run screenshot`; inspect `npx deepspace test screenshot --help` for the installed CLI's current options.

## Features

- Two selectable synthetic benchmark datasets covering Small GEMM, Medium GEMM, and Conv2D workloads.
- Client-side CSV import with quoted fields, escaped quotes, CRLF input, row-numbered errors, and explicit file and row limits.
- Median latency, nearest-rank p95, percentage change, and deterministic bootstrap confidence intervals.
- Adjustable regression threshold and workload-status filtering.
- Immediate chart, table, summary, and measurement-detail updates.
- Authenticated creation, reopening, editing, and deletion of private reports.
- Invite-only, read-only reviewers selected from DeepSpace's public user-directory projection.
- Realtime review-status updates and access revocation over the existing RecordRoom connection.
- Loading, empty, error, signed-out, and disconnected states.

## Architecture

RunDiff keeps calculation and parsing logic independent of the UI:

- `src/lib/benchmark-csv.ts` parses and validates local CSV input.
- `src/lib/benchmark-stats.ts` contains pure statistical functions.
- `src/lib/reports.ts` converts validated datasets to and from persisted reports.
- `src/pages/(app)/home.tsx` provides the public analysis dashboard.
- `src/pages/(app)/(protected)/reports.tsx` provides authenticated report management and sharing.
- `src/schemas/reports-schema.ts` declares report storage and server-enforced permissions.

No mock API or custom database layer is used. Original measurements are stored in a DeepSpace JSON column and statistics are recalculated when a report is opened.

## DeepSpace primitives

- `DeepSpaceAuthProvider`, `useAuth`, and protected route groups for authentication.
- `RecordProvider` and `RecordScope` for the application data boundary.
- `useQuery` for live report subscriptions.
- `useMutations` confirmed mutations for server-acknowledged writes.
- `useRecordContext` for connection and mutation readiness.
- `useUsers` for the privacy-preserving public identity roster.
- Collection schemas with `createdBy`, `collaboratorsField`, and server-side role permissions.
- The existing RecordRoom WebSocket for realtime delivery and revocation.

See the [DeepSpace documentation](https://docs.deep.space/) for the platform model.

## Installation and local development

Prerequisites are Node.js 22.15–22.x (or another range accepted by `package.json`), npm 11.6 or newer, and access to the registered DeepSpace app.

```sh
npm install
npx deepspace auth login
npm run dev
```

The app normally starts at `http://localhost:5173`. Local DeepSpace secrets are managed by the CLI in the ignored `.dev.vars` file; do not commit that file.

## Testing

Run the release checks from the repository root:

```sh
npm run type-check
npm run test:unit
npm run lint
npm run build
npx deepspace test run all --port 5187
git diff --check
```

The authenticated browser suite requires two usable DeepSpace test accounts. Account credentials are managed by the DeepSpace test fixture and must not be placed in source files or command-line arguments.

## CSV input format

CSV files must contain exactly these columns, in this order:

```csv
workload,variant,latency_ms
gemm_128,baseline,2.10
gemm_128,baseline,2.14
gemm_128,candidate,2.39
gemm_128,candidate,2.42
```

Rules:

- `variant` must be `baseline` or `candidate`.
- Every workload must contain at least one measurement for both variants.
- Latency must be finite and greater than zero.
- Duplicate rows are retained as independent measurements.
- Quoted fields, escaped quotes, LF, and CRLF are supported.
- Files are limited to 1,000,000 bytes and 10,000 data rows.
- Parsing is local; selecting a file does not upload it.

## Permissions and sharing

Reports are private by default. DeepSpace sets `createdBy`; the client does not supply an owner ID.

| Caller | Read | Create | Update | Delete |
| --- | --- | --- | --- | --- |
| Signed out | No | No | No | No |
| Viewer | No | No | No | No |
| Member | Own or invited | Yes | Own only | Own only |
| Admin | Yes | Yes | Yes | Yes |

The report schema uses `collaboratorsField: "reviewers"` with member `read: "shared"`, while member updates and deletes remain `"own"`. Invited reviewers therefore receive the report but cannot change its title, samples, threshold, review status, or reviewer list—even with a custom client. Admin access follows the scaffold's explicit administrative policy.

Revocation is sent over the active RecordRoom connection. A revoked reviewer loses the record without refreshing, and a new connection receives a fresh permission-filtered snapshot. There are no public sharing links.

## Statistical methodology

- Median is calculated from sorted samples; even-sized samples use the mean of the two central values.
- p95 uses the nearest-rank convention: `ceil(0.95 × n)`, clamped to the sample range.
- Median change is `((candidate median / baseline median) - 1) × 100`; positive values are slower.
- The 95% interval is a deterministic percentile bootstrap of the median change using independent baseline and candidate resampling, 2,000 iterations, and seed 2027.
- At least five samples per variant are required for bootstrap classification.
- **Regression:** the confidence interval's lower bound is strictly greater than the selected threshold.
- **Investigate:** the observed median change exceeds the threshold but the interval does not establish it.
- **No clear regression:** the threshold is not established. This is not proof of safety.
- **Insufficient data:** a variant lacks the required sample count or valid measurements.

These intervals describe the supplied samples under independent resampling assumptions. They do not prove causation, correct benchmark bias, or establish that the underlying measurements are independent.

## Known limitations

- The 200 KB saved-sample limit is enforced by the RunDiff client, not by the DeepSpace server schema. DeepSpace 0.44.2 does not expose a supported structured-JSON byte-length constraint. A custom client can bypass this application limit; RunDiff never claims otherwise.
- CSV imports and unsaved analyses are temporary browser state.
- Reports have no public links, team workspaces, or write-capable reviewer role.
- Browser-test accounts must already exist in the local DeepSpace test pool.
- The shared React and routing entry remains the largest client asset. Dashboard, reports, DeepSpace, and UI code are split into separate cached chunks; loading cost should be measured on the intended network before further optimization.

## Design tradeoffs

- Deterministic bootstrap output favors reproducible reviews over configurable randomness.
- Confirmed mutations delay success feedback until the server acknowledges a write.
- Original samples are persisted instead of derived statistics so reopened reports can be recalculated.
- The user directory exposes only DeepSpace's public identity projection; private user records and credentials are not queried.
- Comments were omitted because DeepSpace 0.44.2 does not provide a small native cross-collection rule that securely authorizes comment creation against a private parent report.
- GitHub Actions integration was excluded to preserve the app's selected source authority and keep deployment owner-controlled.
- AI was excluded because benchmark classification is deterministic and does not require model inference.
- Payments were excluded because RunDiff has no paid workflow in this milestone.

## Future improvements

- Add a supported server-side structured-payload limit when the SDK exposes one.
- Add secure report-scoped comments if parent-record authorization becomes available without privileged custom internals.
- Add optional benchmark metadata such as environment, revision, and hardware fields.
- Profile and reduce the shared client runtime if real-user loading measurements show it materially affects the experience.
- Add export and longer-term report organization after the core private-review workflow is validated.

## Deployment

Deployment is intentionally owner-controlled. Before a release, inspect `git status`, `git remote -v`, `npx deepspace app source --json`, and `npx deepspace status --json`. Follow the source authority reported by DeepSpace; do not add or replace a Git remote to influence an unclaimed app.

When the app uses DeepSpace source, commit the reviewed clean worktree before running `npx deepspace deploy`. See [source control](https://docs.deep.space/guides/source-control) and [deployment](https://docs.deep.space/concepts/deployment) for the current release behavior.
