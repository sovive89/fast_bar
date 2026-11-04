import { describe, expect, it } from "vitest";
import { supportPriority } from "../src/lib/support-priority";

const createdAt = "2026-11-04T20:00:00.000Z";
const started = Date.parse(createdAt);
const waiting = { status: "requested" as const, escalated: false, createdAt };

describe("prioridade do apoio aguardando a equipe", () => {
  it("começa prioritário e muda precisamente após 30 e 60 segundos", () => {
    expect(supportPriority(waiting, started)).toBe("priority");
    expect(supportPriority(waiting, started + 29_999)).toBe("priority");
    expect(supportPriority(waiting, started + 30_000)).toBe("urgent");
    expect(supportPriority(waiting, started + 59_999)).toBe("urgent");
    expect(supportPriority(waiting, started + 60_000)).toBe("critical");
    expect(supportPriority(waiting, started + 15 * 60_000)).toBe("critical");
  });

  it("um novo acionamento após atendimento anterior já começa crítico", () => {
    expect(supportPriority({ ...waiting, escalated: true }, started)).toBe("critical");
  });

  it("assumir ou concluir interrompe a escalada, inclusive para reincidências", () => {
    for (const status of ["attending", "completed"] as const) {
      expect(supportPriority({ ...waiting, status }, started + 120_000)).toBe("attending");
      expect(supportPriority({ ...waiting, status, escalated: true }, started + 120_000)).toBe(
        "attending",
      );
    }
  });

  it("datas inválidas, futuras ou relógio inválido não provocam escalada por tempo", () => {
    expect(supportPriority({ ...waiting, createdAt: "invalid" }, started)).toBe("priority");
    expect(supportPriority(waiting, started - 1)).toBe("priority");
    expect(supportPriority(waiting, Number.NaN)).toBe("priority");
    expect(supportPriority(waiting, Number.POSITIVE_INFINITY)).toBe("priority");
  });

  it("reincidência é crítica mesmo se a data não puder ser lida", () => {
    expect(supportPriority({ ...waiting, createdAt: "invalid", escalated: true }, started)).toBe(
      "critical",
    );
  });
});
