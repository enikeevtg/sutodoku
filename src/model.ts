export interface CardColor { h: number; s: number; v: number }
export interface CardDates { createdAt?: string; confirmedAt?: string }
export interface Task extends CardDates { text: string; done: boolean; color?: CardColor }
export interface ArchivedTask extends Task { archivedAt?: string }
export interface Area extends CardDates { title: string; done?: boolean; color?: CardColor; archive?: ArchivedTask[]; tasks: Task[] }
export interface Plan extends CardDates { version: 1; goal: string; goalColor?: CardColor; areas: Area[] }
export const positions = [0, 1, 2, 3, 5, 6, 7, 8];
export const clockwisePositions = [0, 1, 2, 5, 8, 7, 6, 3];
export function createPlan(): Plan {
  return { version: 1, goal: '', areas: Array.from({length: 8}, () => ({title: '', done: true, tasks: Array.from({length: 8}, () => ({text: '', done: false}))})) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalDate(value: unknown): boolean {
  return value === undefined || (typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)));
}

function hasValidDates(card: Record<string, unknown>): boolean {
  return isOptionalDate(card.createdAt) && isOptionalDate(card.confirmedAt);
}

function isOptionalColor(color: unknown): boolean {
  if (color === undefined) return true;
  if (!isRecord(color)) return false;
  return ([['h', 360], ['s', 100], ['v', 100]] as const).every(([key, max]) => {
    const value = color[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
  });
}

function isTask(value: unknown): value is Task {
  return isRecord(value) && typeof value.text === 'string' && typeof value.done === 'boolean'
    && hasValidDates(value) && isOptionalColor(value.color);
}

function isArchivedTask(value: unknown): value is ArchivedTask {
  return isTask(value) && (!('archivedAt' in value) || isOptionalDate(value.archivedAt));
}

function isArea(value: unknown): value is Area {
  return isRecord(value) && typeof value.title === 'string' && hasValidDates(value)
    && isOptionalColor(value.color) && (value.done === undefined || typeof value.done === 'boolean')
    && (value.archive === undefined || (Array.isArray(value.archive) && value.archive.every(isArchivedTask)))
    && Array.isArray(value.tasks) && value.tasks.length === 8 && value.tasks.every(isTask);
}

function isPlan(value: unknown): value is Plan {
  return isRecord(value) && value.version === 1 && typeof value.goal === 'string'
    && hasValidDates(value) && isOptionalColor(value.goalColor)
    && Array.isArray(value.areas) && value.areas.length === 8 && value.areas.every(isArea);
}

export function parsePlan(raw: string): Plan {
  const plan: unknown = JSON.parse(raw);
  if (!isPlan(plan)) throw new Error('Invalid plan format');
  syncCompletion(plan, false);
  for (const area of plan.areas) {
    if (area.archive) area.archive = sortedArchive(area);
  }
  return plan;
}
export function areaDone(area: Area): boolean {
  return area.tasks.every(task => task.done || !task.text.trim());
}
export function syncCompletion(plan: Plan, recordConfirmation = true, now = new Date().toISOString()) {
  plan.areas.forEach(area => {
    const done = areaDone(area);
    if (done && !area.done && recordConfirmation) area.confirmedAt = now;
    area.done = done;
  });
}
function recordTextEdit(card: CardDates, previous: string, text: string, now: string) {
  if (!previous.trim() && text.trim()) card.createdAt = now;
  if (!text.trim()) {delete card.createdAt; delete card.confirmedAt;}
}
export function setTaskText(task: Task, text: string, now = new Date().toISOString()) {
  recordTextEdit(task, task.text, text, now);
  task.text = text;
  if (!text.trim()) task.done = false;
}
export function setAreaTitle(area: Area, text: string, now = new Date().toISOString()) {
  recordTextEdit(area, area.title, text, now);
  area.title = text;
}
export function setGoalText(plan: Plan, text: string, now = new Date().toISOString()) {
  recordTextEdit(plan, plan.goal, text, now);
  plan.goal = text;
}
/** Insert along the clockwise path, shifting intervening cards; the center stays fixed. */
export function moveCards(plan: Plan, block: number, from: number, to: number): boolean {
  if (!Number.isInteger(block) || block < 0 || block > 8 || from === to) return false;
  const source = positions.indexOf(from), target = positions.indexOf(to);
  if (source < 0 || target < 0) return false;
  const cards = block === 4 ? plan.areas : plan.areas[positions.indexOf(block)].tasks;
  const ordered = clockwisePositions.map(position => cards[positions.indexOf(position)]);
  const [moved] = ordered.splice(clockwisePositions.indexOf(from), 1);
  ordered.splice(clockwisePositions.indexOf(to), 0, moved);
  clockwisePositions.forEach((position, index) => {cards[positions.indexOf(position)] = ordered[index];});
  syncCompletion(plan);
  return true;
}
/** Convert a drop before/after a card into the moved card's final position. */
export function insertionPosition(from: number, target: number, after: boolean): number {
  const sourceIndex = clockwisePositions.indexOf(from), targetIndex = clockwisePositions.indexOf(target);
  if (sourceIndex < 0 || targetIndex < 0) return from;
  const gap = targetIndex + Number(after);
  return clockwisePositions[gap - Number(sourceIndex < gap)];
}
export function progress(plan: Plan) {
  const tasks = plan.areas.flatMap(a => a.tasks).filter(t => t.text.trim());
  return {total: tasks.length, done: tasks.filter(t => t.done).length};
}
export function toMarkdown(plan: Plan): string {
  const clean = (s: string) => s.replace(/\r?\n/g, ' ');
  return `# ${clean(plan.goal) || 'My goal'}\n\n` + plan.areas.map((a, i) => `## ${areaDone(a) ? '✓ ' : ''}${clean(a.title) || `Direction ${i + 1}`}\n\n` + clockwisePositions.map(position => a.tasks[positions.indexOf(position)]).filter(t => t.text.trim()).map(t => `- [${t.done ? 'x' : ' '}] ${clean(t.text)}`).join('\n')).join('\n\n') + '\n';
}

export function canComplete(area: Area, index: number): boolean {
 const position = positions[index]; const order = clockwisePositions.indexOf(position);
 return !!area.tasks[index].text.trim() && clockwisePositions.slice(0, order).every(p => {const t = area.tasks[positions.indexOf(p)]; return !t.text.trim() || t.done;});
}
export function canUncomplete(area: Area, index: number): boolean {
 const order = clockwisePositions.indexOf(positions[index]);
 return order >= 0 && area.tasks[index].done && clockwisePositions.slice(order + 1).every(p => !area.tasks[positions.indexOf(p)].done);
}
export function toggleStep(area: Area, index: number, now = new Date().toISOString()): boolean {
 const task = area.tasks[index];
 if (!task || !task.text.trim() || !(task.done ? canUncomplete(area, index) : canComplete(area, index))) return false;
 task.done = !task.done;
 if (task.done) task.confirmedAt = now;
 return true;
}
function compareArchiveTasks(a: ArchivedTask, b: ArchivedTask): number {
 const time = (task: ArchivedTask) => task.confirmedAt ? Date.parse(task.confirmedAt) : -Infinity;
 const first = time(a), second = time(b);
 return first === second ? 0 : first > second ? -1 : 1;
}
export function sortedArchive(area: Area): ArchivedTask[] {
 return [...(area.archive ?? [])].sort(compareArchiveTasks);
}
export function sortedPlanArchive(plan: Plan): {areaIndex: number; item: ArchivedTask}[] {
 return plan.areas.flatMap((area, areaIndex) => (area.archive ?? []).map(item => ({areaIndex, item})))
   .sort((a, b) => compareArchiveTasks(a.item, b.item));
}
export function deleteArchivedTask(area: Area, task: ArchivedTask): boolean {
 const index = area.archive?.indexOf(task) ?? -1;
 if (index < 0) return false;
 area.archive!.splice(index, 1);
 return true;
}
export function removeStep(area: Area, index: number, archive: boolean, now = new Date().toISOString()): boolean {
 const ordered = clockwisePositions.map(p => area.tasks[positions.indexOf(p)]);
 const at = clockwisePositions.indexOf(positions[index]);
 if (at < 0) return false;
 if (archive && (!area.tasks[index].done || !area.tasks[index].text.trim())) return false;
 const removed = ordered.splice(at, 1)[0];
 if (archive) {
   (area.archive ??= []).push({...removed, archivedAt:now});
   area.archive = sortedArchive(area);
 }
 ordered.push({text:'', done:false});
 clockwisePositions.forEach((p, i) => {area.tasks[positions.indexOf(p)] = ordered[i];});
 return true;
}
