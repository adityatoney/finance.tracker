"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Upload,
  Wallet,
  Tags,
  Eye,
  Settings,
  TrendingUp,
  PiggyBank,
  Sun,
  Moon,
  Monitor,
  Users,
  LogOut,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

const navGroups = [
  {
    label: "Portfolio",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/retirement", label: "Retirement", icon: PiggyBank },
      { href: "/upload", label: "Upload", icon: Upload },
    ],
  },
  {
    label: "Analysis",
    items: [
      { href: "/holdings", label: "Holdings", icon: Wallet },
      { href: "/watchlist", label: "Watchlist", icon: Eye },
      { href: "/ticker-map", label: "Ticker Map", icon: Tags },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/users", label: "Users", icon: Users },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { signOut } = useAuthActions();
  const currentUser = useQuery(api.users.currentUser);

  useEffect(() => setMounted(true), []);

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  // Use a stable icon during SSR to avoid hydration mismatch
  const ThemeIcon = !mounted ? Monitor : theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const themeLabel = !mounted ? "Theme" : theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
          <TrendingUp className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-semibold text-sm tracking-tight">Finance Tracker</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pt-5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "border-l-2 border-primary bg-primary/5 text-primary font-medium ml-0 pl-[10px]"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="border-t px-3 py-3 space-y-1">
        <button
          onClick={cycleTheme}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ThemeIcon className="h-4 w-4 shrink-0" />
          <span>{themeLabel}</span>
        </button>
        <div className="flex w-full items-center gap-3 rounded-md px-3 py-2">
          {currentUser?.picture ? (
            <img
              src={currentUser.picture}
              alt=""
              className="h-6 w-6 rounded-full shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-6 w-6 rounded-full bg-primary/10 shrink-0" />
          )}
          <span className="text-sm text-muted-foreground truncate flex-1">
            {currentUser?.name || currentUser?.email || "User"}
          </span>
          <button
            onClick={() => void signOut()}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
