import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const sessionInput = z.object({ sessionId: z.string().uuid() });
const chatInput = z.object({
  requestId: z.string().uuid(),
  body: z.string().trim().min(1).max(1000),
});
export const requestMySupport = createServerFn({ method: "POST" })
  .inputValidator(sessionInput.extend({ optedIn: z.literal(true) }))
  .handler(async ({ data }) => {
    const { requestSupport } = await import("./support-requests.server");
    return requestSupport(data.sessionId, data.optedIn);
  });
export const getMySupportStatus = createServerFn({ method: "POST" })
  .inputValidator(sessionInput)
  .handler(async ({ data }) => {
    const { getSupportStatus } = await import("./support-requests.server");
    return getSupportStatus(data.sessionId);
  });
export const getSupportRequests = createServerFn({ method: "GET" }).handler(async () => {
  const { listSupportRequests } = await import("./support-requests.server");
  return listSupportRequests();
});
export const updateSupportRequest = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      requestId: z.string().uuid(),
      action: z.enum(["attend", "complete"]),
      staffName: z.string().trim().min(2).max(80),
      note: z.string().trim().max(2000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { advanceSupportRequest } = await import("./support-requests.server");
    return advanceSupportRequest(data);
  });
export const getMySupportMessages = createServerFn({ method: "POST" })
  .inputValidator(sessionInput.extend({ requestId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { getCustomerSupportMessages } = await import("./support-requests.server");
    return getCustomerSupportMessages(data.sessionId, data.requestId);
  });
export const sendMySupportMessage = createServerFn({ method: "POST" })
  .inputValidator(chatInput.extend({ sessionId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { sendSupportChat } = await import("./support-requests.server");
    return sendSupportChat(data, "customer");
  });
export const getSupportMessages = createServerFn({ method: "POST" })
  .inputValidator(z.object({ requestId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { getStaffSupportMessages } = await import("./support-requests.server");
    return getStaffSupportMessages(data.requestId);
  });
export const sendSupportMessage = createServerFn({ method: "POST" })
  .inputValidator(chatInput.extend({ staffName: z.string().trim().min(2).max(80) }))
  .handler(async ({ data }) => {
    const { sendSupportChat } = await import("./support-requests.server");
    return sendSupportChat(data, "staff");
  });

export const getSupportOccurrences = createServerFn({ method: "GET" }).handler(async () => {
  const { listSupportOccurrences } = await import("./support-requests.server");
  return listSupportOccurrences();
});
export const getSupportOccurrenceDetail = createServerFn({ method: "POST" })
  .inputValidator(z.object({ requestId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { getSupportOccurrence } = await import("./support-requests.server");
    return getSupportOccurrence(data.requestId);
  });
export const presumeMySupportResolved = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      sessionId: z.string().uuid(),
      requestId: z.string().uuid(),
      reason: z.enum(["no_answer", "false_alarm"]),
    }),
  )
  .handler(async ({ data }) => {
    const { presumeSupportResolved } = await import("./support-requests.server");
    return presumeSupportResolved(data);
  });
