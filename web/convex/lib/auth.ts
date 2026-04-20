import { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

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
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Unauthenticated: must be signed in");
  }

  const authId = userId as string;

  const user = await ctx.db
    .query("authorizedUsers")
    .withIndex("by_authId", (q) => q.eq("authId", authId))
    .first();

  if (!user) {
    throw new Error("Unauthorized: not an authorized user");
  }

  const identity = await ctx.auth.getUserIdentity();

  return {
    identity: {
      subject: authId,
      email: identity?.email,
      name: identity?.name,
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
  // Convex Auth subject format: "userId|sessionId"
  const [userId] = identity.subject.split("|");
  return {
    subject: userId,
    email: identity.email,
    name: identity.name,
  };
}
