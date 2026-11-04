import type { SupportRequestStatus } from "./support-requests.types";

export type SupportPriorityLevel = "priority" | "urgent" | "critical" | "attending";
export type SupportAlertLevel = Exclude<SupportPriorityLevel, "attending">;

/** Escalate only requests still waiting for staff. Taking ownership stops timed escalation. */
export function supportPriority(
  request: { status: SupportRequestStatus; escalated: boolean; createdAt: string },
  now = Date.now(),
): SupportPriorityLevel {
  // Completed records also remain silent if a stale response still contains one.
  if (request.status !== "requested") return "attending";
  if (request.escalated) return "critical";
  const createdAt = Date.parse(request.createdAt);
  const elapsed = now - createdAt;
  if (!Number.isFinite(createdAt) || !Number.isFinite(now) || elapsed < 0) return "priority";
  if (elapsed >= 60_000) return "critical";
  if (elapsed >= 30_000) return "urgent";
  return "priority";
}
