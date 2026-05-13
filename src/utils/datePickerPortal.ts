/** Usato da DatePickerField e dai listener document (turni, presenze) per ignorare click sul portale calendario. */
export function isDatePickerPortalClick(target: EventTarget | null): boolean {
  const el =
    target instanceof Element
      ? target
      : target instanceof Node && target.parentElement
        ? target.parentElement
        : null;
  return Boolean(el?.closest('[data-osteria-date-picker-portal]'));
}
