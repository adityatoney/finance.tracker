"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/layout/section-header";
import { Button } from "@/components/ui/button";
import {
  Users,
  Link as LinkIcon,
  Copy,
  Check,
  Trash2,
  UserMinus,
  Loader2,
} from "lucide-react";
import { useState } from "react";

export default function UsersPage() {
  const currentUser = useQuery(api.users.currentUser);
  const authorizedUsers = useQuery(api.users.listUsers);
  const invites = useQuery(api.users.listInvites);
  const createInvite = useMutation(api.users.createInvite);
  const revokeInvite = useMutation(api.users.revokeInvite);
  const removeUser = useMutation(api.users.removeUser);

  const [inviteAccessType, setInviteAccessType] = useState<"shared" | "isolated">("isolated");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateInvite = async () => {
    setIsGenerating(true);
    setGeneratedLink(null);
    try {
      const result = await createInvite({ accessType: inviteAccessType });
      const baseUrl = window.location.origin;
      setGeneratedLink(`${baseUrl}/invite/${result.token}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to generate invite");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleRevokeInvite = async (token: string) => {
    try {
      await revokeInvite({ token });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke invite");
    }
  };

  const handleRemoveUser = async (userId: any) => {
    if (!confirm("Remove this user's access?")) return;
    try {
      await removeUser({ userId });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove user");
    }
  };

  if (currentUser === undefined) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg bg-muted" />
          <div className="space-y-2">
            <div className="h-6 w-32 rounded bg-muted" />
            <div className="h-4 w-64 rounded bg-muted" />
          </div>
        </div>
        <div className="h-36 rounded-lg bg-muted" />
      </div>
    );
  }

  const isOwner = currentUser?.role === "owner";

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Users className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage authorized users and invite links.
          </p>
        </div>
      </div>

      {/* INVITE USERS section (owner only) */}
      {isOwner && (
        <div className="space-y-3">
          <SectionHeader icon={LinkIcon} title="INVITE USERS" />
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Access Type
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setInviteAccessType("isolated")}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                        inviteAccessType === "isolated"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      Isolated (default)
                    </button>
                    <button
                      onClick={() => setInviteAccessType("shared")}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                        inviteAccessType === "shared"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      Shared
                    </button>
                  </div>
                </div>
                <Button
                  onClick={handleGenerateInvite}
                  disabled={isGenerating}
                  size="sm"
                  className="h-8"
                >
                  {isGenerating ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Generating...</>
                  ) : (
                    <><LinkIcon className="mr-1.5 h-3.5 w-3.5" /> Generate Invite Link</>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {inviteAccessType === "isolated"
                  ? "Isolated: Invitee gets their own separate data space. They won't see your financial data."
                  : "Shared: Invitee joins your data space and can see the same financial data as you."}
              </p>

              {generatedLink && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
                  <code className="flex-1 text-xs break-all">{generatedLink}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyLink}
                    className="h-7 shrink-0"
                  >
                    {copiedLink ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* AUTHORIZED USERS section */}
      {authorizedUsers && authorizedUsers.length > 0 && (
        <div className="space-y-3">
          <SectionHeader icon={Users} title="AUTHORIZED USERS" count={authorizedUsers.length} />
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">User</th>
                    <th className="px-4 py-2 text-left font-medium">Role</th>
                    <th className="px-4 py-2 text-left font-medium">Data Space</th>
                    {isOwner && <th className="px-4 py-2 text-right font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {authorizedUsers.map((u) => (
                    <tr key={u._id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {u.picture ? (
                            <img
                              src={u.picture}
                              alt=""
                              className="h-5 w-5 rounded-full"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="h-5 w-5 rounded-full bg-primary/10" />
                          )}
                          <div>
                            <p className="font-medium text-xs">{u.name}</p>
                            <p className="text-[10px] text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant={u.role === "owner" ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {u.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <code className="text-[10px] text-muted-foreground">
                          {u.dataSpaceId.slice(0, 8)}...
                        </code>
                        {u.dataSpaceId === currentUser?.dataSpaceId && u._id !== currentUser?._id && (
                          <Badge variant="outline" className="ml-1 text-[9px]">shared</Badge>
                        )}
                      </td>
                      {isOwner && (
                        <td className="px-4 py-2.5 text-right">
                          {u.role !== "owner" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveUser(u._id)}
                              className="h-6 text-destructive hover:text-destructive"
                            >
                              <UserMinus className="h-3 w-3" />
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* INVITES section (owner only) */}
      {isOwner && invites && invites.length > 0 && (
        <div className="space-y-3">
          <SectionHeader icon={LinkIcon} title="INVITES" count={invites.length} />
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Token</th>
                    <th className="px-4 py-2 text-left font-medium">Type</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Expires</th>
                    <th className="px-4 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((inv) => (
                    <tr key={inv._id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2.5">
                        <code className="text-[10px] text-muted-foreground">
                          {inv.token.slice(0, 12)}...
                        </code>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="text-[10px]">
                          {inv.accessType}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          className={`text-[10px] border-0 ${
                            inv.status === "pending"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                              : inv.status === "used"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                              : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                          }`}
                        >
                          {inv.status}
                          {inv.usedByEmail && ` (${inv.usedByEmail})`}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {inv.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevokeInvite(inv.token)}
                            className="h-6 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
