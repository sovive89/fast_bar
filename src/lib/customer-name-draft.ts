export type CustomerNameDraft = {
  value: string;
  editedManually: boolean;
  autoFilledBy: "phone" | "document" | null;
};

export function createEmptyCustomerNameDraft(): CustomerNameDraft {
  return { value: "", editedManually: false, autoFilledBy: null };
}

export function isPhoneLookupReady(value: string): boolean {
  const phone = value.replace(/\D/g, "");
  return (phone.length === 10 || phone.length === 11) && !/^(\d)\1+$/.test(phone);
}

export function isCurrentPhoneLookupRequest(
  currentSequence: number,
  requestSequence: number,
): boolean {
  return currentSequence === requestSequence;
}

export function editCustomerName(draft: CustomerNameDraft, value: string): CustomerNameDraft {
  return { value, editedManually: true, autoFilledBy: null };
}

export function applyCustomerPhoneLookup(
  draft: CustomerNameDraft,
  matchName: string | null,
): CustomerNameDraft {
  if (draft.editedManually) return draft;

  const name = matchName?.trim() ?? "";
  if (name) return { value: name, editedManually: false, autoFilledBy: "phone" };
  if (draft.autoFilledBy === "phone") return createEmptyCustomerNameDraft();
  return draft;
}

export function clearCustomerPhoneAutofill(draft: CustomerNameDraft): CustomerNameDraft {
  if (draft.editedManually || draft.autoFilledBy !== "phone") return draft;
  return createEmptyCustomerNameDraft();
}

export function applyCustomerDocumentLookup(
  draft: CustomerNameDraft,
  matchName: string | null,
): CustomerNameDraft {
  const name = matchName?.trim() ?? "";
  if (draft.editedManually || draft.value.trim() || draft.autoFilledBy === "phone" || !name)
    return draft;
  return { value: name, editedManually: false, autoFilledBy: "document" };
}
