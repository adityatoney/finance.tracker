import { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";

type AuthResult = {
  identity: { subject: string; email?: string; name?: string };
  user: Doc<"authorizedUsers">;
  dataSpaceId: string;
};

/**
 * Require authentication and authorization.
 * Returns the identity, user record, and dataSpaceId for query filtering.
 * Throws if the caller is not authenticated or not in the authorizedUsers table.
 */
export async function requireAuth(
  ctx: QueryCtx | MutationCtx,
): Promise<AuthResult> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthenticated: must be signed in");
  }

  const user = await ctx.db
    .query("authorizedUsers")
    .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
    .first();

  if (!user) {
    throw new Error("Unauthorized: not an authorized user");
  }

  return {
    identity: {
      subject: identity.subject,
      email: identity.email,
      name: identity.name,
    },
    user,
    dataSpaceId: user.dataSpaceId,
  };
}

/**
 * Require authentication only (for actions that don't have ctx.db).
 * Returns just the identity. The caller must handle authorization separately.
 */
export async function requireIdentity(
  ctx: ActionCtx,
): Promise<{ subject: string; email?: string; name?: string }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthenticated: must be signed in");
  }
  return {
    subject: identity.subject,
    email: identity.email,
    name: identity.name,
  };
}
