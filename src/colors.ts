import {areaDone, type CardColor, type Plan} from './model';

export type ColorTarget = {kind:'goal'} | {kind:'area'; area:number} | {kind:'task'; area:number; task:number};
export const completedColor: CardColor = {h:140, s:48, v:70};

export function defaultColor(plan: Plan, target: ColorTarget): CardColor {
  if (target.kind === 'goal') return {h:30, s:78, v:96};
  if (target.kind === 'area') return {h:0, s:0, v:86};
  const direction = plan.areas[target.area].color ?? defaultColor(plan, {kind:'area', area:target.area});
  return {h:direction.h, s:direction.s * .35, v:direction.v * .8};
}
export function storedColor(plan: Plan, target: ColorTarget): CardColor | undefined {
  if (target.kind === 'goal') return plan.goalColor;
  if (target.kind === 'area') return plan.areas[target.area].color;
  return plan.areas[target.area].tasks[target.task].color;
}
export function cardColor(plan: Plan, target: ColorTarget): CardColor {
  return storedColor(plan, target) ?? defaultColor(plan, target);
}
export function displayedCardColor(plan: Plan, target: ColorTarget): CardColor {
  const done = target.kind === 'area' ? areaDone(plan.areas[target.area])
    : target.kind === 'task' && plan.areas[target.area].tasks[target.task].done;
  return done ? completedColor : cardColor(plan, target);
}
export function setCardColor(plan: Plan, target: ColorTarget, color: CardColor | undefined) {
  if (target.kind === 'goal') {
    if (color) plan.goalColor = {...color}; else delete plan.goalColor;
  } else {
    const item = target.kind === 'area' ? plan.areas[target.area] : plan.areas[target.area].tasks[target.task];
    if (color) item.color = {...color}; else delete item.color;
  }
}
export function colorRgb({h, s, v}: CardColor): [number, number, number] {
  const saturation = s / 100, value = v / 100;
  const channel = (offset: number) => {
    const k = (offset + h / 60) % 6;
    return Math.round(255 * value * (1 - saturation * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [channel(5), channel(3), channel(1)];
}
export function colorHex(color: CardColor): string {
  return '#' + colorRgb(color).map(channel => channel.toString(16).padStart(2, '0')).join('');
}
export function colorFromHex(hex: string): CardColor {
  const [r, g, b] = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  if (delta) h = 60 * (max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4);
  return {h, s:max ? delta / max * 100 : 0, v:max * 100};
}
export function colorStyles(color: CardColor): Record<string, string> {
  const rgb = colorRgb(color);
  const luminance = rgb.map(channel => {const c = channel / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;});
  const light = luminance[0] * .2126 + luminance[1] * .7152 + luminance[2] * .0722 > .179;
  return {'--ow-card-bg':colorHex(color), '--ow-card-text':light ? '#16191e' : '#fff', '--ow-card-muted':light ? '#42464d' : '#ddd'};
}
