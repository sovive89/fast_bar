import { createServerFn } from "@tanstack/react-start";

/**
 * Abre a comanda a partir do QR — mas antes de virar "pending" (fila da equipe), passa por
 * "unverified": manda um código por WhatsApp via Twilio Verify (serviço gerenciado — o código em
 * si nunca é gerado nem guardado por este app) e só sobe pra "pending" quando o cliente digita o
 * código certo em /c/{sessionId}/verificar. Existe pra confirmar que o celular informado é real,
 * não pra confirmar identidade — a equipe continua confirmando a comanda em pessoa no caixa
 * depois disso, sem mudança nesse passo.
 *
 * Cliente que já verificou o celular numa visita anterior (fastbar_customers.phone_verified) pula
 * a etapa de OTP de novo — verificar o mesmo número toda vez que a pessoa volta ao bar não
 * protegeria nada a mais, só atrito repetido.
 *
 * Sem credenciais do Twilio no deploy, a etapa de OTP inteira é pulada e a comanda nasce direto em
 * "pending", na fila de confirmação da equipe. Antes desse guarda a comanda era gravada como
 * "unverified" e só depois o provedor Twilio estourava por falta de credencial: a linha ficava no
 * banco num status que a tela do caixa nem consulta, então a comanda sumia — o cliente via o botão
 * travado e a equipe nunca via a comanda pra confirmar. A verificação de celular é um reforço
 * opcional; o portão de verdade sempre foi a confirmação da equipe no balcão.
 */
export const openClientSession = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { name: string; phone: string; channel?: "sms" | "whatsapp" | undefined }) => data,
  )
  .handler(async ({ data }) => {
    const { admin, sanitizeName, sanitizePhone, upsertCustomer } = await import("./fastbar.server");
    const { requestPhoneVerification, isVerificationConfigured } = await import(
      "./verification/service.server"
    );
    const channel = data.channel === "sms" ? "sms" : "whatsapp";
    const verificationOn = await isVerificationConfigured();

    const name = sanitizeName(data.name);
    const phone = sanitizePhone(data.phone);

    if (!name || !phone) {
      return { ok: false as const, message: "Informe nome completo e celular com DDD." };
    }

    // Mesmo celular já tem comanda em andamento (verificada ou não): reaproveita em vez de criar
    // outra — evita disparar um código novo a cada toque em "Abrir comanda".
    const { data: existing } = await admin()
      .from("fastbar_sessions")
      .select("id, customer_id, status")
      .eq("phone", phone)
      .in("status", ["unverified", "pending", "open"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && existing.status !== "unverified") {
      const profileCompleted = await isProfileCompleted(existing.customer_id);
      return {
        ok: true as const,
        sessionId: existing.id,
        needsVerification: false as const,
        profileCompleted,
      };
    }

    const { data: existingCustomer } = await admin()
      .from("fastbar_customers")
      .select("phone_verified")
      .eq("phone", phone)
      .maybeSingle();
    // Sem Twilio configurado, todo celular entra como "já verificado": não há OTP pra pedir, e
    // segurar a comanda em "unverified" só a esconderia da equipe.
    const alreadyVerified = !verificationOn || existingCustomer?.phone_verified === true;

    const customerId = await upsertCustomer(name, { phone });

    if (existing) {
      // Comanda "unverified" de uma tentativa anterior: reaproveita a linha em vez de criar outra.
      if (alreadyVerified) {
        const { error } = await admin()
          .from("fastbar_sessions")
          .update({ status: "pending" })
          .eq("id", existing.id)
          .eq("status", "unverified");
        if (error) return { ok: false as const, message: "Não foi possível abrir a comanda." };
        const profileCompleted = await isProfileCompleted(customerId);
        return {
          ok: true as const,
          sessionId: existing.id,
          needsVerification: false as const,
          profileCompleted,
        };
      }

      const sendResult = await requestPhoneVerification(phone, channel);
      if (!sendResult.ok) return { ok: false as const, message: sendResult.message };
      return {
        ok: true as const,
        sessionId: existing.id,
        needsVerification: true as const,
        profileCompleted: false,
      };
    }

    const { data: inserted, error } = await admin()
      .from("fastbar_sessions")
      .insert({
        customer_name: name,
        phone,
        status: alreadyVerified ? "pending" : "unverified",
        customer_id: customerId,
        channel: "qr",
      })
      .select("id")
      .single();
    if (error || !inserted) {
      return { ok: false as const, message: "Não foi possível abrir a comanda." };
    }

    if (alreadyVerified) {
      const profileCompleted = await isProfileCompleted(customerId);
      return {
        ok: true as const,
        sessionId: inserted.id,
        needsVerification: false as const,
        profileCompleted,
      };
    }

    const sendResult = await requestPhoneVerification(phone, channel);
    if (!sendResult.ok) {
      return { ok: false as const, message: sendResult.message };
    }

    return {
      ok: true as const,
      sessionId: inserted.id,
      needsVerification: true as const,
      profileCompleted: false,
    };
  });

/** Confere o código digitado em /c/{sessionId}/verificar contra o Twilio Verify — quem guarda o
 * código, controla expiração e limita tentativas erradas é o próprio Twilio, não este app. Só sobe
 * a comanda pra "pending" (fila da equipe) quando o Twilio confirma. */
export const verifyClientCode = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string; code: string }) => data)
  .handler(async ({ data }) => {
    const { admin } = await import("./fastbar.server");
    const { checkPhoneVerification } = await import("./verification/service.server");

    const code = data.code.replace(/\D/g, "");
    if (code.length < 4) {
      return { ok: false as const, message: "Digite o código recebido." };
    }

    const { data: session } = await admin()
      .from("fastbar_sessions")
      .select("status, phone, customer_id")
      .eq("id", data.sessionId)
      .maybeSingle();

    if (!session || session.status !== "unverified" || !session.phone) {
      return { ok: false as const, message: "Comanda não encontrada ou já verificada." };
    }

    const checkResult = await checkPhoneVerification(session.phone, code);
    if (!checkResult.ok) {
      return { ok: false as const, message: checkResult.message };
    }
    if (!checkResult.verified) {
      return { ok: false as const, message: "Código incorreto ou expirado." };
    }

    const { error } = await admin()
      .from("fastbar_sessions")
      .update({ status: "pending" })
      .eq("id", data.sessionId)
      .eq("status", "unverified");
    if (error) return { ok: false as const, message: "Não foi possível confirmar." };

    if (session.customer_id) {
      // phoneVerified é sobre o número ser real, não sobre identidade nem sobre aceite de
      // campanhas (marketing_opt_in é campo separado, decidido só na tela de perfil) — os três
      // nunca se misturam.
      await admin()
        .from("fastbar_customers")
        .update({ phone_verified: true, phone_verified_at: new Date().toISOString() })
        .eq("id", session.customer_id);
    }

    const profileCompleted = await isProfileCompleted(session.customer_id);
    return { ok: true as const, profileCompleted };
  });

/** Pede um código novo pro Twilio Verify pra mesma comanda ainda não verificada — usado pelo link
 * "Reenviar código" quando o código expirou, não chegou ou o cliente errou demais. */
export const resendVerificationCode = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { sessionId: string; channel?: "sms" | "whatsapp" | undefined }) => data,
  )
  .handler(async ({ data }) => {
    const { admin } = await import("./fastbar.server");
    const { requestPhoneVerification } = await import("./verification/service.server");

    const { data: session } = await admin()
      .from("fastbar_sessions")
      .select("status, phone")
      .eq("id", data.sessionId)
      .maybeSingle();

    if (!session || session.status !== "unverified" || !session.phone) {
      return { ok: false as const, message: "Comanda não encontrada ou já verificada." };
    }

    // Reenvio pode trocar de canal: quem não recebeu no WhatsApp costuma querer tentar por SMS.
    const sendResult = await requestPhoneVerification(
      session.phone,
      data.channel === "sms" ? "sms" : "whatsapp",
    );
    if (!sendResult.ok) return { ok: false as const, message: sendResult.message };

    return { ok: true as const };
  });

async function isProfileCompleted(customerId: string | null) {
  if (!customerId) return false;
  const { admin } = await import("./fastbar.server");
  const { data } = await admin()
    .from("fastbar_customers")
    .select("profile_completed_at")
    .eq("id", customerId)
    .maybeSingle();
  return Boolean(data?.profile_completed_at);
}

export const ADMINISTRATIVE_REGIONS = [
  "Águas Claras",
  "Brazlândia",
  "Candangolândia",
  "Ceilândia",
  "Cruzeiro",
  "Fercal",
  "Gama",
  "Guará",
  "Itapoã",
  "Jardim Botânico",
  "Lago Norte",
  "Lago Sul",
  "Núcleo Bandeirante",
  "Paranoá",
  "Park Way",
  "Planaltina",
  "Plano Piloto",
  "Recanto das Emas",
  "Riacho Fundo",
  "Riacho Fundo II",
  "Samambaia",
  "Santa Maria",
  "São Sebastião",
  "SCIA/Estrutural",
  "SIA",
  "Sobradinho",
  "Sobradinho II",
  "Sol Nascente/Pôr do Sol",
  "Taguatinga",
  "Vicente Pires",
  "Varjão",
] as const;

export const HOW_FOUND_OUT_OPTIONS = [
  "Instagram",
  "Indicação de amigos",
  "Google",
  "Passando em frente",
  "Outro",
] as const;

export const AGE_RANGE_OPTIONS = ["18-24", "25-34", "35-44", "45+"] as const;

export const MUSIC_GENRE_OPTIONS = [
  "Sertanejo",
  "Pagode/Samba",
  "Eletrônica",
  "Rock",
  "Funk",
  "Forró",
  "Variado",
  "Outro",
] as const;

// Compartilhado com a UI da tela de perfil, que anuncia esse número pro cliente antes de pedir os
// dados — mudar aqui sem mudar lá deixaria a promessa e a conta descasadas.
export const WELCOME_DISCOUNT_PERCENT = 10;

/**
 * Segunda tela, separada da abertura da comanda de propósito — é aqui que o consentimento de
 * marketing é um ato próprio, não algo aceito sem perceber junto com nome+celular.
 */
export const submitCustomerProfile = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      sessionId: string;
      fullName?: string;
      birthdayDay?: number;
      birthdayMonth?: number;
      administrativeRegion?: string;
      howFoundOut?: string;
      ageRange?: string;
      profession?: string;
      favoriteMusicGenre?: string;
      marketingOptIn: boolean;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { admin, sanitizeName } = await import("./fastbar.server");

    // marketingOptIn vem sempre de um checkbox (marcado/desmarcado), então já chega como boolean —
    // esse guard é só defesa contra chamada malformada, não uma regra que o cliente precisa cumprir.
    if (typeof data.marketingOptIn !== "boolean") {
      return { ok: false as const, message: "Não foi possível salvar — tente de novo." };
    }
    // Aniversário é tudo ou nada: dia sem mês (ou vice-versa) não serve pra campanha nenhuma e
    // quebraria o CHECK do banco — melhor recusar aqui com mensagem clara do que estourar erro.
    const hasDay = typeof data.birthdayDay === "number";
    const hasMonth = typeof data.birthdayMonth === "number";
    if (hasDay !== hasMonth) {
      return { ok: false as const, message: "Informe dia e mês do aniversário, ou deixe os dois em branco." };
    }
    if (hasDay && (data.birthdayDay! < 1 || data.birthdayDay! > 31)) {
      return { ok: false as const, message: "Dia do aniversário inválido." };
    }
    if (hasMonth && (data.birthdayMonth! < 1 || data.birthdayMonth! > 12)) {
      return { ok: false as const, message: "Mês do aniversário inválido." };
    }

    const { data: session } = await admin()
      .from("fastbar_sessions")
      .select("customer_id")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session?.customer_id) {
      return { ok: false as const, message: "Comanda não encontrada." };
    }

    const fullName = data.fullName ? sanitizeName(data.fullName) : null;
    const nowIso = new Date().toISOString();

    const profile = {
      full_name: fullName,
      birthday_day: data.birthdayDay ?? null,
      birthday_month: data.birthdayMonth ?? null,
      administrative_region: data.administrativeRegion?.trim() || null,
      how_found_out: data.howFoundOut?.trim() || null,
      // Faixa etária, profissão e gênero musical saíram da tela atual (a v2 do formulário pediu
      // um formulário mais enxuto) — os campos continuam existindo no banco por se tratar de
      // colunas já usadas antes, mas não entram mais na conta de "preencheu tudo" abaixo.
      age_range: data.ageRange?.trim() || null,
      profession: data.profession?.trim() || null,
      favorite_music_genre: data.favoriteMusicGenre?.trim() || null,
    };

    // O brinde de boas-vindas (hoje aplicado como desconto na comanda) sai por cadastro completo
    // E aceite de promoções — é a troca anunciada na tela. Só os campos que a tela atual realmente
    // pede entram nessa conta.
    const requiredFields = [
      profile.full_name,
      profile.birthday_day,
      profile.birthday_month,
      profile.administrative_region,
      profile.how_found_out,
    ];
    const filledEverything = requiredFields.every((value) => value !== null);
    const earnsDiscount = filledEverything && data.marketingOptIn;

    const { data: customer } = await admin()
      .from("fastbar_customers")
      .select("welcome_discount_earned_at")
      .eq("id", session.customer_id)
      .maybeSingle();
    // Só concede uma vez na vida do cliente, mesmo que ele reencontre a tela por outro caminho.
    const grantDiscount = earnsDiscount && !customer?.welcome_discount_earned_at;

    const { error } = await admin()
      .from("fastbar_customers")
      .update({
        ...profile,
        marketing_opt_in: data.marketingOptIn,
        profile_completed_at: nowIso,
        ...(grantDiscount ? { welcome_discount_earned_at: nowIso } : {}),
      })
      .eq("id", session.customer_id);

    if (error) return { ok: false as const, message: "Não foi possível salvar." };

    if (grantDiscount) {
      // Aplicado depois do cadastro salvar: se o desconto falhar, o cliente não perde os dados
      // que digitou — e o pior caso é ficar sem o abatimento, não com cadastro pela metade.
      await admin()
        .from("fastbar_sessions")
        .update({ discount_percent: WELCOME_DISCOUNT_PERCENT })
        .eq("id", data.sessionId);
    }

    return { ok: true as const, discountGranted: grantDiscount };
  });
