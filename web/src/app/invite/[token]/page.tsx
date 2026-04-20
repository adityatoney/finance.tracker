"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { SignIn, useAuth } from "@clerk/nextjs";
import { api } from "../../../../convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, TrendingUp } from "lucide-react";

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const { isLoading: isConvexLoading, isAuthenticated } = useConvexAuth();
  const { isLoaded: isClerkLoaded, isSignedIn } = useAuth();

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

  // Still loading Clerk or Convex
  if (!isClerkLoaded || isConvexLoading) {
    return (
      <InviteLayout>
        <StatusIcon type="loading" />
        <p className="text-sm text-muted-foreground">Connecting...</p>
      </InviteLayout>
    );
  }

  // Not signed in — show Clerk sign-in
  if (!isSignedIn) {
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
          <SignIn
            fallbackRedirectUrl={`/invite/${token}`}
            appearance={{
              elements: { rootBox: "mx-auto" },
            }}
          />
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
