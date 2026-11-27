# Reboot Earth Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Strict Ownership & PII Isolation**: `userPreferences/{userId}`, `notifications/{notificationId}`, and `chatSessions/{sessionId}` are strictly scoped to `resource.data.userId == request.auth.uid` (or a verified administrator). No unauthenticated or cross-user reads or list queries are allowed.
2. **Temporal & Schema Integrity**: Every created document must match its exact allowed key set (`hasAll` + `hasOnly`), enforce server timestamps (`request.time`), enforce explicit `.size()` bounds on every string and array, and preserve immutable `userId` and `createdAt` fields on updates.
3. **Zero Privilege Escalation**: Users cannot write to `/admins/{uid}` or spoof `request.auth.token.email` without `request.auth.token.email_verified == true`.
4. **Path Variable Hardening**: Every single-document target (`get`, `create`, `update`, `delete`) validates document IDs via `isValidId()` (`^[a-zA-Z0-9_\-]+$`, `<= 128` chars).
5. **Verified Collection Centre Reviews (`/facilityReviews/{reviewId}`)**: Reviews contain zero PII (no emails/phones/addresses). Only verified authenticated users may create, update, or delete their own review (`reviewId == 'rev_f' + string(facilityId) + '_' + request.auth.uid`, `rating` integer 1–5, `comment` 3–600 chars, immutable `facilityId`/`userId`/`createdAt`). Admins may moderate/delete any review.
6. **Scheduled Pickup Bookings (`/scheduledPickups/{bookingId}`)**: Contains user PII (`pickupAddress`, `contactName`, `contactPhone`, GPS coordinates). Strictly isolated to owner (`existing().userId == request.auth.uid`) or verified admin on `get`, and `resource.data.userId == request.auth.uid` on `list`. Initial `status` on create MUST be `'Submitted'`. Updates use strict Action-Based allowlists (reschedule `preferredDate`/`timeSlot`/`instructions`/`updatedAt` OR cancel `status: 'Cancelled'`/`updatedAt`), preserve immutable `userId`/`requestCode`/`createdAt`, and enforce Terminal State Locking (once `Completed` or `Cancelled`, non-admins cannot modify).

## 2. The "Dirty Dozen" Attack Payloads (All Must Yield PERMISSION_DENIED)
1. **Unauthenticated read of `/userPreferences/uid1` or `/scheduledPickups/b1`**: Blocked by `isSignedIn()`.
2. **Cross-user read of `/notifications/n1` or `/scheduledPickups/b1` owned by `uid2`**: Blocked by `existing().userId == request.auth.uid`.
3. **Blanket list query on `/notifications` or `/scheduledPickups` without owner filter**: Blocked by `allow list` evaluating `resource.data.userId == request.auth.uid`.
4. **Shadow field injection (`isAdmin: true`) on `/userPreferences/{uid}`, `/facilityReviews/{id}`, or `/scheduledPickups/{id}` create**: Blocked by `hasOnly(...)`.
5. **Identity spoofing (`userId: "victimUid"`) on `/chatSessions/s1`, `/facilityReviews/rev_f1_victimUid`, or `/scheduledPickups/b1` create**: Blocked by `data.userId == request.auth.uid`.
6. **Client-forged timestamp (`createdAt: 2020-01-01`) on create**: Blocked by `data.createdAt == request.time`.
7. **Immutable field tampering (`createdAt`, `facilityId`, `requestCode`, or `userId` modified on update)**: Blocked by `affectedKeys().hasOnly(...)` + immutability checks.
8. **Resource exhaustion (10,000-char string in `title`, `comment`, or `pickupAddress`)**: Blocked by explicit `.size()` limits on every string field.
9. **Out-of-range rating (`rating: 6`), invalid time slot (`timeSlot: "midnight"`), or forged initial booking status (`status: "Completed"` on create)**: Blocked by strict type/range/enum checks and `incoming().status == 'Submitted'`.
10. **Path ID poisoning (200-char doc ID with `$` / spaces)**: Blocked by `isValidId()`.
11. **Unverified email write or admin spoof (`email_verified: false`)**: Blocked by `isVerified()`.
12. **Terminal state bypass or cross-user modification (user modifying a `Cancelled`/`Completed` pickup or another user's review/booking/leaderboard entry)**: Blocked by terminal status guards and `existing().userId == request.auth.uid || isAdmin()`.
13. **Community Leaderboard (`/leaderboardProfiles/{userId}`) PII & Spoofing Guard**: Zero-PII split collection (`displayName`, `city`, `cityKey`, `verifiedRecycledKg`, `pickupsCount`, `ecoLevel`, `levelTitle`, `badgesCount`, `visibility: 'community'`). `list` requires `isSignedIn() && resource.data.visibility == 'community'`; `create`/`update`/`delete` require `isVerified()` and `request.auth.uid == userId` (or `isAdmin()`), with strict key allowlists, numeric range guards, `cityKey` regex validation, immutable `userId`/`visibility`/`createdAt`, and server `request.time` timestamps.
