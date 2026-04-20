"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../../convex/_generated/api";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, ShieldAlert, TrendingUp } from "lucide-react";

/**
 * Auth guard that handles user provisioning after authentication.
 * Middleware handles the login redirect (server-side).
 * This component handles:
 * 1. First-time owner provisioning (auto-creates owner on first login)
 * 2. Unauthorized users (authenticated but not in authorizedUsers)
 * 3. Public route pass-through
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoading: isConvexLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();

  const isPublicRoute =
    pathname?.startsWith("/sign-in") || pathname?.startsWith("/invite/");

  const currentUser = useQuery(
    api.users.currentUser,
    isAuthenticated ? {} : "skip"
  );
  const hasOwner = useQuery(
    api.users.hasOwner,
    isAuthenticated ? {} : "skip"
  );
  const provisionOwner = useMutation(api.users.provisionOwner);

  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  // Auto-provision the first user as owner
  useEffect(() => {
    if (
      isAuthenticated &&
      hasOwner === false &&
      currentUser === null &&
      !isProvisioning
    ) {
      setIsProvisioning(true);
      provisionOwner({})
        .catch((err) => {
          setProvisionError(
            err instanceof Error ? err.message : "Failed to provision owner"
          );
        })
        .finally(() => setIsProvisioning(false));
    }
  }, [isAuthenticated, hasOwner, currentUser, isProvisioning, provisionOwner]);

  // Redirect unauthenticated users to sign-in
  useEffect(() => {
    if (!isConvexLoading && !isAuthenticated && !isPublicRoute) {
      router.replace("/sign-in");
    }
  }, [isConvexLoading, isAuthenticated, isPublicRoute, router]);

  // Public routes render freely
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Loading state (Convex syncing)
  if (isConvexLoading) {
    return <LoadingScreen message="Connecting..." />;
  }

  // Not authenticated — waiting for redirect
  if (!isAuthenticated) {
    return <LoadingScreen message="Redirecting to login..." />;
  }

  // Waiting for user data to load
  if (currentUser === undefined || hasOwner === undefined) {
    return <LoadingScreen message="Loading user data..." />;
  }

  // Provisioning in progress
  if (isProvisioning) {
    return <LoadingScreen message="Setting up your account..." />;
  }

  // Provision error
  if (provisionError) {
    return (
      <ErrorScreen
        title="Setup Error"
        message={provisionError}
        onSignOut={() => void signOut()}
      />
    );
  }

  // Authenticated but not authorized
  if (currentUser === null && hasOwner) {
    return (
      <ErrorScreen
        title="Access Denied"
        message="You are not authorized to access this application. Please contact the owner for an invite link."
        onSignOut={() => void signOut()}
      />
    );
  }

  // Authorized — render the app
  return <>{children}</>;
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
          <TrendingUp className="h-6 w-6 text-primary-foreground" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{message}</span>
        </div>
      </div>
    </div>
  );
}

function ErrorScreen({
  title,
  message,
  onSignOut,
}: {
  title: string;
  message: string;
  onSignOut: () => void;
}) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 max-w-md text-center px-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
          <ShieldAlert className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{message}</p>
        <button
          onClick={onSignOut}
          className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
