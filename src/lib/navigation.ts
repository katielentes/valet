import type { ComponentType, SVGProps } from "react";
import {
  BadgeCheck,
  CreditCard,
  LayoutDashboard,
  MessageSquare,
  PieChart,
  Ticket,
  Waypoints,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  badge?: string;
  comingSoon?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Active Tickets",
    href: "/tickets",
    icon: Ticket,
  },
  {
    label: "Payments",
    href: "/payments",
    icon: CreditCard,
  },
  {
    label: "Reports",
    href: "/reports",
    icon: PieChart,
    comingSoon: true,
  },
  {
    label: "Messaging",
    href: "/messages",
    icon: MessageSquare,
    comingSoon: true,
  },
  {
    label: "Locations",
    href: "/locations",
    icon: Waypoints,
    comingSoon: true,
  },
];

export const SECONDARY_ITEMS: NavItem[] = [
  {
    label: "Templates",
    href: "/templates",
    icon: BadgeCheck,
    comingSoon: true,
  },
];

