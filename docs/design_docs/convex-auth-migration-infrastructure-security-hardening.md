# Convex Auth Migration + Infrastructure Security Hardening

## Context

The Finance Tracker is being deployed to a **friend's shared server** behind a **reverse proxy**. Two changes are needed:

1. **Switch from Clerk to Convex Auth** — Clerk's 2FA requires a premium plan and adds an external dependency. Convex Auth runs natively within the self-hosted Convex backend.
2. **Infrastructure hardening** — The server host owner should be **fully locked out** of the data. All services must be isolated, ports must not leak, and the Convex dashboard must be secured.

---

## Part A: Convex Auth Migration

### Backend Changes

**`web/convex/schema.ts`** — Add `authTables` spread:
```ts
import { authTables } from "@convex-dev/auth/server";
export default defineSchema({ ...authTables, /* existing tables unchanged */ });
```
Adds internal tables (`users`, `authSessions`, `authAccounts`, etc.) — separate from our `authorizedUsers` table.

**`web/convex/auth.ts`** — New file:
```ts
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
export const { auth, signIn, signOut, store } = convexAuth({ providers: [Google] });
```

**`web/convex/http.ts`** — New file:
```ts
import { httpRouter } from "convex/server";
import { auth } from "./auth";
const http = httpRouter();
auth.addHttpRoutes(http);
export default http;
```

**`web/convex/auth.config.ts`** — Rewrite (Clerk domain → Convex self-reference):
```ts
export default {
  providers: [{ domain: process.env.CONVEX_SITE_URL, applicationID: "convex" }],
};
```

**`web/convex/lib/auth.ts`** — Use `getAuthUserId()` instead of `identity.subject`:
- `requireAuth()`: call `getAuthUserId(ctx)` → use as `authId` for `authorizedUsers` lookup
- `requireIdentity()`: extract userId from `identity.subject` (format `userId|sessionId`)

**`web/convex/users.ts`** — Update `currentUser`, `provisionOwner`, `acceptInvite`:
- Replace `identity.subject` with `getAuthUserId(ctx)` for `authId` values
- Keep using `identity` object for email/name/picture

### Frontend Changes

**`web/package.json`**:
- Remove: `@clerk/nextjs`
- Add: `@convex-dev/auth`, `@auth/core`

**`web/src/providers/convex-provider.tsx`** — Rewrite:
- Remove: `ClerkProvider`, `ConvexProviderWithClerk`, `useAuth`
- Use: `ConvexAuthNextjsProvider` from `@convex-dev/auth/nextjs`

**`web/src/app/layout.tsx`** — Wrap `<html>` with `ConvexAuthNextjsServerProvider`

**`web/src/middleware.ts`** — Rewrite:
- Remove: `clerkMiddleware`, `createRouteMatcher` from `@clerk/nextjs/server`
- Use: `convexAuthNextjsMiddleware`, `createRouteMatcher`, `nextjsMiddlewareRedirect` from `@convex-dev/auth/nextjs/server`
- Same public routes: `/sign-in`, `/invite/(.*)`

**`web/src/app/sign-in/page.tsx`** — Rewrite (delete `[[...sign-in]]/` catch-all):
- Custom "Continue with Google" button using `useAuthActions().signIn("google")`

**`web/src/app/invite/[token]/page.tsx`** — Replace Clerk imports:
- `useAuthActions()` for `signIn("google", { redirectTo })` instead of `<SignIn>`
- `useConvexAuth()` instead of `useAuth()` for auth state

**`web/src/components/auth/auth-guard.tsx`** — Replace `useAuth` (Clerk) with `useAuthActions` (Convex Auth) for `signOut()`

**`web/src/components/layout/sidebar.tsx`** — Replace `<UserButton>` (Clerk):
- Custom user display: avatar + name from `api.users.currentUser` query
- Sign-out button using `useAuthActions().signOut()`

### Convex Auth Setup (Manual — Self-Hosted)

1. Generate RS256 key pair (`jose` library — temporary `generateKeys.mjs` script)
2. Set Convex env vars via dashboard (`http://localhost:10617`):
   - `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL=http://localhost:10614`
   - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
3. Google Cloud Console — update redirect URI to `http://localhost:10615/api/auth/callback/google`
4. Remove Clerk env vars from `web/.env.local`

### Data Migration

No existing Clerk users have signed in yet. On first sign-in via Convex Auth, `provisionOwner` creates the owner with the new Convex Auth user ID and backfills all existing data.

---

## Part B: Infrastructure Security Hardening

### Threat Model

The app runs on a friend's server. The friend has **shell access** (and potentially root). Goals:
- Other users on the host cannot access any service or data
- The friend cannot casually browse the dashboard or read data
- Services are only reachable through the reverse proxy
- Data at rest is protected as much as practically possible

**Honest limitation:** A host owner with root access can always inspect Docker volumes, read process memory, or attach to containers. Full protection against a malicious root user requires hardware-level solutions (encrypted VMs, SGX enclaves). The measures below protect against **casual access, other host users, and accidental exposure** — not a determined adversary with root.

### B1: Docker Network Isolation (`docker-compose.yml`)

Create an **internal Docker network** so containers communicate privately. Only expose the reverse-proxy-facing ports on `127.0.0.1`:

```yaml
networks:
  ft-internal:
    driver: bridge
    internal: true   # no outbound internet from this network
  ft-proxy:
    driver: bridge   # containers that need reverse proxy access

services:
  convexDB-backend:
    networks: [ft-internal, ft-proxy]
    ports:
      - "127.0.0.1:${FT_PORT_CONVEX:-10610}:${FT_PORT_CONVEX:-10610}"      # localhost only
      - "127.0.0.1:${FT_PORT_SITE_PROXY:-10615}:${FT_PORT_SITE_PROXY:-10615}"
    # ... rest unchanged

  convexDB-dashboard:
    networks: [ft-internal]
    ports:
      - "127.0.0.1:${FT_PORT_DASHBOARD:-10617}:6791"   # localhost only
    # ... rest unchanged

  parser:
    networks: [ft-internal]
    ports:
      - "127.0.0.1:${FT_PORT_API:-10611}:8000"         # localhost only
    # ... rest unchanged

  web:
    networks: [ft-internal, ft-proxy]
    ports:
      - "127.0.0.1:${FT_PORT_WEB:-10613}:3000"         # localhost only
    # ... rest unchanged
```

**Effect:** All ports bind to `127.0.0.1` — only accessible from the host machine itself (i.e., the reverse proxy). No direct access from the network.

### B2: Secure the Convex Dashboard

The dashboard at port 10617 has **no built-in authentication**. Two options:

**Option A (Recommended for shared host):** Don't expose it in production. Add a `profiles: [dev]` to the dashboard service so it only runs when explicitly requested:
```yaml
convexDB-dashboard:
  profiles: [dev]    # only runs with: docker compose --profile dev up
```
Access it temporarily via SSH tunnel when needed: `ssh -L 10617:localhost:10617 server`

**Option B:** Put it behind the reverse proxy with HTTP basic auth (nginx `auth_basic`). But this adds complexity and the dashboard is rarely needed in production.

### B3: Delete Dangerous API Endpoints (`api/app/routers/health.py`)

The file contains `/api/db/dump` and `/api/db/download` which expose the entire SQLite database. These endpoints are **not currently mounted** in `main.py` (only `parse_only` router is included), but the file should be deleted to prevent accidental re-enablement.

- **Delete:** `api/app/routers/health.py`
- The health check in `main.py` (`GET /api/health → {"status": "ok"}`) is sufficient and safe

### B4: Non-Root Containers

Add `USER` directives to both Dockerfiles:

**`api/Dockerfile`:**
```dockerfile
RUN useradd -m appuser
USER appuser
```

**`web/Dockerfile`:**
```dockerfile
RUN useradd -m appuser
USER appuser
```

### B5: Production Mode for Web Container (`web/Dockerfile`)

Currently runs `npm run dev` (unminified, source maps, hot reload). Change to production build:
```dockerfile
RUN npm run build
CMD ["npm", "start"]
```

### B6: File Permissions on Data Volume

The Convex data lives at `${SSD_DATA}/finance.tracker/convex/`. Restrict permissions:
```bash
chmod 700 /path/to/finance.tracker/convex/
chown $(id -u):$(id -g) /path/to/finance.tracker/convex/
```

In `docker-compose.yml`, ensure the volume mount doesn't create world-readable files. The non-root container user should match the host user via `user:` directive:
```yaml
convexDB-backend:
  user: "${UID:-1000}:${GID:-1000}"
```
(Note: this may require adjusting the Convex backend image — test first.)

### B7: Restrict `.env` File Permissions

```bash
chmod 600 .env web/.env.local
```
Only the deploying user can read secrets.

### B8: CORS Update for Production Domain

Update `api/app/main.py` CORS origins to include the production domain:
```python
allow_origins=[
    "http://localhost:10614",
    "http://localhost:10613",
    "https://your-production-domain.com",  # add actual domain
]
```

### B9: Update `.env.example`

Replace Clerk section with Convex Auth variables + add infrastructure security notes.

---

## File Change Summary

| File | Action | Part |
|------|--------|------|
| `web/package.json` | Modify | A — swap deps |
| `web/convex/schema.ts` | Modify | A — add authTables |
| `web/convex/auth.ts` | Create | A — Convex Auth config |
| `web/convex/http.ts` | Create | A — OAuth callback routes |
| `web/convex/auth.config.ts` | Rewrite | A — self-referencing |
| `web/convex/lib/auth.ts` | Modify | A — getAuthUserId |
| `web/convex/users.ts` | Modify | A — getAuthUserId |
| `web/src/providers/convex-provider.tsx` | Rewrite | A — ConvexAuthNextjsProvider |
| `web/src/app/layout.tsx` | Modify | A — server provider wrapper |
| `web/src/middleware.ts` | Rewrite | A — convexAuthNextjsMiddleware |
| `web/src/app/sign-in/page.tsx` | Rewrite | A — custom Google button |
| `web/src/app/invite/[token]/page.tsx` | Modify | A — useAuthActions |
| `web/src/components/auth/auth-guard.tsx` | Modify | A — useAuthActions |
| `web/src/components/layout/sidebar.tsx` | Modify | A — custom user menu |
| `docker-compose.yml` | Modify | B — network isolation, 127.0.0.1 binding, dashboard profile |
| `api/app/routers/health.py` | Delete | B — remove dangerous endpoints |
| `api/Dockerfile` | Modify | B — non-root user |
| `web/Dockerfile` | Modify | B — non-root user, production build |
| `api/app/main.py` | Modify | B — CORS for production domain |
| `.env.example` | Modify | A+B — update template |

---

## Verification

### Auth
1. Visit app → redirected to `/sign-in`
2. Click "Continue with Google" → Google OAuth flow → dashboard loads
3. Sidebar shows user name + sign-out button
4. Sign out → redirected to `/sign-in`
5. Generate invite in `/users` → invitee can sign in and access data
6. Direct Convex calls without auth → "Unauthenticated" error

### Infrastructure
7. `curl http://server-ip:10610` → connection refused (bound to 127.0.0.1)
8. `curl http://server-ip:10617` → connection refused (dashboard not exposed, or bound to 127.0.0.1)
9. `curl http://server-ip:10611` → connection refused (parser bound to 127.0.0.1)
10. Only the reverse proxy port (443) is accessible from the network
11. `ls -la` on data directory → `700` permissions, owned by deploying user
12. `cat .env` from another user's shell → permission denied
