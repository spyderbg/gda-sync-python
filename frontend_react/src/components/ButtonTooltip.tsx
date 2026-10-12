import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type FocusEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Opening a balloon replaces the previous one, even while its trigger still has focus.
let activeTooltip: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getActiveTooltip() {
  return activeTooltip;
}

function setActiveTooltip(next: string | null) {
  if (Object.is(activeTooltip, next)) return;
  activeTooltip = next;
  for (const listener of [...listeners]) listener();
}

type TooltipStyle = CSSProperties & { '--arrow-left': string; '--content-height': string };

type TooltipBindings = {
  'aria-describedby'?: string;
  onMouseEnter: (event: MouseEvent<HTMLElement>) => void;
  onMouseLeave: (event: MouseEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
};

export default function ButtonTooltip({
  text,
  children,
}: {
  text: string;
  children: (bindings: TooltipBindings) => ReactNode;
}) {
  // The trigger stays a direct child of its button group; the balloon lives outside cards that could clip it.
  const id = useId();
  const active = useSyncExternalStore(subscribe, getActiveTooltip, getActiveTooltip);
  const visible = active === id;
  const focused = useRef(false);
  const balloon = useRef<HTMLDivElement>(null);
  const closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [position, setPosition] = useState<TooltipStyle>({
    left: '0px', bottom: '0px', width: '0px', '--arrow-left': '0px', '--content-height': '0px',
  });

  function keepOpen() { clearTimeout(closing.current); }

  function show(event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) {
    keepOpen();
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 24);
    const center = rect.left + rect.width / 2;
    const left = Math.max(12, Math.min(center - width / 2, window.innerWidth - width - 12));
    setPosition({
      left: `${left}px`,
      bottom: `${window.innerHeight - rect.top + 10}px`,
      width: `${width}px`,
      '--arrow-left': `${Math.max(12, Math.min(center - left, width - 12))}px`,
      '--content-height': `${Math.max(0, rect.top - 22)}px`,
    });
    setActiveTooltip(id);
  }

  function hide() {
    keepOpen();
    if (activeTooltip === id) setActiveTooltip(null);
  }

  function leave() {
    keepOpen();
    if (!focused.current) closing.current = setTimeout(hide, 150);
  }

  useEffect(() => {
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') hide(); }
    function scroll(event: Event) { if (!balloon.current?.contains(event.target as Node)) hide(); }
    window.addEventListener('keydown', escape);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', scroll, true);
    return () => {
      hide();
      window.removeEventListener('keydown', escape);
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [id]);

  const bindings: TooltipBindings = {
    'aria-describedby': visible ? id : undefined,
    onMouseEnter: show,
    onMouseLeave: leave,
    onFocus: event => { focused.current = true; show(event); },
    onBlur: () => { focused.current = false; leave(); },
  };

  return (
    <>
      {children(bindings)}
      {visible ? createPortal(
        <div id={id} ref={balloon} role="tooltip" className="button-tooltip" style={position} onMouseEnter={keepOpen} onMouseLeave={leave}>
          <div className="button-tooltip-content">{text}</div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
