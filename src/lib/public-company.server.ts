import { publicCompany, type PublicCompany } from "./public-company";

/** Public by design: only the owner-requested business contact fields leave the server. */
export async function loadPublicCompany(): Promise<PublicCompany> {
  const { admin, getDefaultTenantId } = await import("./fastbar.server");
  const tenantId = await getDefaultTenantId();
  const { data, error } = await admin()
    .from("fastbar_integrations")
    .select("config")
    .eq("tenant_id", tenantId)
    .eq("key", "estabelecimento")
    .maybeSingle();
  if (error) throw new Error("Não foi possível carregar os contatos do estabelecimento.");
  return publicCompany(data?.config);
}
