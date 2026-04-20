import { v } from "convex/values";
import { query, mutation, internalQuery } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import { getAuthUserId } from "@convex-dev/auth/server";

// ── Queries ──

/** Get current user's profile, or null if not yet authorized. */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const authId = userId as string;
    return await ctx.db
      .query("authorizedUsers")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
      .first();
  },
});

/** Check if any authorized users exist (for first-time setup detection). */
export const hasOwner = query({
  args: {},
  handler: async (ctx) => {
    const owner = await ctx.db
      .query("authorizedUsers")
      .filter((q) => q.eq(q.field("role"), "owner"))
      .first();
    return !!owner;
  },
});

/** List all users visible to the current user (owner sees all, member sees own data space). */
export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireAuth(ctx);

    if (user.role === "owner") {
      return await ctx.db.query("authorizedUsers").collect();
    }

    return await ctx.db
      .query("authorizedUsers")
      .withIndex("by_dataSpace", (q) => q.eq("dataSpaceId", user.dataSpaceId))
      .collect();
  },
});

/** List invites created by the current user. */
export const listInvites = query({
  args: {},
  handler: async (ctx) => {
    const { identity } = await requireAuth(ctx);

    const invites = await ctx.db.query("invites").collect();
    return invites
      .filter((inv) => inv.createdBy === identity.subject)
      .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
  },
});

// ── Mutations ──

/**
 * First-time owner provisioning.
 * Called on the very first login — creates the owner record,
 * assigns a dataSpaceId, and backfills existing data.
 */
export const provisionOwner = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const identity = await ctx.auth.getUserIdentity();
    const authId = userId as string;

    // Check if an owner already exists
    const existingOwner = await ctx.db
      .query("authorizedUsers")
      .filter((q) => q.eq(q.field("role"), "owner"))
      .first();
    if (existingOwner) {
      throw new Error("Owner already provisioned");
    }

    // Check if this user already exists
    const existingUser = await ctx.db
      .query("authorizedUsers")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
      .first();
    if (existingUser) return existingUser;

    // Generate a dataSpaceId for the owner
    const dataSpaceId = crypto.randomUUID();

    // Create the owner record
    const newUserId = await ctx.db.insert("authorizedUsers", {
      authId,
      email: identity?.email ?? "",
      name: identity?.name ?? "",
      picture: (identity?.pictureUrl ?? identity?.picture) as string | undefined,
      role: "owner",
      dataSpaceId,
    });

    // Backfill existing data with the owner's dataSpaceId
    await backfillDataSpace(ctx, dataSpaceId);

    return await ctx.db.get(newUserId);
  },
});

/** Generate an invite link. */
export const createInvite = mutation({
  args: {
    accessType: v.union(v.literal("shared"), v.literal("isolated")),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, { accessType, expiresInDays }) => {
    const { identity, dataSpaceId } = await requireAuth(ctx);

    const token = crypto.randomUUID();
    const days = expiresInDays ?? 7;
    const expiresAt = new Date(
      Date.now() + days * 24 * 60 * 60 * 1000
    ).toISOString();

    await ctx.db.insert("invites", {
      token,
      createdBy: identity.subject,
      accessType,
      dataSpaceId,
      expiresAt,
      status: "pending",
    });

    return { token, expiresAt };
  },
});

/** Revoke a pending invite. */
export const revokeInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { identity } = await requireAuth(ctx);

    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (!invite) throw new Error("Invite not found");
    if (invite.createdBy !== identity.subject) {
      throw new Error("Not your invite");
    }
    if (invite.status !== "pending") {
      throw new Error("Invite is already " + invite.status);
    }

    await ctx.db.patch(invite._id, { status: "revoked" });
  },
});

/** Accept an invite — called after the invitee authenticates. */
export const acceptInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const identity = await ctx.auth.getUserIdentity();
    const authId = userId as string;

    // Check if already authorized
    const existingUser = await ctx.db
      .query("authorizedUsers")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
      .first();
    if (existingUser) return existingUser;

    // Find and validate the invite
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (!invite) throw new Error("Invalid invite link");
    if (invite.status !== "pending") throw new Error("Invite is no longer valid");
    if (new Date(invite.expiresAt) < new Date()) {
      await ctx.db.patch(invite._id, { status: "revoked" });
      throw new Error("Invite has expired");
    }

    // Determine the dataSpaceId
    const dataSpaceId =
      invite.accessType === "shared"
        ? invite.dataSpaceId
        : crypto.randomUUID();

    // Create the user record
    const newUserId = await ctx.db.insert("authorizedUsers", {
      authId,
      email: identity?.email ?? "",
      name: identity?.name ?? "",
      picture: (identity?.pictureUrl ?? identity?.picture) as string | undefined,
      role: "member",
      dataSpaceId,
      invitedBy: invite.createdBy,
    });

    // Mark invite as used
    await ctx.db.patch(invite._id, {
      status: "used",
      usedByEmail: identity?.email ?? "",
    });

    // If isolated, seed default tickers for the new data space
    if (invite.accessType === "isolated") {
      await seedTickerDefaults(ctx, dataSpaceId);
    }

    return await ctx.db.get(newUserId);
  },
});

/** Owner removes another user's access. */
export const removeUser = mutation({
  args: { userId: v.id("authorizedUsers") },
  handler: async (ctx, { userId }) => {
    const { user: currentUser } = await requireAuth(ctx);
    if (currentUser.role !== "owner") {
      throw new Error("Only the owner can remove users");
    }

    const targetUser = await ctx.db.get(userId);
    if (!targetUser) throw new Error("User not found");
    if (targetUser.role === "owner") {
      throw new Error("Cannot remove the owner");
    }

    await ctx.db.delete(userId);
    return { removed: targetUser.email };
  },
});

// ── Internal Queries (for use by actions) ──

/** Internal query to get user by authId — used by actions that can't do db queries. */
export const getUserByAuthId = internalQuery({
  args: { authId: v.string() },
  handler: async (ctx, { authId }) => {
    return await ctx.db
      .query("authorizedUsers")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
      .first();
  },
});

// ── Internal Helpers ──

const DEFAULT_TICKERS: Record<string, string> = {
  VTI: "foundational", VTSAX: "foundational", VOO: "foundational", SPY: "foundational",
  IVV: "foundational", BND: "foundational", AGG: "foundational", VXUS: "foundational",
  VEA: "foundational", VWO: "foundational", TLT: "foundational", VBR: "foundational",
  VBTLX: "foundational",
  "BRK.B": "value", VTV: "value", SCHV: "value", VYM: "value", SCHD: "value",
  DVY: "value", DGRO: "value", JNJ: "value", PG: "value", KO: "value",
  PEP: "value", MCD: "value",
  QQQ: "growth", ARKK: "growth", NVDA: "growth", TSLA: "growth", AAPL: "growth",
  MSFT: "growth", GOOGL: "growth", GOOG: "growth", AMZN: "growth", META: "growth",
  AMD: "growth", CRM: "growth", AVGO: "growth", VGT: "growth", XLK: "growth",
  SOXX: "growth",
  SPAXX: "emergency_fund", VMFXX: "emergency_fund", SWVXX: "emergency_fund",
  SGOV: "emergency_fund", BIL: "emergency_fund", SHV: "emergency_fund",
  IBIT: "btc_crypto", FBTC: "btc_crypto", GBTC: "btc_crypto", BITO: "btc_crypto",
  MSTR: "btc_crypto", COIN: "btc_crypto",
};

async function seedTickerDefaults(ctx: any, dataSpaceId: string) {
  for (const [ticker, category] of Object.entries(DEFAULT_TICKERS)) {
    await ctx.db.insert("tickerMap", {
      ticker,
      category,
      source: "seed",
      dataSpaceId,
    });
  }
}

/**
 * Backfill all existing data with the owner's dataSpaceId.
 * Called once during provisionOwner.
 */
async function backfillDataSpace(ctx: any, dataSpaceId: string) {
  const tables = [
    "statements", "holdings", "deposits", "tickerMap",
    "monthlySnapshots", "piiAuditLog", "retirementStatements", "watchlist",
  ] as const;

  for (const table of tables) {
    const records = await ctx.db.query(table).collect();
    for (const record of records) {
      if (!record.dataSpaceId) {
        await ctx.db.patch(record._id, { dataSpaceId });
      }
    }
  }
}
