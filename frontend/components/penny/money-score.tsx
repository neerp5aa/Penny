import type { Zone } from "@/lib/api";

export const ZONE_STYLE: Record<Zone, { label: string; ring: string; fill: string; soft: string; text: string }> = {
  green: { label: "Green", ring: "stroke-zone-green", fill: "bg-zone-green", soft: "bg-zone-green-soft", text: "text-zone-green" },
  yellow: { label: "Yellow", ring: "stroke-zone-yellow", fill: "bg-zone-yellow", soft: "bg-zone-yellow-soft", text: "text-zone-yellow" },
  red: { label: "Red", ring: "stroke-zone-red", fill: "bg-zone-red", soft: "bg-zone-red-soft", text: "text-zone-red" },
};
