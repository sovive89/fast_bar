import { createServerFn } from "@tanstack/react-start";

export const normalizarDocumentoEstoqueComIA = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      base64: string;
      mimeType: string;
      fileName?: string | undefined;
      modoLeitura?: "documento" | "produtos" | undefined;
    }) => {
      if (data.modoLeitura !== undefined && !["documento", "produtos"].includes(data.modoLeitura))
        throw new Error("Modo de leitura inválido.");
      if (typeof data.base64 !== "string" || data.base64.length > 4 * 1024 * 1024)
        throw new Error("Envie um arquivo de até 3 MB.");
      if (data.modoLeitura === "produtos" && !/^image\/(jpeg|png|webp)$/.test(data.mimeType))
        throw new Error("Envie uma foto JPEG, PNG ou WebP para identificar produtos.");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const { normalizarDocumentoEstoqueComIA: processarOCR } = await import("./stock-ai.server");
    return processarOCR({ data });
  });
