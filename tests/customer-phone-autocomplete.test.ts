import { describe, expect, it } from "vitest";
import {
  applyCustomerDocumentLookup,
  applyCustomerPhoneLookup,
  clearCustomerPhoneAutofill,
  createEmptyCustomerNameDraft,
  editCustomerName,
  isCurrentPhoneLookupRequest,
  isPhoneLookupReady,
} from "../src/lib/customer-name-draft";

describe("autocompletar nome na abertura da comanda", () => {
  it("só libera a consulta com telefone completo e não repetido", () => {
    expect(isPhoneLookupReady("(61) 91111-2222")).toBe(true);
    expect(isPhoneLookupReady("61911112222")).toBe(true);
    expect(isPhoneLookupReady("(61) 9111-222")).toBe(false);
    expect(isPhoneLookupReady("11111111111")).toBe(false);
  });

  it("descarta resultado atrasado quando a requisição deixou de ser atual", () => {
    expect(isCurrentPhoneLookupRequest(8, 8)).toBe(true);
    expect(isCurrentPhoneLookupRequest(9, 8)).toBe(false);
    expect(isCurrentPhoneLookupRequest(8, 9)).toBe(false);
  });

  it("preenche o nome quando a consulta por telefone encontra um cliente", () => {
    const result = applyCustomerPhoneLookup(createEmptyCustomerNameDraft(), "Ana Souza");

    expect(result).toEqual({
      value: "Ana Souza",
      editedManually: false,
      autoFilledBy: "phone",
    });
  });

  it("atualiza o nome automático quando a busca encontra outro telefone cadastrado", () => {
    const first = applyCustomerPhoneLookup(createEmptyCustomerNameDraft(), "Ana Souza");
    const result = applyCustomerPhoneLookup(first, "João Lima");

    expect(result.value).toBe("João Lima");
    expect(result.autoFilledBy).toBe("phone");
  });

  it("limpa a sugestão por telefone obsoleta ao trocar o número", () => {
    const current = applyCustomerPhoneLookup(createEmptyCustomerNameDraft(), "Ana Souza");

    expect(clearCustomerPhoneAutofill(current)).toEqual(createEmptyCustomerNameDraft());
  });

  it("preserva qualquer nome editado manualmente contra resultados e limpeza automática", () => {
    const current = editCustomerName(
      applyCustomerPhoneLookup(createEmptyCustomerNameDraft(), "Ana Souza"),
      "Ana da Silva",
    );

    expect(applyCustomerPhoneLookup(current, "João Lima")).toEqual(current);
    expect(clearCustomerPhoneAutofill(current)).toEqual(current);
    expect(applyCustomerDocumentLookup(current, "Outra Pessoa")).toEqual(current);
  });

  it("permite que CPF/RG preencha apenas quando não existe nome digitado ou vindo do telefone", () => {
    const empty = createEmptyCustomerNameDraft();
    const fromDocument = applyCustomerDocumentLookup(empty, "Bruno Souza");
    const fromPhone = applyCustomerPhoneLookup(empty, "Ana Souza");

    expect(fromDocument.value).toBe("Bruno Souza");
    expect(applyCustomerDocumentLookup(fromPhone, "Bruno Souza")).toEqual(fromPhone);
    expect(applyCustomerDocumentLookup(empty, null)).toEqual(empty);
  });
});
