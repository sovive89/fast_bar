import { createServerFn } from "@tanstack/react-start";

export const getPublicCompany = createServerFn({ method: "GET" }).handler(async () => {
  const { loadPublicCompany } = await import("./public-company.server");
  return loadPublicCompany();
});
