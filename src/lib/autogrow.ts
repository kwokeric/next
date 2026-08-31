// Resizes a textarea to fit its content — no cap, it just gets taller.
// Safe to call repeatedly (on mount and on every input) since it always
// measures fresh against the current value.
export function autogrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
