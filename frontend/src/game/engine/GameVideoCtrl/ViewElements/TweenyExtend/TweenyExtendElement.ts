// The tweeny actions on view elements (GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement.h/.cpp).

import type { Color, Point } from '../../../Game/RuntimeExport/IResources';
import { Delay, type Easing, type TweenAction, Together, ValueFromTo, ease } from '../../../GameCore/Tools/Tweeny';
import type { BaseElement } from '../BaseElement';
import { TextElement } from '../TextElement';

const mix = (from: number, to: number, t: number) => from + (to - from) * t;

function PointTo(get: () => Point, set: (point: Point) => void, to: Point, duration: number, easing: Easing): TweenAction {
  let from: Point = { x: 0, y: 0 };
  // tween_to: from the value when the action begins
  return ValueFromTo(t => set({ x: mix(from.x, to.x, t), y: mix(from.y, to.y, t) }), 0, 1, duration, easing).OnBegin(() => {
    from = { ...get() };
  });
}

export function MoveTo(element: BaseElement, position: Point, duration: number, easing: Easing = ease.linear) {
  return PointTo(() => element.GetPosition(), point => element.SetPosition(point), position, duration, easing);
}

export function ScaleTo(element: BaseElement, scale: Point, duration: number, easing: Easing = ease.linear) {
  return PointTo(() => element.GetScale(), point => element.SetScale(point), scale, duration, easing);
}

export function PivotTo(element: BaseElement, pivot: Point, duration: number, easing: Easing = ease.linear) {
  return PointTo(() => element.GetPivot(), point => element.SetPivot(point), pivot, duration, easing);
}

export function RotateTo(element: BaseElement, rotation: number, duration: number, easing: Easing = ease.linear) {
  let from = 0;
  return ValueFromTo(t => element.SetRotation(mix(from, rotation, t)), 0, 1, duration, easing).OnBegin(() => {
    from = element.GetRotation();
  });
}

export function ColorTo(element: BaseElement, color: Color, duration: number, easing: Easing = ease.linear) {
  let from: Color = { r: 255, g: 255, b: 255, a: 255 };
  return ValueFromTo(t => element.SetColor({ r: mix(from.r, color.r, t), g: mix(from.g, color.g, t), b: mix(from.b, color.b, t), a: mix(from.a, color.a, t) }),
    0, 1, duration, easing).OnBegin(() => {
    from = element.GetColor();
  });
}

/** An element from the values of one placeholder (a Dummy element) to another's: those of their values the view sets. */
export function PlaceholderFromTo(element: BaseElement | null, begin: BaseElement | null, end: BaseElement | null, duration: number,
  easing: Easing = ease.linear): TweenAction {
  // C++ takes the elements' pointers (ElementsList::Find), which may be null
  if (!element || !begin || !end) return Delay(duration);
  const beginData = begin.GetElementData();
  const endData = end.GetElementData();
  // set initial elements values
  const actionBegin: TweenAction[] = [];
  if (beginData.position) actionBegin.push(MoveTo(element, begin.GetPosition(), 0, easing));
  if (beginData.scale) actionBegin.push(ScaleTo(element, begin.GetScale(), 0, easing));
  if (beginData.rotation !== undefined) actionBegin.push(RotateTo(element, begin.GetRotation(), 0, easing));
  if (beginData.pivot) actionBegin.push(PivotTo(element, begin.GetPivot(), 0, easing));
  if (beginData.color) actionBegin.push(ColorTo(element, begin.GetColor(), 0, easing));
  // create element tween action
  const actionEnd: TweenAction[] = [];
  if (endData.position) actionEnd.push(MoveTo(element, end.GetPosition(), duration, easing));
  if (endData.scale) actionEnd.push(ScaleTo(element, end.GetScale(), duration, easing));
  if (endData.rotation !== undefined) actionEnd.push(RotateTo(element, end.GetRotation(), duration, easing));
  if (endData.pivot) actionEnd.push(PivotTo(element, end.GetPivot(), duration, easing));
  if (endData.color) actionEnd.push(ColorTo(element, end.GetColor(), duration, easing));
  const action = Together(Together(actionBegin), Together(actionEnd));
  // TextElement
  if (element instanceof TextElement) {
    if (begin instanceof TextElement && beginData.fitBox) action.OnBegin(() => element.SetFitBox(begin.GetFitBox()));
    if (end instanceof TextElement && endData.fitBox) action.OnEnd(() => element.SetFitBox(end.GetFitBox()));
  }
  return action;
}
