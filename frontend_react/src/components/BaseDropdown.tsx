import { createElement, useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { classes } from '../classes';

// A Bootstrap dropdown: the toggle slot opens the menu; clicking outside or pressing Escape closes it.
export default function BaseDropdown({
  tag = 'div',
  menuClass = '',
  toggle,
  children,
}: {
  tag?: keyof JSX.IntrinsicElements;
  menuClass?: string;
  toggle: (api: { open: boolean; toggle: () => void }) => ReactNode;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const toggleOpen = () => { setOpen(current => !current); };
  const close = () => { setOpen(false); };

  useEffect(() => {
    if (!open) return undefined;
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) close();
    }
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKeydown);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKeydown);
    };
  }, [open]);

  return createElement(
    tag,
    { ref: root, className: classes('dropdown', { show: open }) },
    toggle({ open, toggle: toggleOpen }),
    open ? createElement('div', { className: classes('dropdown-menu', menuClass, 'show'), onClick: close }, children) : null,
  );
}
