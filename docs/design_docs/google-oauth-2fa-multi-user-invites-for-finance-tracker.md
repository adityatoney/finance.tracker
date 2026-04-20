# Google OAuth + 2FA + Multi-User Invites for Finance Tracker

## Context

The Finance Tracker is a self-hosted Next.js 16 + Convex app with zero authentication. All 34 Convex functions are publicly accessible and the API has wildcard CORS. This app stores sensitive financial data and will be deployed to a server, so we need:

1. **Google OAuth** — only way to sign in
2. **TOTP 2FA** — required on every login (authenticator app)
3. **Invite-based access** — owner generates private links to onboard others
4. **Configurable data isolation** — invites specify "shared" (family) or "isolated" (friends) data access
5. **Security hardening** — CORS lockdown, Convex auth guards on all functions

**Security audit (clean):** Secrets gitignored, PII encrypted (AES-256-GCM), no hardcoded credentials. Only gaps: no auth, wildcard CORS.

---

## Architecture

### Auth: Auth0 + Convex

- `Auth0Provider` (`@auth0/auth0-react`) handles Google OAuth + TOTP MFA
- `ConvexProviderWithAuth0` (`convex/react-auth0`, already in SDK) passes JWTs to Convex
- Self-hosted Convex validates JWTs via OIDC discovery from Auth0's domain
- Every Convex function calls `requireAuth(ctx)` → returns `{ identity, user, dataSpaceId }`

### Data Spaces

Each user belongs to a **data space** (UUID). All data tables get a `dataSpaceId` field.

- **Shared invite:** Invitee gets the inviter's `dataSpaceId` → sees same data (family)
- **Isolated invite:** Invitee gets a new `dataSpaceId` → has own data (friends)
- All queries filter by `dataSpaceId` — users only see their data space's records

### Invite Flow

1. Owner generates invite link in Settings (picks shared/isolated)
2. Creates `invites` record with UUID token + access type
3. Link: `/invite/[token]` — invitee visits, signs in via Auth0, gets authorized
4. Owner can see/revoke invites and remove users from Settings

---

## Implementation Steps

### Step 1: Auth0 Tenant Setup (External)
- Create Auth0 SPA application
- Set Allowed Callback/Logout/Web Origins to `http://localhost:10614`
- Enable Google social connection
- Enable MFA: TOTP authenticator app, policy = "Always"
- Create Auth0 API with identifier `https://finance-tracker` (the `audience`)
- Add Post-Login Action to restrict emails (defense in depth):
  ```js
  exports.onExecutePostLogin = async (event, api) => {
    // Allow all emails — Convex-side authorizedUsers table is the real gate
    // Use this for additional IP/domain restrictions if desired
  };
  ```

### Step 2: Install Dependencies
```bash
cd web && npm install @auth0/auth0-react
```

### Step 3: Environment Variables
**`web/.env.local`** — add:
```
NEXT_PUBLIC_AUTH0_DOMAIN=your-tenant.auth0.com
NEXT_PUBLIC_AUTH0_CLIENT_ID=your-client-id
NEXT_PUBLIC_AUTH0_AUDIENCE=https://finance-tracker
```

### Step 4: Convex Auth Config
**New file: `web/convex/auth.config.ts`**
```ts
export default {
  providers: [{
    domain: "https://your-tenant.auth0.com",
    applicationID: "https://finance-tracker",
  }],
};
```
Push with `npx convex dev`.

### Step 5: Schema Changes — `web/convex/schema.ts`

**New tables:**
```ts
authorizedUsers: defineTable({
  authId: v.string(),           // Auth0 subject (e.g., "google-oauth2|123")
  email: v.string(),
  name: v.string(),
  picture: v.optional(v.string()),
  role: v.string(),             // "owner" | "member"
  dataSpaceId: v.string(),      // UUID — shared or isolated
  invitedBy: v.optional(v.string()), // authId of inviter
})
  .index("by_authId", ["authId"])
  .index("by_dataSpace", ["dataSpaceId"])
  .index("by_email", ["email"]),

invites: defineTable({
  token: v.string(),            // UUID
  createdBy: v.string(),        // authId of creator
  accessType: v.string(),       // "shared" | "isolated"
  dataSpaceId: v.string(),      // inviter's dataSpaceId (used for "shared")
  expiresAt: v.string(),        // ISO date
  status: v.string(),           // "pending" | "used" | "revoked"
  usedByEmail: v.optional(v.string()),
})
  .index("by_token", ["token"]),
```

**Existing tables — add `dataSpaceId: v.optional(v.string())` + indexes:**

| Table | New Field | New Index |
|-------|-----------|-----------|
| `statements` | `dataSpaceId` | `by_dataSpace_date: ["dataSpaceId", "statementDate"]` |
| `holdings` | `dataSpaceId` | `by_dataSpace_ticker: ["dataSpaceId", "ticker"]` |
| `deposits` | `dataSpaceId` | _(queried via statementId, no new index needed)_ |
| `tickerMap` | `dataSpaceId` | `by_dataSpace_ticker: ["dataSpaceId", "ticker"]` |
| `monthlySnapshots` | `dataSpaceId` | `by_dataSpace_month: ["dataSpaceId", "month"]` |
| `piiAuditLog` | `dataSpaceId` | _(no index needed)_ |
| `retirementStatements` | `dataSpaceId` | `by_dataSpace_year: ["dataSpaceId", "year"]` |
| `watchlist` | `dataSpaceId` | `by_dataSpace_ticker: ["dataSpaceId", "ticker"]` |
| `watchlistData` | _(none — global cache)_ | _(none)_ |

`dataSpaceId` is `v.optional(v.string())` for backwards compatibility with existing data. The migration mutation (Step 10) backfills it.

### Step 6: Auth Helper — `web/convex/lib/auth.ts` (new)

```ts
import { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";

export async function requireAuth(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");

  const user = await ctx.db
    .query("authorizedUsers")
    .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
    .first();
  if (!user) throw new Error("Unauthorized: not an authorized user");

  return { identity, user, dataSpaceId: user.dataSpaceId };
}
```

All 34 Convex functions get `const { dataSpaceId } = await requireAuth(ctx);` and filter queries by `dataSpaceId`.

### Step 7: Update All 34 Convex Functions

Each function needs two changes: (a) auth guard, (b) dataSpaceId filtering.

**Pattern for queries** (e.g., `statements.list`):
```ts
handler: async (ctx) => {
  const { dataSpaceId } = await requireAuth(ctx);
  const stmts = await ctx.db.query("statements")
    .withIndex("by_dataSpace_date", (q) => q.eq("dataSpaceId", dataSpaceId))
    .order("desc").collect();
  // ...
}
```

**Pattern for mutations** (e.g., `statements.commit`):
```ts
handler: async (ctx, args) => {
  const { dataSpaceId } = await requireAuth(ctx);
  // ... existing logic ...
  await ctx.db.insert("statements", { ...fields, dataSpaceId });
}
```

**Special case — watchlist actions:** `refreshTicker` and `refreshAll` are Convex actions that call `ctx.runMutation(api.watchlist.upsertData, ...)`. When actions call mutations internally, auth context doesn't propagate. Fix: convert `upsertData` to `internalMutation` and call via `ctx.runMutation(internal.watchlist.upsertData, ...)`. Same for `refreshAll` calling `ctx.runQuery(api.watchlist.list)` — use `internalQuery` variant.

**Full function inventory (34 total):**

| File | Functions |
|------|-----------|
| `statements.ts` | list, getById, getStats, commit, remove |
| `holdings.ts` | listByStatement, listForMonth, getLatestMonth, getAllMonths, updateCategory, recategorize |
| `tickers.ts` | list, getCategory, upsert, remove, seedDefaults, resolveCategories |
| `snapshots.ts` | list, validateTotals, depositsByMonth, listForMonth, rebuildMonth, rebuildAll |
| `retirement.ts` | list, getStats, commit, remove |
| `watchlist.ts` | list, add, remove, updateNote, upsertData, refreshTicker, refreshAll |

### Step 8: Invite & User Management Functions — `web/convex/users.ts` (new)

New Convex functions for the invite system:

```ts
// Queries
currentUser      — get current user's profile (or null if not yet authorized)
listUsers        — list all users in owner's data space(s)
listInvites      — list pending/used invites created by current user

// Mutations
provisionOwner   — first-time setup: create owner record + assign dataSpaceId + run migration
createInvite     — generate invite token (shared/isolated), return link
revokeInvite     — mark invite as revoked
acceptInvite     — called after auth: validates token, creates authorizedUsers record
removeUser       — owner revokes another user's access
```

### Step 9: Rewrite Provider — `web/src/providers/convex-provider.tsx`

```tsx
"use client";
import { Auth0Provider } from "@auth0/auth0-react";
import { ConvexProviderWithAuth0 } from "convex/react-auth0";
import { ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  return (
    <Auth0Provider
      domain={process.env.NEXT_PUBLIC_AUTH0_DOMAIN!}
      clientId={process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID!}
      authorizationParams={{
        redirect_uri: typeof window !== "undefined" ? window.location.origin : "",
        audience: process.env.NEXT_PUBLIC_AUTH0_AUDIENCE!,
      }}
    >
      <ConvexProviderWithAuth0 client={convex}>
        {children}
      </ConvexProviderWithAuth0>
    </Auth0Provider>
  );
}
```

### Step 10: Auth Guard Component — `web/src/components/auth/auth-guard.tsx` (new)

Client component wrapping the app layout. Handles three states:

1. **Loading** — show spinner
2. **Not authenticated** — redirect to Auth0 login
3. **Authenticated but not authorized** — check if visiting `/invite/[token]` (process invite) or show "Access Denied" with info
4. **Authenticated + authorized** — render app

Also handles first-time owner provisioning: if no `authorizedUsers` exist at all, the first authenticated user becomes the owner (calls `provisionOwner` mutation).

### Step 11: Update Root Layout — `web/src/app/layout.tsx`

Wrap content with `AuthGuard` inside `ConvexClientProvider`:
```tsx
<ConvexClientProvider>
  <TooltipProvider>
    <AuthGuard>
      <div className="flex h-full">
        <Sidebar />
        <main>...</main>
      </div>
    </AuthGuard>
  </TooltipProvider>
</ConvexClientProvider>
```

### Step 12: Invite Page — `web/src/app/invite/[token]/page.tsx` (new)

- Reads token from URL
- If user is authenticated → calls `acceptInvite` mutation → redirects to `/dashboard`
- If not authenticated → triggers Auth0 login → on return, processes invite
- Shows invite status (valid/expired/revoked/already used)

### Step 13: Update Sidebar — `web/src/components/layout/sidebar.tsx`

Replace hardcoded "AT / Aditya Toney" (lines 116-122) with:
```tsx
import { useAuth0 } from "@auth0/auth0-react";
const { user, logout } = useAuth0();
// Show user.picture, user.name, logout button
```

### Step 14: Settings Page — User Management Section

Add to `web/src/app/settings/page.tsx`:
- **Invite Users** section: access type selector (shared/isolated) + generate link button
- **Authorized Users** table: email, role, data space, joined date, revoke button
- **Pending Invites** table: link, access type, created date, status, revoke button

### Step 15: Data Migration Mutation — `web/convex/users.ts`

The `provisionOwner` mutation (called once on first login):
1. Creates owner's `authorizedUsers` record with new `dataSpaceId`
2. Backfills all existing records (statements, holdings, deposits, etc.) with owner's `dataSpaceId`
3. Seeds ticker defaults for the owner's data space

### Step 16: Restrict FastAPI CORS — `api/app/main.py`

```python
allow_origins=["http://localhost:10614", "http://localhost:10613"]
allow_methods=["POST"]
```

### Step 17: Update `.env.example`

Add Auth0 template variables.

---

## Files Summary

| Action | File |
|--------|------|
| **Create** | `web/convex/auth.config.ts` |
| **Create** | `web/convex/lib/auth.ts` |
| **Create** | `web/convex/users.ts` |
| **Create** | `web/src/components/auth/auth-guard.tsx` |
| **Create** | `web/src/app/invite/[token]/page.tsx` |
| **Modify** | `web/convex/schema.ts` — add 2 tables + dataSpaceId fields + indexes |
| **Modify** | `web/convex/statements.ts` — auth guards + dataSpaceId filtering |
| **Modify** | `web/convex/holdings.ts` — auth guards + dataSpaceId filtering |
| **Modify** | `web/convex/tickers.ts` — auth guards + dataSpaceId filtering |
| **Modify** | `web/convex/snapshots.ts` — auth guards + dataSpaceId filtering |
| **Modify** | `web/convex/retirement.ts` — auth guards + dataSpaceId filtering |
| **Modify** | `web/convex/watchlist.ts` — auth guards + dataSpaceId + internal mutations |
| **Modify** | `web/src/providers/convex-provider.tsx` — Auth0 + Convex |
| **Modify** | `web/src/app/layout.tsx` — add AuthGuard wrapper |
| **Modify** | `web/src/components/layout/sidebar.tsx` — user profile + logout |
| **Modify** | `web/src/app/settings/page.tsx` — invite/user management UI |
| **Modify** | `api/app/main.py` — CORS restriction |
| **Modify** | `.env.example` — Auth0 template vars |

---

## Verification

1. **Unauthenticated** — incognito visit redirects to Auth0 login
2. **Google OAuth** — sign in with Google, complete MFA enrollment (QR scan)
3. **MFA enforcement** — subsequent logins require TOTP code
4. **Owner provisioned** — first login creates owner record, existing data gets dataSpaceId
5. **Dashboard loads** — all data visible after auth
6. **Convex rejects unauthenticated** — direct calls without JWT return error
7. **Generate invite (shared)** — Settings → create shared invite → copy link
8. **Accept invite (shared)** — invitee visits link → signs in → sees owner's data
9. **Generate invite (isolated)** — create isolated invite → invitee gets empty data space
10. **Revoke user** — remove user from Settings → they can no longer access data
11. **User profile** — sidebar shows Google picture + name + logout
12. **CORS locked** — cross-origin parser requests from unknown origins blocked
13. **Upload flow** — parse + commit still works, data stored with correct dataSpaceId
