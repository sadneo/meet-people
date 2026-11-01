import {
  OwnerBlocklistSchema,
  OwnerBlockStateSchema,
  SafetyReportReceiptSchema,
  SubmitSafetyReportSchema,
  type SubmitSafetyReport,
} from "../../../shared/safety";
import { authorizedRequest } from "../../auth/authorizedRequest";

const path = (id: string) =>
  `/api/matchmaking/safety/blocks/${encodeURIComponent(id)}`;
export const safetyClient = {
  list: (signal?: AbortSignal) =>
    authorizedRequest("/api/matchmaking/safety/blocks", OwnerBlocklistSchema, {
      signal,
    }),
  state: (id: string, signal?: AbortSignal) =>
    authorizedRequest(path(id), OwnerBlockStateSchema, { signal }),
  async block(id: string, blocked: boolean) {
    const saved = await authorizedRequest(path(id), OwnerBlockStateSchema, {
      method: blocked ? "PUT" : "DELETE",
    });
    const confirmed = await authorizedRequest(path(id), OwnerBlockStateSchema);
    if (
      saved.targetId !== id ||
      confirmed.targetId !== id ||
      saved.outgoingBlocked !== blocked ||
      confirmed.outgoingBlocked !== blocked
    )
      throw new Error(
        "The block change could not be confirmed. Reload before trying again.",
      );
    return confirmed;
  },
  report: (value: SubmitSafetyReport) =>
    authorizedRequest(
      "/api/matchmaking/safety/reports",
      SafetyReportReceiptSchema,
      { body: SubmitSafetyReportSchema.parse(value) },
    ),
  receipt: (requestId: string) =>
    authorizedRequest(
      `/api/matchmaking/safety/reports/${encodeURIComponent(requestId)}`,
      SafetyReportReceiptSchema,
    ),
};
