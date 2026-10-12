import { useEffect, useRef, type ReactNode } from 'react';
import { classes } from '../classes';

// wide is a large dialog, and xl an extra large one whose body scrolls between a fixed header and footer.
export default function AppModal({
  title,
  wide,
  xl,
  onClose,
  children,
}: {
  title: string;
  wide?: boolean;
  xl?: boolean;
  onClose: () => void;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.classList.add('modal-open');
    dialog.current?.querySelector<HTMLElement>('button, input, select, [tabindex="0"]')?.focus();
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab') return;
      // Keep keyboard focus inside the dialog.
      const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]');
      if (!elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeydown);
    return () => {
      document.removeEventListener('keydown', onKeydown);
      document.body.classList.remove('modal-open');
      previous?.focus();
    };
  }, []);

  return (
    <>
      <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <div ref={dialog} className={classes('modal-dialog', 'modal-dialog-centered', { 'modal-lg': !!wide, 'modal-xl modal-dialog-scrollable': !!xl })} role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{title}</h5>
              <button type="button" className="close" aria-label="Close dialog" onClick={onClose}><span aria-hidden="true">&times;</span></button>
            </div>
            {children}
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>
  );
}
