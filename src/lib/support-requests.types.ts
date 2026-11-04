/** No gender, preference or staff narrative belongs in the public response. */
export type SupportRequestStatus = "requested" | "attending" | "completed";
export interface PublicSupportRequest {
  id: string;
  status: SupportRequestStatus;
  escalated: boolean;
}
export interface ActiveSupportRequest extends PublicSupportRequest {
  sessionId: string;
  customerName: string;
  createdAt: string;
  attendedBy: string | null;
}
export interface SupportMessage {
  id: string;
  sender: "customer" | "staff";
  body: string;
  createdAt: string;
}
export type SupportResult = { ok: true } | { ok: false; message: string };
export type RequestSupportResult =
  | { ok: true; request: PublicSupportRequest; alreadyRequested: boolean }
  | { ok: false; message: string };

/** Private staff log; an assistance request is not a formal legal occurrence. */
export interface SupportOccurrence extends ActiveSupportRequest {
  attendedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  completionNote: string | null;
}
