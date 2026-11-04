import { createServerFn } from "@tanstack/react-start";

/**
 * Camada createServerFn da identificação da comanda — só expõe o server function; a lógica mora em
 * session-marks.server.ts. Exige o acesso ao caixa, mas não a senha: identificar uma comanda não
 * mexe em dinheiro nem em estoque.
 */
export const saveSessionMarkFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      sessionId: string;
      label?: string | null | undefined;
      color?: string | null | undefined;
      note?: string | null | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const { saveSessionMark } = await import("./session-marks.server");
    return saveSessionMark({
      sessionId: data.sessionId,
      input: { label: data.label, color: data.color, note: data.note },
      realizadoPor: "equipe",
    });
  });
