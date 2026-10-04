# Secondhand admin

React + TypeScript + Vite moderator panel for the Secondhand mobile app. Uses the same Firebase Authentication, Firestore, Storage URLs, and callable functions in `asia-south1`.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:5174. `.env.local` is configured from the mobile app's Firebase web configuration, pointing to `seconhand-acf04`. For another checkout, copy `.env.example` to `.env.local` and fill all six values. Never add service account credentials to this app. Firebase web configuration is public; server authorization protects staff data.

## Access

Email/password sign-in only. Users must have the Firebase Authentication custom claim `moderator: true`, and their account must not be suspended or pending deletion. Ordinary accounts are signed out immediately without mounting admin data views. Uses browser session persistence. Claims refresh every five minutes; server checks enforce permissions on every action. No signup or self-assignment of roles.

Grant a role using the existing trusted operator script, from the mobile repository:

```sh
node functions/scripts/manage-safety.cjs grant-moderator --project seconhand-acf04 --uid TRUSTED_UID --confirm ROLE
```

The script requires Application Default Credentials with appropriate Firebase administrative permissions. Sign out and sign in after a role change. New moderators must accept the current community rules before using the panel.

## Features

- Paginated open reports and review history, 25 per page, oldest first.
- Inspect captured listing/profile evidence and the reported conversation's recent ten messages.
- Dismiss a report, permanently remove a reported listing, or suspend a reported member. Each decision needs a reason and explicit confirmation. Server records moderator UID, action, note, and timestamp.
- Paginated member profiles, account restriction status, and links to their listings.
- Paginated listings including active, sold, and removed records, image/detail previews, and filtering by exact seller UID.

Users shows marketplace profiles, not the Firebase Authentication user directory. Suspension and listing removal happen through open reports. No access to unreported private conversations. Deletion requests and appeals remain in the existing verified support/operator workflow.

## Backend and publishing

The existing report, acceptance, and review callables are reused. The updated Firestore rules were deployed to `seconhand-acf04` on 2026-10-04. For another project, deploy the rules from the mobile repository; they permit active moderators to get another member's account restriction status, without listing the accountStates collection. Reports remain readable only by active moderators; client writes remain denied.

```sh
npx firebase-tools deploy --project seconhand-acf04 --only firestore:rules
```

The existing `reports` status/createdAt index supports both queue views. Wait for indexes to finish building.

```sh
npm run lint
npm run typecheck
npm run build
```

Serve `dist` on an HTTPS static host. Add the admin hostname to Firebase Authentication → Settings → Authorized domains. Keep the admin separate from the public marketing website. This project is not yet hosted.

## Browser verification

From the mobile repository, after `npm --prefix functions run build`, run `npm run test:admin-ui` (Java 21+ required). This uses the demo Firebase emulators and launches the admin dev server on port 5176 with isolated test configuration. It checks denied ordinary-user login, moderator login, report review/history, account status, seller listing pagination, responsive layout, and logout. It does not write to the live Firebase project.

Validation completed: admin lint/typecheck/build, dependency audit (0 vulnerabilities), 38 backend regression tests, 5 mobile browser smoke tests, and all admin browser checks. The panel has not been hosted, and no moderator claims were assigned.
