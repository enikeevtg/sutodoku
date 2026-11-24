import {Area, clockwisePositions, positions} from './model';
import {cardCenter, cardSize} from './layout';

export interface RouteLink { from: number; to: number; via: number[] }
export interface StepRoute { start: number | null; end: number | null; proxies: number[]; links: RouteLink[] }
export function stepRoute(area: Area): StepRoute {
  const filled = clockwisePositions.filter(position => area.tasks[positions.indexOf(position)].text.trim());
  if (!filled.length) return {start:null, end:null, proxies:[], links:[]};
  const links = filled.slice(1).map((to, index) => {
    const from = filled[index];
    return {from, to, via:clockwisePositions.slice(clockwisePositions.indexOf(from) + 1, clockwisePositions.indexOf(to))};
  });
  links.push({from:filled[filled.length - 1], to:4, via:[]});
  return {start:filled[0], end:filled[filled.length - 1], proxies:links.flatMap(link => link.via), links};
}

type Point = [number, number];
const center = (position: number): Point => {
  const point = cardCenter(position);
  return [point.x * 1000, point.y * 1000];
};
/** Clip to the card edge plus 6 units of clearance (1000-unit SVG). */
export function routePoints(link: RouteLink): string {
  const points = [link.from, ...link.via, link.to].map(center);
  const trim = (point: Point, toward: Point): Point => {
    const dx = toward[0] - point[0], dy = toward[1] - point[1];
    const ratio = (cardSize * 500 + 6) / Math.max(Math.abs(dx), Math.abs(dy));
    return [point[0] + dx * ratio, point[1] + dy * ratio];
  };
  const start = trim(points[0], points[1]);
  const end = trim(points[points.length - 1], points[points.length - 2]);
  return [start, ...points.slice(1, -1), end].map(point => point.join(',')).join(' ');
}
