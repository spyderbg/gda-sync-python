import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { classes } from '../classes';

// A number that can be edited three ways: a click opens a field to type the exact value in (Enter or leaving it keeps
// it, Escape restores the value it had); in the field, Up and Down add and subtract 1 (10 with Shift); and dragging the
// number changes it by a pixel per pixel the pointer moves (10 with Shift), left and right for the x axis, up and down
// for the y axis, so it follows the pointer the way the element moves on the screen. begin marks where one change
// starts, for undo; each new value is a change.
const DRAG_THRESHOLD = 3;

const shown = (value: number) => (Number.isInteger(value) ? String(value) : String(Math.round(value * 10000) / 10000));

export default function NumberScrub({
  value, axis, label, onChange, onBegin,
}: {
  value: number;
  axis: 'x' | 'y';
  label: string;
  onChange: (value: number) => void;
  onBegin: () => void;
}) {
  const [editing, setEditingState] = useState(false);
  const [text, setTextState] = useState('');
  const fieldRef = useRef<HTMLInputElement>(null);
  const editingRef = useRef(false);
  const textRef = useRef('');
  const startRef = useRef<{ x: number; y: number; value: number; pointer: number } | null>(null);
  const draggingRef = useRef(false);
  const originalRef = useRef(0);

  function setEditing(next: boolean) {
    editingRef.current = next;
    setEditingState(next);
  }
  function setText(next: string) {
    textRef.current = next;
    setTextState(next);
  }

  function pointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || editing) return;
    startRef.current = { x: event.clientX, y: event.clientY, value, pointer: event.pointerId };
    draggingRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = startRef.current;
    if (!start || event.pointerId !== start.pointer) return;
    const moved = axis === 'x' ? event.clientX - start.x : event.clientY - start.y;
    if (!draggingRef.current && Math.abs(event.clientX - start.x) < DRAG_THRESHOLD && Math.abs(event.clientY - start.y) < DRAG_THRESHOLD) return;
    if (!draggingRef.current) {
      draggingRef.current = true;
      onBegin();
    }
    onChange(start.value + Math.round(moved) * (event.shiftKey ? 10 : 1));
  }
  function pointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = startRef.current;
    if (!start || event.pointerId !== start.pointer) return;
    startRef.current = null;
    if (!draggingRef.current) edit();
    draggingRef.current = false;
  }

  function cancel() {
    startRef.current = null;
    draggingRef.current = false;
  }

  function edit() {
    originalRef.current = value;
    setText(shown(value));
    setEditing(true);
    onBegin();
  }
  // The field is focused once it is in the document, as nextTick did after editing became true.
  useEffect(() => {
    if (!editing) return;
    fieldRef.current?.focus();
    fieldRef.current?.select();
  }, [editing]);

  function commit() {
    if (!editingRef.current) return;
    const raw = textRef.current;
    const parsed = Number(raw.trim().replace(',', '.'));
    setEditing(false);
    if (raw.trim() !== '' && Number.isFinite(parsed) && parsed !== value) onChange(parsed);
  }
  function keydown(event: ReactKeyboardEvent<HTMLInputElement>) {
    // The keys edit the number: the dialog does not close on Escape, nor move between assets on the arrows.
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (value !== originalRef.current) onChange(originalRef.current);
      setEditing(false);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const current = Number(textRef.current.trim().replace(',', '.'));
      const next = (Number.isFinite(current) ? current : value) + (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1);
      setText(shown(next));
      onChange(next);
    }
  }

  if (editing) {
    return (
      <input ref={fieldRef} value={text} type="text" inputMode="decimal" className="number-scrub-field" aria-label={label}
        onChange={event => setText(event.target.value)} onKeyDown={keydown} onBlur={commit} onClick={event => event.stopPropagation()} />
    );
  }
  return (
    <button type="button" className={classes('number-scrub', `is-${axis}`)} aria-label={`${label}: ${shown(value)}`}
      title={`Click to type ${axis}, then Up and Down to step it, or drag ${axis === 'x' ? 'left and right' : 'up and down'} to change it`}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancel}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          edit();
        }
      }}>{shown(value)}</button>
  );
}
