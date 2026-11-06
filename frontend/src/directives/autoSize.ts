import type { ObjectDirective } from 'vue';

type FieldState = { fit: (force?: boolean) => void; onInput: () => void; observer: ResizeObserver };
const fields = new WeakMap<HTMLTextAreaElement, FieldState>();

export const vAutoSize: ObjectDirective<HTMLTextAreaElement> = {
  mounted(field) {
    let value: string | undefined;
    let width = 0;
    const fit = (force = false) => {
      const content = field.value || field.placeholder;
      if (!field.clientWidth || (!force && content === value)) return;
      const style = getComputedStyle(field);
      const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      field.style.height = 'auto';
      field.style.height = `${Math.ceil(field.scrollHeight + borders)}px`;
      value = content;
    };
    const onInput = () => fit();
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width !== width) {
        width = entry.contentRect.width;
        fit(true);
      }
    });
    fields.set(field, { fit, onInput, observer });
    field.addEventListener('input', onInput);
    observer.observe(field);
    fit();
  },
  updated(field) { fields.get(field)?.fit(); },
  unmounted(field) {
    const state = fields.get(field);
    state?.observer.disconnect();
    if (state) field.removeEventListener('input', state.onInput);
    fields.delete(field);
  },
};
