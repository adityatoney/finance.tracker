"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../../../convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, TrendingUp } from "lucide-react";

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const { isLoading: isConvexLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();

  const currentUser = useQuery(
    api.users.currentUser,
    isAuthenticated ? {} : "skip"
  );
  const acceptInvite = useMutation(api.users.acceptInvite);

  const [status, setStatus] = useState<
    "loading" | "accepting" | "success" | "error" | "already_authorized"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");

  // Once authenticated with Convex, process the invite
  useEffect(() => {
    if (!isAuthenticated || currentUser === undefined) return;

    // Already an authorized user
    if (currentUser !== null) {
      setStatus("already_authorized");
      setTimeout(() => router.push("/dashboard"), 2000);
      return;
    }

    // Accept the invite
    if (status === "loading") {
      setStatus("accepting");
      acceptInvite({ token })
        .then(() => {
          setStatus("success");
          setTimeout(() => router.push("/dashboard"), 2000);
        })
        .catch((err) => {
          setStatus("error");
          setErrorMessage(
            err instanceof Error ? err.message : "Failed to accept invite"
          );
        });
    }
  }, [isAuthenticated, currentUser, token, status, acceptInvite, router]);

  // Still loading Convex
  if (isConvexLoading) {
    return (
      <InviteLayout>
        <StatusIcon type="loading" />
        <p className="text-sm text-muted-foreground">Connecting...</p>
      </InviteLayout>
    );
  }

  // Not signed in — show Google sign-in button
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <TrendingUp className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight">
              Finance Tracker Invite
            </span>
          </div>
          <p className="text-sm text-muted-foreground max-w-xs text-center">
            Sign in to accept your invite and get started.
          </p>
          <button
            onClick={() =>
              void signIn("google", { redirectTo: `/invite/${token}` })
            }
            className="flex items-center gap-3 rounded-lg border bg-card px-6 py-3 text-sm font-medium shadow-sm hover:bg-accent transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  // Signed in, processing invite
  if (status === "accepting" || status === "loading") {
    return (
      <InviteLayout>
        <StatusIcon type="loading" />
        <p className="text-sm text-muted-foreground">
          Accepting your invite...
        </p>
      </InviteLayout>
    );
  }

  if (status === "success" || status === "already_authorized") {
    return (
      <InviteLayout>
        <StatusIcon type="success" />
        <p className="text-sm font-medium text-emerald-600">
          {status === "already_authorized"
            ? "You're already authorized!"
            : "Welcome! You've been added."}
        </p>
        <p className="text-xs text-muted-foreground">
          Redirecting to dashboard...
        </p>
      </InviteLayout>
    );
  }

  return (
    <InviteLayout>
      <StatusIcon type="error" />
      <p className="text-sm font-medium text-destructive">Invite Error</p>
      <p className="text-xs text-muted-foreground max-w-xs text-center">
        {errorMessage}
      </p>
      <button
        onClick={() => router.push("/")}
        className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Go Home
      </button>
    </InviteLayout>
  );
}

function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary mb-2">
          <TrendingUp className="h-5 w-5 text-primary-foreground" />
        </div>
        <h1 className="text-lg font-semibold">Finance Tracker</h1>
        {children}
      </div>
    </div>
  );
}

function StatusIcon({ type }: { type: "loading" | "success" | "error" }) {
  if (type === "loading") {
    return <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />;
  }
  if (type === "success") {
    return <CheckCircle2 className="h-8 w-8 text-emerald-500" />;
  }
  return <XCircle className="h-8 w-8 text-destructive" />;
}
