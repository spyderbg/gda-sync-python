// The tweeny actions on view elements (GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement.h/.cpp), in C++'s
// namespace tweeny: of an element's alpha, color, position, rotation, scale, pivot and text fit box, and from one
// placeholder (a Dummy element) to another. A tween of an element ends once its elements list releases it (C++'s
// sentinel is the element's pointer); a null element makes an empty action.
//
// C++ overloads the fades for a float alpha (0 to 1) and a uint8_t one (0 to 255): FadeFromTo, FadeTo and FadeBy here
// are the float ones; FadeIn, FadeOut and Blink use the uint8_t ones, as in C++.

import type { Color, Point, Size } from '../../../Game/RuntimeExport/IResources';
import { sentinel } from '../../../../hat_libs/egt_hpp/sentinel';
import * as tweeny from '../../../../hat_libs/tweeny/tweeny';
import type { BaseElement } from '../BaseElement';
import { TextElement } from '../TextElement';

type ElementPtr = BaseElement | null;
type duration_t = tweeny.duration_t;
type ease_t = tweeny.ease_t;

const { create_tween_by_impl, create_tween_from_to_impl, create_tween_to_impl, delay, ease, sequence, together } = tweeny;

/** The element's pointer as a sentinel: expired once the elements list released it. */
function Sentinel(element: ElementPtr) {
  return new sentinel(() => !element || element.IsReleased());
}

/** static_cast<uint8_t> */
function uint8(value: number) {
  return Math.min(Math.max(Math.trunc(value), 0), 255);
}

// Visibility //////////////////////////////////////////////////////////////////

const SetAlphaFloat = (obj: BaseElement, arg: number) => void obj.SetAlpha(uint8(arg * 255.0));
const GetAlphaFloat = (obj: BaseElement) => obj.GetColor().a / 255.0;
const SetAlphaUint8 = (obj: BaseElement, arg: number) => void obj.SetAlpha(uint8(arg));
const GetAlphaUint8 = (obj: BaseElement) => obj.GetColor().a;

export function FadeFromTo(element: ElementPtr, begin: number, end: number, duration: duration_t, easy_func: ease_t = ease.linear) {
  return create_tween_from_to_impl('FadeFromTo', element, begin, end, SetAlphaFloat, GetAlphaFloat, duration, Sentinel(element), easy_func);
}

function FadeFromToUint8(element: ElementPtr, begin: number, end: number, duration: duration_t, easy_func: ease_t = ease.linear) {
  return create_tween_from_to_impl('FadeFromTo', element, begin, end, SetAlphaUint8, GetAlphaUint8, duration, Sentinel(element), easy_func);
}

export function FadeTo(element: ElementPtr, end: number, duration: duration_t, ease_func: ease_t = ease.linear) {
  return create_tween_to_impl('FadeTo', element, end, SetAlphaFloat, GetAlphaFloat, duration, Sentinel(element), ease_func);
}

function FadeToUint8(element: ElementPtr, end: number, duration: duration_t, ease_func: ease_t = ease.linear) {
  return create_tween_to_impl('FadeTo', element, end, SetAlphaUint8, GetAlphaUint8, duration, Sentinel(element), ease_func);
}

export function FadeBy(element: ElementPtr, amount: number, duration: duration_t, ease_func: ease_t = ease.linear) {
  return create_tween_by_impl('FadeBy', element, amount, SetAlphaFloat, GetAlphaFloat, duration, Sentinel(element), ease_func);
}

export function FadeIn(element: ElementPtr, duration: duration_t = 750, ease_func: ease_t = ease.linear) {
  return FadeFromToUint8(element, 0, 255, duration, ease_func);
}

export function FadeOut(element: ElementPtr, duration: duration_t = 750, ease_func: ease_t = ease.linear) {
  return FadeFromToUint8(element, 255, 0, duration, ease_func);
}

export function FadeInOut(element: ElementPtr, duration: duration_t = 750) {
  const duration2 = duration / 2;
  return sequence(FadeIn(element, duration2), FadeOut(element, duration2));
}

export function FadeOutIn(element: ElementPtr, duration: duration_t = 750) {
  const duration2 = duration / 2;
  return sequence(FadeOut(element, duration2), FadeIn(element, duration2));
}

export function Blink(element: ElementPtr, show_duration: duration_t = 350, hide_duration: duration_t = 350, start_visible = false) {
  const begin = 0;
  const end = 255;
  return sequence(
    FadeToUint8(element, start_visible ? end : begin, 0, ease.arch_smooth_step),
    delay(start_visible ? show_duration : hide_duration),
    FadeToUint8(element, start_visible ? begin : end, 0, ease.arch_smooth_step),
    delay(start_visible ? hide_duration : show_duration),
  );
}

// Color ///////////////////////////////////////////////////////////////////////

const CHANNELS = ['r', 'g', 'b', 'a'] as const;

const SetChannel = (channel: keyof Color) => (obj: BaseElement, arg: number) => void obj.SetColor({ [channel]: uint8(arg) });
const GetChannel = (channel: keyof Color) => (obj: BaseElement) => obj.GetColor()[channel];

export function ColorFromTo(element: ElementPtr, begin: Color, end: Color, duration: duration_t, ease_func: ease_t = ease.linear) {
  const [actionRed, actionGreen, actionBlue, actionAlpha] = CHANNELS.map(channel => create_tween_from_to_impl('ColorFromTo', element,
    begin[channel], end[channel], SetChannel(channel), GetChannel(channel), duration, Sentinel(element), ease_func));
  return together(actionRed, actionGreen, actionBlue, actionAlpha);
}

export function ColorTo(element: ElementPtr, end: Color, duration: duration_t, ease_func: ease_t = ease.linear) {
  const [actionRed, actionGreen, actionBlue, actionAlpha] = CHANNELS.map(channel => create_tween_to_impl('ColorTo', element,
    end[channel], SetChannel(channel), GetChannel(channel), duration, Sentinel(element), ease_func));
  return together(actionRed, actionGreen, actionBlue, actionAlpha);
}

// Translation /////////////////////////////////////////////////////////////////

const SetPosition = (obj: BaseElement, arg: Point) => void obj.SetPosition(arg);
const GetPosition = (obj: BaseElement) => obj.GetPosition();

export function MoveFromTo(element: ElementPtr, begin: Point, end: Point, duration: duration_t, ease_func: ease_t = ease.linear) {
  return create_tween_from_to_impl('MoveFromTo', element, begin, end, SetPosition, GetPosition, duration, Sentinel(element), ease_func);
}

export function MoveTo(element: ElementPtr, end: Point, duration: duration_t, ease_func: ease_t = ease.linear) {
  return create_tween_to_impl('MoveTo', element, end, SetPosition, GetPosition, duration, Sentinel(element), ease_func);
}

export function MoveBy(element: ElementPtr, amount: Point, duration: duration_t, ease_func: ease_t = ease.linear) {
  return create_tween_by_impl('MoveBy', element, amount, SetPosition, GetPosition, duration, Sentinel(element), ease_func);
}

// Rotation ////////////////////////////////////////////////////////////////////

const SetRotation = (obj: BaseElement, arg: number) => void obj.SetRotation(arg);
const GetRotation = (obj: BaseElement) => obj.GetRotation();

export function RotateFromTo(element: ElementPtr, begin: number, end: number, duration: duration_t, ease_func: ease_t = ease.linear) {
  return create_tween_from_to_impl('RotateFromTo', element, begin, end, SetRotation, GetRotation, duration, Sentinel(element), ease_func);
}

export function RotateTo(element: ElementPtr, end: number, duration: duration_t, ease_func: ease_t = ease.linear) {
  return create_tween_to_impl('RotateTo', element, end, SetRotation, GetRotation, duration, Sentinel(element), ease_func);
}

export function RotateBy(element: ElementPtr, amount: number, duration: duration_t, ease_func: ease_t = ease.linear) {
  return create_tween_by_impl('RotateBy', element, amount, SetRotation, GetRotation, duration, Sentinel(element), ease_func);
}

// Scale ///////////////////////////////////////////////////////////////////////

const SetScale = (obj: BaseElement, arg: Point) => void obj.SetScale(arg);
const GetScale = (obj: BaseElement) => obj.GetScale();

export function ScaleFromTo(element: ElementPtr, begin: Point, end: Point, duration: duration_t, ease_func: ease_t = ease.linear) {
  return create_tween_from_to_impl('ScaleFromTo', element, begin, end, SetScale, GetScale, duration, Sentinel(element), ease_func);
}

export function ScaleTo(element: ElementPtr, end: Point, duration: duration_t, ease_func: ease_t = ease.linear) {
  return create_tween_to_impl('ScaleTo', element, end, SetScale, GetScale, duration, Sentinel(element), ease_func);
}

export function ScaleBy(element: ElementPtr, amount: Point, duration: duration_t, ease_func: ease_t = ease.linear) {
  return create_tween_by_impl('ScaleBy', element, amount, SetScale, GetScale, duration, Sentinel(element), ease_func);
}

export function ZoomIn(element: ElementPtr, duration: duration_t, ease_func: ease_t = ease.linear) {
  return ScaleFromTo(element, { x: 0.0, y: 0.0 }, { x: 1.0, y: 1.0 }, duration, ease_func);
}

export function ZoomOut(element: ElementPtr, duration: duration_t, ease_func: ease_t = ease.linear) {
  return ScaleFromTo(element, { x: 1.0, y: 1.0 }, { x: 0.0, y: 0.0 }, duration, ease_func);
}

// Pivot ///////////////////////////////////////////////////////////////////////

const SetPivot = (obj: BaseElement, arg: Point) => void obj.SetPivot(arg);
const GetPivot = (obj: BaseElement) => obj.GetPivot();

export function PivotFromTo(element: ElementPtr, begin: Point, end: Point, duration: duration_t, ease_func: ease_t = ease.linear) {
  return create_tween_from_to_impl('PivotFromTo', element, begin, end, SetPivot, GetPivot, duration, Sentinel(element), ease_func);
}

export function PivotTo(element: ElementPtr, end: Point, duration: duration_t, ease_func: ease_t = ease.linear) {
  return create_tween_to_impl('PivotTo', element, end, SetPivot, GetPivot, duration, Sentinel(element), ease_func);
}

export function PivotBy(element: ElementPtr, amount: Point, duration: duration_t, ease_func: ease_t = ease.linear) {
  return create_tween_by_impl('PivotBy', element, amount, SetPivot, GetPivot, duration, Sentinel(element), ease_func);
}

// TextElement FitBox //////////////////////////////////////////////////////////

const SetFitBox = (obj: BaseElement, arg: Size) => void (obj as TextElement).SetFitBox(arg);
const GetFitBox = (obj: BaseElement): Size => (obj as TextElement).GetFitBox() ?? { w: 0, h: 0 };

export function FitBoxFromTo(element: ElementPtr, begin: Size, end: Size, duration: duration_t, ease_func: ease_t = ease.linear) {
  if (!(element instanceof TextElement)) return new tweeny.tween_action();
  return create_tween_from_to_impl('FitBoxFromTo', element, begin, end, SetFitBox, GetFitBox, duration, Sentinel(element), ease_func);
}

export function FitBoxTo(element: ElementPtr, end: Size, duration: duration_t, ease_func: ease_t = ease.linear) {
  if (!(element instanceof TextElement)) return new tweeny.tween_action();
  return create_tween_to_impl('FitBoxTo', element, end, SetFitBox, GetFitBox, duration, Sentinel(element), ease_func);
}

export function FitBoxBy(element: ElementPtr, amount: Size, duration: duration_t, ease_func: ease_t = ease.linear) {
  if (!(element instanceof TextElement)) return new tweeny.tween_action();
  return create_tween_by_impl('FitBoxBy', element, amount, SetFitBox, GetFitBox, duration, Sentinel(element), ease_func);
}

// Placeholders ////////////////////////////////////////////////////////////////

/** The tweens of the element to the values of the end placeholder that its data sets. */
function PlaceholderEnd(element: BaseElement, end: BaseElement, duration: duration_t, ease_func: ease_t) {
  const endElementData = end.GetElementData();
  let actionEnd = new tweeny.tween_action();
  if (endElementData.position) actionEnd = together(actionEnd, MoveTo(element, end.GetPosition(), duration, ease_func));
  if (endElementData.scale) actionEnd = together(actionEnd, ScaleTo(element, end.GetScale(), duration, ease_func));
  if (endElementData.rotation !== undefined) actionEnd = together(actionEnd, RotateTo(element, end.GetRotation(), duration, ease_func));
  if (endElementData.pivot) actionEnd = together(actionEnd, PivotTo(element, end.GetPivot(), duration, ease_func));
  if (endElementData.color) actionEnd = together(actionEnd, ColorTo(element, end.GetColor(), duration, ease_func));
  // TextElement
  if (element instanceof TextElement && end instanceof TextElement && end.GetElementData().fitBox) {
    actionEnd = together(actionEnd, FitBoxTo(element, end.GetFitBox() ?? { w: 0, h: 0 }, duration, ease_func));
  }
  return actionEnd;
}

/** The element from the values of one placeholder (a Dummy element) to another's: those of their values their data sets. */
export function PlaceholderFromTo(element: ElementPtr, begin: ElementPtr, end: ElementPtr, duration: duration_t, ease_func: ease_t = ease.linear) {
  if (!element || !begin || !end) return new tweeny.tween_action();

  // set initial elements values
  const beginElementData = begin.GetElementData();
  let actionBegin = new tweeny.tween_action();
  if (beginElementData.position) actionBegin = together(actionBegin, MoveTo(element, begin.GetPosition(), 0, ease_func));
  if (beginElementData.scale) actionBegin = together(actionBegin, ScaleTo(element, begin.GetScale(), 0, ease_func));
  if (beginElementData.rotation !== undefined) actionBegin = together(actionBegin, RotateTo(element, begin.GetRotation(), 0, ease_func));
  if (beginElementData.pivot) actionBegin = together(actionBegin, PivotTo(element, begin.GetPivot(), 0, ease_func));
  if (beginElementData.color) actionBegin = together(actionBegin, ColorTo(element, begin.GetColor(), 0, ease_func));

  // TextElement: C++ sets the begin fit box at once
  if (element instanceof TextElement && begin instanceof TextElement && begin.GetElementData().fitBox) element.SetFitBox(begin.GetFitBox());

  return sequence(actionBegin, PlaceholderEnd(element, end, duration, ease_func));
}

/** The element from its values to those of a placeholder (a Dummy element) its data sets. */
export function PlaceholderTo(element: ElementPtr, end: ElementPtr, duration: duration_t, ease_func: ease_t = ease.linear) {
  if (!element || !end) return new tweeny.tween_action();
  return PlaceholderEnd(element, end, duration, ease_func);
}
