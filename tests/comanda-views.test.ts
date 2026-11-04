import { describe, expect, it } from "vitest";
import { bucketOf } from "../src/lib/comanda-views";

const OP = "op-atual";
const make = (status: string, operacao_id: string | null, archived_at: string | null = null) =>
  ({ status, operacao_id, archived_at }) as Parameters<typeof bucketOf>[0];

describe("em qual aba a comanda aparece", () => {
  it("comandas em andamento ficam em Em aberto", () => {
    for (const status of ["unverified", "pending", "open"]) {
      expect(bucketOf(make(status, OP), OP)).toBe("open");
    }
  });

  it("desfechos da operação atual vão para Fechadas nesta operação", () => {
    for (const status of ["closed", "paid", "cancelled", "cortesia"]) {
      expect(bucketOf(make(status, OP), OP)).toBe("fechadas");
    }
  });

  it("na operação seguinte, os desfechos passam para Histórico", () => {
    for (const status of ["paid", "cancelled", "cortesia"]) {
      expect(bucketOf(make(status, OP), "op-nova")).toBe("historico");
    }
  });

  it("sem operação aberta, desfechos antigos ficam no Histórico", () => {
    expect(bucketOf(make("paid", OP), null)).toBe("historico");
    expect(bucketOf(make("paid", null), OP)).toBe("historico");
  });

  it("conta pedida e não paga de operação anterior volta para Em aberto, nunca some no Histórico", () => {
    expect(bucketOf(make("closed", "op-antiga"), OP)).toBe("open");
    expect(bucketOf(make("closed", OP), null)).toBe("open");
  });

  it("inadimplente tem área própria, mesmo arquivada ou da operação atual", () => {
    expect(bucketOf(make("inadimplente", OP), OP)).toBe("inadimplente");
    expect(bucketOf(make("inadimplente", "op-antiga", "2026-11-01"), OP)).toBe("inadimplente");
  });

  it("comanda arquivada vai para o Histórico", () => {
    expect(bucketOf(make("paid", OP, "2026-11-04"), OP)).toBe("historico");
  });
});
