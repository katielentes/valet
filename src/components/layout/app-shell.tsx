"use client";

import { createContext, useContext, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Menu,
  Settings,
  Sparkles,
  ChevronDown,
} from "lucide-react";

import type { SessionPayload } from "@/lib/api";
import { NAV_ITEMS, SECONDARY_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useLocations, type LocationRecord } from "@/hooks/use-locations";

type AppShellProps = {
  session: SessionPayload;
  children: React.ReactNode;
};

type AppShellContextValue = {
  session: SessionPayload;
  location: string;
  setLocation: (value: string) => void;
  locations: LocationRecord[];
  locationsLoading: boolean;
  role: string;
  assignedLocationId: string | null;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
};

const AppShellContext = createContext<AppShellContextValue | undefined>(undefined);

export function useAppShell() {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error("useAppShell must be used within AppShell");
  }
  return context;
}

export function AppShell({ session, children }: AppShellProps) {
  const userRole = session.user.role;
  const assignedLocationId = session.user.location?.id ?? null;

  const [locationState, setLocationState] = useState(
    userRole === "STAFF" ? assignedLocationId ?? "all" : "all"
  );
  const [searchQuery, setSearchQuery] = useState("");

  const { data: locationsData, isLoading: locationsLoading } = useLocations();
  const rawLocations = useMemo(() => {
    const apiLocations = locationsData?.locations ?? [];
    if (apiLocations.length === 0 && session.user.location) {
      return [
        {
          id: session.user.location.id,
          name: session.user.location.name,
          identifier: session.user.location.identifier,
          taxRateBasisPoints: 0,
          hotelSharePoints: 0,
          overnightRateCents: 0,
          overnightInOutPrivileges: false,
          pricingTiers: null,
        },
      ];
    }
    return apiLocations;
  }, [locationsData, session.user.location]);
  const locations = useMemo(() => {
    if (userRole === "STAFF" && assignedLocationId) {
      return rawLocations.filter((loc) => loc.id === assignedLocationId);
    }
    return rawLocations;
  }, [rawLocations, userRole, assignedLocationId]);

  const effectiveLocation = useMemo(() => {
    if (userRole === "STAFF") {
      return assignedLocationId ?? "all";
    }
    if (locationState === "all") return "all";
    return locations.some((loc) => loc.id === locationState) ? locationState : "all";
  }, [userRole, assignedLocationId, locationState, locations]);

  const handleLocationChange = (value: string) => {
    if (userRole === "STAFF") return;
    setLocationState(value);
  };

  return (
    <AppShellContext.Provider
      value={{
        session,
        location: effectiveLocation,
        setLocation: handleLocationChange,
        locations: locations as LocationRecord[],
        locationsLoading,
        role: userRole,
        assignedLocationId,
        searchQuery,
        setSearchQuery,
      }}
    >
      <div className="flex min-h-screen w-full bg-muted/40">
        <DesktopSidebar session={session} />
        <div className="flex min-h-screen flex-1 flex-col">
          <Topbar
            session={session}
            location={effectiveLocation}
            onLocationChange={handleLocationChange}
          />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </AppShellContext.Provider>
  );
}

type LocationSelectProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  options: { value: string; label: string }[];
};

function LocationSelect({ value, onChange, className, disabled, options }: LocationSelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn("w-full justify-between", className)}>
        <SelectValue placeholder="Select location" />
      </SelectTrigger>
      <SelectContent align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type SidebarProps = {
  session: SessionPayload;
};

function DesktopSidebar({ session }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[260px] flex-col border-r bg-white/70 p-4 lg:flex lg:w-[280px]">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-5 text-primary" />
          ValetPro
        </Link>
        <Badge variant="outline" className="text-[11px] uppercase">
          {session.tenant.slug}
        </Badge>
      </div>


      <nav className="mt-6 flex flex-1 flex-col gap-6">
        <SidebarSection title="Operations" items={NAV_ITEMS} pathname={pathname} />
        <SidebarSection title="Library" items={SECONDARY_ITEMS} pathname={pathname} />
      </nav>

      <UserSummary session={session} className="mt-auto" />
    </aside>
  );
}

type SidebarSectionProps = {
  title: string;
  items: typeof NAV_ITEMS;
  pathname: string | null;
};

function SidebarSection({ title, items, pathname }: SidebarSectionProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      <div className="space-y-1">
        {items.map((item) => {
          const isActive = pathname ? pathname.startsWith(item.href) : false;
          const label = (
            <span className="flex items-center gap-2">
              <item.icon className="size-4 shrink-0" />
              {item.label}
              {item.comingSoon ? (
                <Badge
                  variant={isActive ? "secondary" : "outline"}
                  className="text-[10px] uppercase"
                >
                  Soon
                </Badge>
              ) : null}
            </span>
          );

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {label}
              {item.badge ? (
                <Badge
                  variant={isActive ? "secondary" : "outline"}
                  className="text-[11px]"
                >
                  {item.badge}
                </Badge>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

type TopbarProps = {
  session: SessionPayload;
  location: string;
  onLocationChange: (value: string) => void;
};

function Topbar({ session, location, onLocationChange }: TopbarProps) {
  const pathname = usePathname();
  const { locations, locationsLoading, role, assignedLocationId, searchQuery, setSearchQuery } = useAppShell();
  const activeItem = useMemo(
    () => NAV_ITEMS.find((item) => pathname?.startsWith(item.href)) ?? NAV_ITEMS[0],
    [pathname]
  );
  const locationOptions = useMemo(
    () => {
      const mapped = locations.map((loc) => ({ value: loc.id, label: loc.name }));
      if (role === "STAFF") {
        return mapped;
      }
      return [{ value: "all", label: "All Locations" }, ...mapped];
    },
    [locations, role]
  );
  const assignedLocationName =
    assignedLocationId && locations.find((loc) => loc.id === assignedLocationId)?.name;

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-white/70 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        <MobileSidebarTrigger session={session} />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-muted-foreground">Current view</span>
          <span className="text-base font-semibold">{activeItem.label}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 md:flex">
          <Input
            placeholder="Search tickets, customers, plates..."
            className="w-64"
            aria-label="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {role === "STAFF" ? (
            <Badge variant="outline" className="hidden lg:flex lg:w-auto bg-muted/50 text-muted-foreground">
              {assignedLocationName ?? "Location not assigned"}
            </Badge>
          ) : (
            <LocationSelect
              value={location}
              onChange={onLocationChange}
              className="hidden lg:flex lg:w-48"
              options={locationOptions}
              disabled={locationsLoading || role === "STAFF"}
            />
          )}
        </div>

        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings className="size-4" />
        </Button>
        <UserSummary session={session} size="sm" />
      </div>
    </header>
  );
}

type MobileSidebarTriggerProps = {
  session: SessionPayload;
};

function MobileSidebarTrigger({ session }: MobileSidebarTriggerProps) {
  const pathname = usePathname();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="lg:hidden">
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-full flex-col p-4 sm:w-80">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="size-5 text-primary" />
            ValetPro
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname ? pathname.startsWith(item.href) : false;
              const label = (
                <span className="flex items-center gap-2">
                  <item.icon className="size-4" />
                  {item.label}
                  {item.comingSoon ? (
                    <Badge
                      variant={isActive ? "secondary" : "outline"}
                      className="text-[10px] uppercase"
                    >
                      Soon
                    </Badge>
                  ) : null}
                </span>
              );

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {label}
                  {item.badge ? (
                    <Badge
                      variant={isActive ? "secondary" : "outline"}
                      className="text-[11px]"
                    >
                      {item.badge}
                    </Badge>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="mt-auto">
          <Separator className="mb-4" />
          <UserSummary session={session} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

type UserSummaryProps = {
  session: SessionPayload;
  className?: string;
  size?: "sm" | "md";
};

function UserSummary({ session, className, size = "md" }: UserSummaryProps) {
  const initials = session.user.name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border bg-white/80 p-2 text-sm",
        size === "sm" && "border-none bg-transparent p-0",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <Avatar className="size-9 border">
          <AvatarFallback>{initials || "VP"}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{session.user.name}</span>
          <span className="text-xs text-muted-foreground capitalize">
            {session.user.role.toLowerCase()}
          </span>
        </div>
      </div>
      <Button variant="ghost" size="sm" className="hidden items-center gap-1 sm:flex">
        <span>Account</span>
        <ChevronDown className="size-4" />
      </Button>
    </div>
  );
}

