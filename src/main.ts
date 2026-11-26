import {FileView, Modal, Notice, Plugin, Scope, TFile, WorkspaceLeaf, addIcon, normalizePath, setIcon} from 'obsidian';
import {areaDone, canComplete, canUncomplete, toggleStep, insertionPosition, removeStep, sortedArchive, sortedPlanArchive, deleteArchivedTask, setTaskText, setAreaTitle, setGoalText, CardColor, createPlan, parsePlan, Plan, positions, progress, moveCards, syncCompletion, toMarkdown} from './model';
import {displayedCardColor, ColorTarget, colorFromHex, colorHex, colorStyles, defaultColor, setCardColor, storedColor} from './colors';
import {routePoints, stepRoute} from './route';
import {nearestInsertionGap} from './reorder';
import {PlanHistory} from './history';
import {planBasename} from './filename';
import {cardCenter, cardSize} from './layout';
const VIEW = 'open-window-64';
const ICON = 'open-window-nine-squares';
let nextRouteId = 0;

function registerHistoryKeys(scope: Scope, change: (redo: boolean) => void) {
  for (const redo of [false, true]) {
    scope.register(redo ? ['Mod', 'Shift'] : ['Mod'], 'z', event => {
      const target = event.targetNode;
      if (target?.instanceOf(HTMLElement) && target.closest('input, textarea, [contenteditable]')) return;
      change(redo);
      return false;
    });
  }
}

class TextModal extends Modal {
  constructor(app: Plugin['app'], private title: string, private value: string, private submit: (value: string) => void) { super(app); }
  onOpen() {
    this.contentEl.createEl('h2', {text: this.title});
    const input = this.contentEl.createEl('textarea', {cls: 'ow-modal-input'});
    input.value = this.value;
    input.rows = 5;
    input.setAttribute('aria-label', this.title);
    const save = () => { const value = input.value.trim(); this.close(); this.submit(value); };
    input.onkeydown = e => {
      if (e.isComposing) return;
      if (e.key === 'Escape') {e.preventDefault(); e.stopPropagation(); this.close();}
      else if (e.key === 'Enter' && !e.shiftKey) {e.preventDefault(); e.stopPropagation(); save();}
    };
    const actions = this.contentEl.createDiv({cls:'ow-modal-actions'});
    actions.createEl('button', {text:'Cancel'}).onclick = () => this.close();
    actions.createEl('button', {text:'Confirm', cls:'mod-cta'}).onclick = save;
    input.focus();
  }
  onClose() { this.contentEl.empty(); }
}
class ArchiveModal extends Modal {
  constructor(app: Plugin['app'], private getPlan: () => Plan, private areaIndex: number | undefined, private canModify: () => boolean, private save: () => void, private changeHistory: (redo: boolean) => boolean) {
    super(app);
    registerHistoryKeys(this.scope, redo => {
      if (!this.canModify() || !this.changeHistory(redo)) return;
      this.renderArchive();
      this.titleEl.tabIndex = -1; this.titleEl.focus();
    });
  }
  onOpen() {
    this.modalEl.addClass('ow-archive-modal');
    this.renderArchive();
  }
  private renderArchive() {
    const plan = this.getPlan();
    const areaIndex = this.areaIndex;
    this.titleEl.setText(areaIndex === undefined ? 'Plan archive' : `Archive: ${plan.areas[areaIndex].title || 'Direction'}`);
    this.contentEl.empty();
    const items = areaIndex === undefined ? sortedPlanArchive(plan)
      : sortedArchive(plan.areas[areaIndex]).map(item => ({item, areaIndex}));
    if (!items.length) {this.contentEl.createEl('p', {text:'Archive is empty.'}); return;}
    const sourceStyles = areaIndex === undefined
      ? plan.areas.map((_, area) => colorStyles(displayedCardColor(plan, {kind:'area', area}))) : undefined;
    const table = this.contentEl.createDiv({cls:'ow-archive-scroll'}).createEl('table', {cls:'ow-archive-table'});
    table.createEl('caption', {text:'Confirmed cards · most recently confirmed first'});
    const head = table.createEl('thead').createEl('tr');
    const columns = ['Card', 'Created', 'Last confirmed', 'Archived', 'Actions'];
    if (sourceStyles) columns.unshift('Direction');
    for (const text of columns) head.createEl('th', {text, attr:{scope:'col'}});
    const body = table.createEl('tbody');
    const formatter = new Intl.DateTimeFormat('en-GB', {year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, timeZoneName:'short'});
    items.forEach(({item, areaIndex: source}, index) => {
      const row = body.createEl('tr');
      const direction = plan.areas[source].title || `Direction ${source + 1}`;
      if (sourceStyles) {
        row.addClass('ow-archive-source-row');
        row.setCssProps(sourceStyles[source]);
        row.createEl('td', {cls:'ow-archive-direction', text:direction});
      }
      row.createEl('td', {cls:'ow-archive-text', text:item.text});
      for (const value of [item.createdAt, item.confirmedAt, item.archivedAt]) {
        const cell = row.createEl('td', {cls:'ow-archive-date'});
        if (value) cell.createEl('time', {text:formatter.format(new Date(value)), attr:{datetime:value, title:value}});
        else cell.setText('—');
      }
      const label = `Delete archived card: ${item.text}${sourceStyles ? ` (${direction})` : ''}`;
      const remove = row.createEl('td').createEl('button', {cls:'ow-archive-delete', attr:{type:'button', 'aria-label':label}});
      setIcon(remove, 'trash-2');
      remove.onclick = () => {
        if (!this.canModify() || !deleteArchivedTask(this.getPlan().areas[source], item)) return;
        this.save(); this.renderArchive();
        const buttons = this.contentEl.querySelectorAll<HTMLButtonElement>('.ow-archive-delete');
        if (buttons.length) buttons[Math.min(index, buttons.length - 1)].focus();
        else {this.titleEl.tabIndex = -1; this.titleEl.focus();}
      };
    });
  }
  onClose() {this.contentEl.empty();}
}
class ColorModal extends Modal {
  private draft: CardColor | undefined;
  private committed = false;
  constructor(app: Plugin['app'], initial: CardColor | undefined, private fallback: CardColor, private preview: (color: CardColor | undefined) => void, private finish: (committed: boolean) => void) {
    super(app);
    this.draft = initial ? {...initial} : undefined;
  }
  onOpen() {
    const root = this.contentEl;
    root.addClass('ow-color-modal');
    root.createEl('h2', {text:'Card color'});
    const sample = root.createDiv({cls:'ow-color-sample', text:'Preview'});
    const pickerLabel = root.createEl('label', {cls:'ow-color-picker-label', text:'Choose color '});
    const picker = pickerLabel.createEl('input', {type:'color', attr:{'aria-label':'Choose color'}});
    const sliders: {key:keyof CardColor; input:HTMLInputElement; output:HTMLOutputElement}[] = [];
    const sync = () => {
      const color = this.draft ?? this.fallback;
      sample.setCssProps(colorStyles(color));
      picker.value = colorHex(color);
      sliders.forEach(({key, input, output}) => {
        input.value = String(color[key]);
        output.value = `${Math.round(color[key])}${key === 'h' ? '°' : '%'}`;
      });
      this.preview(this.draft);
    };
    for (const [key, label, max] of [['h', 'Hue', 360], ['s', 'Saturation', 100], ['v', 'Brightness', 100]] as const) {
      const row = root.createEl('label', {cls:'ow-color-slider'});
      row.createSpan({text:label});
      const output = row.createEl('output');
      const input = row.createEl('input', {type:'range', attr:{min:'0', max:String(max), step:'1', 'aria-label':label}});
      sliders.push({key, input, output});
      input.oninput = () => { this.draft = {...(this.draft ?? this.fallback), [key]:Number(input.value)}; sync(); };
    }
    picker.oninput = () => { this.draft = colorFromHex(picker.value); sync(); };
    root.createEl('button', {text:'Reset color', cls:'ow-color-reset'}).onclick = () => { this.draft = undefined; sync(); };
    const actions = root.createDiv({cls:'ow-modal-actions'});
    actions.createEl('button', {text:'Cancel'}).onclick = () => this.close();
    actions.createEl('button', {text:'Save', cls:'mod-cta'}).onclick = () => {this.committed = true; this.close();};
    sync();
    picker.focus();
  }
  onClose() { this.finish(this.committed); this.contentEl.empty(); }
}
class MandalaView extends FileView {
  private plan: Plan = createPlan();
  private history = new PlanHistory();
  private queue: Promise<void> = Promise.resolve();
  private revision = 0;
  private valid = false;
  private activeBlock = 4;
  private selectedTask: string | null = null;
  private selectedByArea: Record<number, string> = {};
  private pendingNavigation: number | undefined;
  private dragging: {block:number; position:number; revision:number} | null = null;
  constructor(leaf: WorkspaceLeaf, private plugin: MandalaPlugin) {
    super(leaf);
    this.scope = new Scope(this.app.scope);
    registerHistoryKeys(this.scope, redo => {this.restoreHistory(redo);});
    this.scope.register([], 'Escape', () => {
      if (!this.valid || this.activeBlock === 4) return;
      this.activateBlock(4);
      return false;
    });
    this.register(() => this.cancelNavigation());
  }
  getViewType() { return VIEW; }
  getDisplayText() { return this.file?.basename ?? 'suToDoku'; }
  getIcon() { return ICON; }
  async onLoadFile(file: TFile) {
    this.cancelNavigation();
    this.clearDrag();
    this.valid = false;
    this.history.clear();
    this.activeBlock = 4;
    this.selectedTask = null; this.selectedByArea = {};
    await this.queue;
    const revision = ++this.revision;
    try {
      const plan = parsePlan(await this.app.vault.read(file));
      if (revision !== this.revision) return;
      this.plan = plan; this.history.reset(plan); this.valid = true; this.render();
      this.queue = this.queue.then(() => this.renameFile(file, plan.goal));
    } catch {
      this.valid = false; this.contentEl.empty();
      this.contentEl.createEl('p', {text:'Unable to read the plan. A valid suToDoku version 1 plan is required.'});
    }
  }
  async onUnloadFile() { this.cancelNavigation(); this.clearDrag(); ++this.revision; this.valid = false; this.history.clear(); await this.queue; this.contentEl.empty(); }
  private save(recordHistory = true) {
    if (!this.file || !this.valid) return;
    if (recordHistory) {syncCompletion(this.plan); this.history.record(this.plan);}
    this.updateHistoryButtons();
    const file = this.file;
    const data = JSON.stringify(this.plan, null, 2);
    const goal = this.plan.goal;
    this.queue = this.queue.then(async () => {
      await this.app.vault.modify(file, data);
      await this.renameFile(file, goal);
    }).catch(() => {new Notice('Unable to save the plan. Check file access.');});
  }
  private async renameFile(file: TFile, goal: string) {
    try {await this.plugin.renamePlan(file, goal);}
    catch {new Notice('The plan was loaded or saved, but its file could not be renamed. Check file access.');}
  }
  private restoreHistory(redo = false): boolean {
    if (!this.valid) return false;
    const plan = redo ? this.history.redo() : this.history.undo();
    if (!plan) return false;
    this.cancelNavigation(); this.clearDrag();
    this.plan = plan;
    this.selectedTask = null; this.selectedByArea = {};
    this.save(false); this.render();
    return true;
  }
  private updateHistoryButtons() {
    const undo = this.contentEl.querySelector<HTMLButtonElement>('.ow-undo');
    const redo = this.contentEl.querySelector<HTMLButtonElement>('.ow-redo');
    if (undo) undo.disabled = !this.history.canUndo;
    if (redo) redo.disabled = !this.history.canRedo;
  }
  private edit(title: string, value: string, update: (value: string) => void) {
    this.cancelNavigation();
    const revision = this.revision;
    const focusedKey = this.contentEl.ownerDocument.activeElement?.closest<HTMLElement>('[data-card]')?.dataset.card;
    new TextModal(this.app, title, value, text => {
      if (revision !== this.revision || !this.valid) return;
      update(text); this.save(); this.render();
      this.contentEl.querySelector<HTMLButtonElement>(focusedKey ? `[data-card="${focusedKey}"] .ow-edit` : '.ow-block.is-active .ow-cell')?.focus({preventScroll:true});
    }).open();
  }
  private cancelNavigation() {
    if (this.pendingNavigation !== undefined) window.clearTimeout(this.pendingNavigation);
    this.pendingNavigation = undefined;
  }
  private activateBlock(block: number, moveFocus = true) {
    this.cancelNavigation();
    this.activeBlock = block;
    this.contentEl.querySelectorAll<HTMLElement>('.ow-block').forEach(group => {
      const index = Number(group.dataset.block);
      const active = index === block;
      group.toggleClass('is-active', active);
      const body = group.querySelector<HTMLElement>('.ow-block-grid')!;
      body.inert = !active;
      body.setAttribute('aria-hidden', String(!active));
      group.querySelector<HTMLButtonElement>('.ow-block-preview')!.hidden = active;
    });
    const status = this.contentEl.querySelector<HTMLElement>('.ow-focus-label');
    if (status) status.setText(block === 4 ? 'Goal and directions' : this.plan.areas[positions.indexOf(block)].title || `Direction ${positions.indexOf(block) + 1}`);
    const back = this.contentEl.querySelector<HTMLButtonElement>('.ow-back');
    if (back) back.hidden = block === 4;
    if (moveFocus) this.contentEl.querySelector<HTMLButtonElement>('.ow-block.is-active [data-position="4"] .ow-cell')?.focus({preventScroll:true});
  }
  private selectTask(key: string) {
    const area = Number(key.split('-')[1]);
    if (this.selectedByArea[area] === key) delete this.selectedByArea[area]; else this.selectedByArea[area] = key;
    this.selectedTask = this.selectedByArea[area] ?? null;
    this.contentEl.querySelectorAll<HTMLElement>('.ow-task').forEach(card => {
      const selected = Object.values(this.selectedByArea).includes(card.dataset.card ?? '');
      card.toggleClass('is-selected', selected);
      card.querySelector('.ow-cell')?.setAttribute('aria-pressed', String(selected));
    });
  }
  private iconButton(parent: HTMLElement, icon: string, label: string, cls: string, action: () => void) {
    const button = parent.createEl('button', {cls:`ow-icon-button ${cls}`, attr:{type:'button', 'aria-label':label, 'data-tooltip-position':'top'}});
    setIcon(button, icon);
    button.onclick = event => { event.stopPropagation(); this.cancelNavigation(); action(); };
    button.ondblclick = event => event.stopPropagation();
    return button;
  }
  private clearDrag() {
    this.dragging = null;
    this.contentEl.querySelectorAll('.is-dragging, .is-drop-target').forEach(card => card.classList.remove('is-dragging', 'is-drop-target'));
  }
  private reorder(block: number, from: number, to: number) {
    this.cancelNavigation();
    this.clearDrag();
    const cards = block === 4 ? this.plan.areas : this.plan.areas[positions.indexOf(block)].tasks;
    const before = [...cards];
    if (!moveCards(this.plan, block, from, to)) return;
    const remap = (n: number) => cards.findIndex(card => card === before[n]);
    const selections: Record<number, string> = {};
    for (const value of Object.values(this.selectedByArea)) {
      const [, areaText, taskText] = value.split('-');
      const area = Number(areaText), task = Number(taskText);
      const nextArea = block === 4 ? remap(area) : area;
      const nextTask = block !== 4 && area === positions.indexOf(block) ? remap(task) : task;
      selections[nextArea] = `task-${nextArea}-${nextTask}`;
    }
    this.selectedByArea = selections;
    // Keep the selected step attached to its contents, including direction moves.
    if (this.selectedTask) {
      const [, area, task] = this.selectedTask.split('-');
      const a = Number(area), t = Number(task);
      this.selectedTask = block === 4 ? `task-${remap(a)}-${t}` : a === positions.indexOf(block) ? `task-${a}-${remap(t)}` : this.selectedTask;
    }
    this.save(); this.render();
    this.contentEl.querySelector<HTMLButtonElement>(`[data-block="${block}"] [data-position="${to}"] .ow-cell`)?.focus({preventScroll:true});
  }
  private bindReorder(card: HTMLElement, button: HTMLButtonElement, block: number, position: number) {
    button.draggable = true;
    button.setAttribute('aria-description', 'Drag between cards to insert clockwise. Keyboard: Alt + arrow keys.');
    button.ondragstart = event => {
      if (this.activeBlock !== block || !this.valid || !event.dataTransfer) {event.preventDefault(); return;}
      this.cancelNavigation();
      this.dragging = {block, position, revision:this.revision};
      card.addClass('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-open-window-card', JSON.stringify({block, position}));
      event.dataTransfer.setData('text/plain', button.textContent ?? '');
      event.dataTransfer.setDragImage(card, card.clientWidth / 2, card.clientHeight / 2);
    };
    button.ondragend = () => this.clearDrag();
    button.onkeydown = event => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const delta = {ArrowLeft:-1, ArrowRight:1, ArrowUp:-3, ArrowDown:3}[event.key];
      if (!delta) return;
      event.preventDefault();
      let target = position + delta;
      if (target === 4) target += delta;
      if (target < 0 || target > 8 || (Math.abs(delta) === 1 && Math.floor(target / 3) !== Math.floor(position / 3))) return;
      this.reorder(block, position, target);
    };
  }
  private bindInsertion(body: HTMLElement, block: number) {
    const indicator = body.createDiv({cls:'ow-insertion', attr:{'aria-hidden':'true'}});
    const accepts = () => this.valid && this.dragging?.revision === this.revision && this.dragging.block === block && this.activeBlock === block;
    const location = (event: DragEvent) => {
      const rect = body.getBoundingClientRect();
      return nearestInsertionGap((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
    };
    body.ondragover = event => {
      if (!accepts()) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      const gap = location(event);
      indicator.setCssProps({'--ow-drop-x':`${gap.x * 100}%`, '--ow-drop-y':`${gap.y * 100}%`});
      indicator.toggleClass('is-vertical', gap.vertical);
      indicator.addClass('is-drop-target');
    };
    body.ondragleave = event => {
      if (event.relatedTarget && body.contains(event.relatedTarget as Node)) return;
      indicator.removeClass('is-drop-target');
    };
    body.ondrop = event => {
      if (!accepts()) return;
      event.preventDefault(); event.stopPropagation();
      const gap = location(event);
      this.reorder(block, this.dragging!.position, insertionPosition(this.dragging!.position, gap.position, gap.after));
    };
  }
  private renderRoute(parent: HTMLElement, areaIndex: number) {
    const route = stepRoute(this.plan.areas[areaIndex]);
    parent.querySelectorAll<HTMLElement>('.ow-task').forEach(card => {
      const position = Number(card.dataset.position);
      card.toggleClass('is-proxy', route.proxies.includes(position));
      card.toggleClass('is-path-start', route.start === position);
      card.toggleClass('is-path-end', route.end === position);
    });
    if (!route.links.length) return;
    const svg = parent.createSvg('svg', {cls:'ow-route', attr:{viewBox:'0 0 1000 1000', 'aria-hidden':'true', focusable:'false'}});
    const defs = svg.createSvg('defs');
    for (const link of route.links) {
      const markerId = `ow-route-arrow-${++nextRouteId}`;
      const marker = defs.createSvg('marker', {cls:'ow-route-arrow', attr:{id:markerId, 'data-from':String(link.from), viewBox:'0 0 10 10', refX:'9', refY:'5', markerWidth:'20', markerHeight:'20', markerUnits:'userSpaceOnUse', orient:'auto'}});
      marker.createSvg('path', {attr:{d:'M 1 1 L 9 5 L 1 9', fill:'none', stroke:'currentColor', 'stroke-width':'1.8', 'stroke-linecap':'round', 'stroke-linejoin':'round'}});
      const cells = [link.from, ...link.via, link.to];
      const segments = cells.slice(1).map((to, i) => routePoints({from:cells[i], to, via:[]}).split(' '));
      const attributes = {'data-from':String(link.from), 'data-to':String(link.to), 'data-via':link.via.join(','), 'vector-effect':'non-scaling-stroke'};
      segments.forEach((points, i) => {
        svg.createSvg('polyline', {cls:['ow-route-link', 'ow-route-segment'], attr:{...attributes, points:points.join(' '), 'marker-end':`url(#${markerId})`}});
        if (i < segments.length - 1) {
          const cell = cells[i + 1];
          const point = cardCenter(cell);
          const center = `${point.x * 1000},${point.y * 1000}`;
          svg.createSvg('polyline', {cls:['ow-route-link', 'ow-route-proxy'], attr:{...attributes, points:`${points[1]} ${center} ${segments[i + 1][0]}`}});
        }
      });
    }
  }
  private editColor(target: ColorTarget) {
    this.cancelNavigation();
    const revision = this.revision;
    const original = storedColor(this.plan, target);
    const trigger = this.contentEl.ownerDocument.activeElement as HTMLElement | null;
    new ColorModal(this.app, original, defaultColor(this.plan, target), color => {
      if (revision !== this.revision || !this.valid) return;
      setCardColor(this.plan, target, color);
      this.updateColors();
    }, committed => {
      if (revision !== this.revision || !this.valid) return;
      if (committed) this.save();
      else {setCardColor(this.plan, target, original); this.updateColors();}
      trigger?.focus({preventScroll:true});
    }).open();
  }
  private colorTarget(card: HTMLElement): ColorTarget {
    const [kind, area, task] = card.dataset.color!.split(':');
    if (kind === 'goal') return {kind};
    if (kind === 'area') return {kind, area:Number(area)};
    return {kind:'task', area:Number(area), task:Number(task)};
  }
  private updateColors() {
    this.contentEl.querySelectorAll<HTMLElement>('.ow-card').forEach(card => {
      card.setCssProps(colorStyles(displayedCardColor(this.plan, this.colorTarget(card))));
    });
  }
  private openArchive(areaIndex?: number) {
    const revision = this.revision;
    new ArchiveModal(this.app, () => this.plan, areaIndex, () => this.valid && revision === this.revision, () => this.save(), redo => this.restoreHistory(redo)).open();
  }
  private card(parent: HTMLElement, options: {
    key: string; position: number; text: string; placeholder: string; cls: string;
    edit: () => void; activate: () => void; navigation?: boolean; color: ColorTarget;
    completion?: {done: boolean; toggle: () => void};
  }) {
    const card = parent.createDiv({cls:`ow-card ${options.cls}`});
    card.dataset.card = options.key;
    card.dataset.position = String(options.position);
    const center = cardCenter(options.position);
    card.setCssProps({'--ow-cell-x':`${(center.x - cardSize / 2) * 100}%`, '--ow-cell-y':`${(center.y - cardSize / 2) * 100}%`});
    const target = options.color;
    card.dataset.color = target.kind === 'goal' ? 'goal' : target.kind === 'area' ? `area:${target.area}` : `task:${target.area}:${target.task}`;
    const button = card.createEl('button', {cls:'ow-cell', attr:{type:'button', 'aria-label':`${options.placeholder}: ${options.text || 'empty'}`}});
    button.createSpan({cls:'ow-cell-text', text:options.text || options.placeholder});
    button.toggleClass('is-empty', !options.text);
    button.onclick = event => {
      this.cancelNavigation();
      if (options.navigation && event.detail > 0) {
        // Let a double click edit the same card before navigation moves it away.
        this.pendingNavigation = window.setTimeout(() => { this.pendingNavigation = undefined; options.activate(); }, 250);
      } else options.activate();
    };
    button.ondblclick = event => { event.preventDefault(); this.cancelNavigation(); options.edit(); };
    if (options.position !== 4) this.bindReorder(card, button, Number(parent.closest<HTMLElement>('[data-block]')!.dataset.block), options.position);
    const actions = card.createDiv({cls:'ow-card-actions'});
    this.iconButton(actions, 'palette', `Color: ${options.placeholder}`, 'ow-color-button', () => this.editColor(target));
    this.iconButton(actions, 'pencil', `Edit: ${options.placeholder}`, 'ow-edit', options.edit);
    if (target.kind === 'task') {
      const remove = (archive: boolean) => {
        if (!removeStep(this.plan.areas[target.area], target.task, archive)) return;
        delete this.selectedByArea[target.area]; this.selectedTask = null; this.save(); this.render();
      };
      const archive = this.iconButton(actions, 'archive', `Archive: ${options.placeholder}`, 'ow-archive-step', () => remove(true));
      archive.disabled = !options.text.trim() || !this.plan.areas[target.area].tasks[target.task].done;
      this.iconButton(actions, 'trash-2', `Delete: ${options.placeholder}`, 'ow-delete-step', () => remove(false));
    } else if (target.kind === 'goal') {
      this.iconButton(actions, 'archive', 'Open plan archive', 'ow-open-archive', () => this.openArchive());
    } else {
      this.iconButton(actions, 'archive', `Open archive for ${options.text || options.placeholder}`, 'ow-open-archive', () => this.openArchive(target.area));
    }
    if (options.completion) {
      const completion = options.completion;
      const check = this.iconButton(actions, 'check', `Confirmed: ${options.text || options.placeholder}`, 'ow-check', () => {
        completion.toggle(); this.save(); this.updateCompletion();
      });
      check.setAttribute('aria-pressed', String(completion.done));
      card.toggleClass('is-done', completion.done);
    }
    if (options.cls.includes('ow-task')) button.setAttribute('aria-pressed', String(Object.values(this.selectedByArea).includes(options.key)));
    card.toggleClass('is-selected', Object.values(this.selectedByArea).includes(options.key));
  }
  private updateCompletion() {
    syncCompletion(this.plan);
    this.contentEl.querySelectorAll<HTMLElement>('.ow-card').forEach(card => {
      const target = this.colorTarget(card);
      const done = target.kind === 'task' ? this.plan.areas[target.area].tasks[target.task].done : target.kind === 'area' ? areaDone(this.plan.areas[target.area]) : false;
      card.toggleClass('is-done', done);
      const check = card.querySelector<HTMLButtonElement>('.ow-check');
      check?.setAttribute('aria-pressed', String(done));
      if (check && target.kind === 'task') {
        const area = this.plan.areas[target.area];
        check.disabled = !area.tasks[target.task].text.trim() || !(done ? canUncomplete(area, target.task) : canComplete(area, target.task));
      }
      const archive = card.querySelector<HTMLButtonElement>('.ow-archive-step');
      if (archive && target.kind === 'task') archive.disabled = !done || !this.plan.areas[target.area].tasks[target.task].text.trim();
    });
    this.contentEl.querySelectorAll<SVGElement>('.ow-route-link, .ow-route-arrow').forEach(link => {
      const block = link.closest<HTMLElement>('[data-block]'); if (!block) return;
      const area = this.plan.areas[positions.indexOf(Number(block.dataset.block))];
      const task = area?.tasks[positions.indexOf(Number(link.dataset.from))];
      link.classList.toggle('is-complete', !!task?.done);
    });
    this.updateColors();
    const {total, done} = progress(this.plan);
    this.contentEl.querySelector('.ow-progress-label')?.setText(`${done} of ${total} steps confirmed`);
    const meter = this.contentEl.querySelector<HTMLProgressElement>('.ow-progress');
    if (meter) { meter.max = total || 1; meter.value = done; }
  }
  private render() {
    const root = this.contentEl; root.empty(); root.addClass('ow-view');
    const header = root.createDiv({cls:'ow-header'});
    header.createDiv({text:'suToDoku', cls:'ow-eyebrow'});
    header.createEl('h1', {text:this.plan.goal || 'Big things start with a goal'});
    header.createEl('p', {text:'One goal · 8 directions · 64 steps'});
    const toolbar = root.createDiv({cls:'ow-toolbar'});
    toolbar.createEl('button', {text:'＋ New plan'}).onclick = () => {void this.plugin.newPlan();};
    toolbar.createEl('button', {text:'Export to Markdown'}).onclick = () => {void this.export();};
    for (const redo of [false, true]) {
      const button = toolbar.createEl('button', {cls:redo ? 'ow-redo' : 'ow-undo', text:redo ? 'Redo' : 'Undo', attr:{title:redo ? 'Redo (Cmd/Ctrl+Shift+Z)' : 'Undo (Cmd/Ctrl+Z)'}});
      button.onclick = () => {
        if (this.restoreHistory(redo)) this.contentEl.querySelector<HTMLButtonElement>(redo ? '.ow-redo' : '.ow-undo')?.focus({preventScroll:true});
      };
    }
    this.updateHistoryButtons();
    const {total, done} = progress(this.plan);
    toolbar.createSpan({text:`${done} of ${total} steps confirmed`, cls:'ow-progress-label', attr:{'aria-live':'polite'}});
    const meter = root.createEl('progress', {cls:'ow-progress'}); meter.max = total || 1; meter.value = done;
    const navigation = root.createDiv({cls:'ow-navigation'});
    navigation.createSpan({cls:'ow-focus-label', attr:{role:'status', 'aria-live':'polite'}});
    navigation.createEl('button', {cls:'ow-back', text:'← Back to goal · Esc'}).onclick = () => this.activateBlock(4);
    const scroll = root.createDiv({cls:'ow-scroll'});
    const board = scroll.createDiv({cls:'ow-board'});
    const grid = board.createDiv({cls:'ow-grid'});
    for (let block = 0; block < 9; block++) {
      const areaIndex = positions.indexOf(block);
      const group = grid.createDiv({cls:`ow-block ow-slot-${block} ${block === 4 ? 'ow-center' : 'ow-area'}`});
      group.dataset.block = String(block);
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', block === 4 ? 'Goal and directions' : `Direction ${areaIndex + 1}`);
      const body = group.createDiv({cls:'ow-block-grid'});
      const preview = group.createEl('button', {cls:'ow-block-preview', attr:{type:'button', 'aria-label':block === 4 ? 'Back to goal and directions' : `Open: ${this.plan.areas[areaIndex].title || `direction ${areaIndex+1}`}`}});
      preview.onclick = () => this.activateBlock(block);
      for (let cell = 0; cell < 9; cell++) {
        if (block === 4) {
          const i = positions.indexOf(cell);
          if (cell === 4) this.card(body, {key:'goal', position:cell, color:{kind:'goal'}, text:this.plan.goal, placeholder:'My main goal', cls:'ow-goal', edit:() => this.edit('Main goal', this.plan.goal, t => setGoalText(this.plan, t)), activate:() => this.edit('Main goal', this.plan.goal, t => setGoalText(this.plan, t))});
          else this.directionCard(body, i, cell, true);
        } else {
          const area = this.plan.areas[areaIndex];
          if (cell === 4) this.directionCard(body, areaIndex, cell, false);
          else {
            const ti = positions.indexOf(cell); const task = area.tasks[ti];
            const key = `task-${areaIndex}-${ti}`;
            this.card(body, {key, position:cell, color:{kind:'task', area:areaIndex, task:ti}, text:task.text, placeholder:`Step ${ti+1}`, cls:'ow-task', edit:() => this.edit('Step toward the goal', task.text, t => setTaskText(task, t)), activate:() => this.selectTask(key), completion:{done:task.done, toggle:() => {toggleStep(area, ti);}}});
          }
        }
      }
      this.bindInsertion(body, block);
      if (block !== 4) this.renderRoute(body, areaIndex);
    }
    this.activateBlock(this.activeBlock, false);
    this.updateCompletion();
    root.createEl('p', {cls:'ow-hint', text:'Direction → open block · Block center or Esc → back to goal · Step → toggle selection · Pencil or double-click → edit · Palette → color · Drag between cards or Alt + arrow keys → insert clockwise. Confirm steps in order; undo in reverse order. Only confirmed steps can be archived.'});
  }
  private directionCard(parent: HTMLElement, index: number, position: number, home: boolean) {
    const area = this.plan.areas[index];
    this.card(parent, {
      key:`direction-${home ? 'home' : 'child'}-${index}`, position, color:{kind:'area', area:index}, text:area.title,
      placeholder:`Direction ${index+1}`, cls:'ow-direction', navigation:true,
      edit:() => this.edit(`Direction ${index+1}`, area.title, text => setAreaTitle(area, text)),
      activate:() => this.activateBlock(home ? positions[index] : 4),
    });
  }
  private async export() {
    try {
      const path = await this.plugin.availablePath(`${this.file?.parent?.path ?? ''}/${this.file?.basename ?? 'Plan'} — tasks`, 'md');
      const file = await this.app.vault.create(path, toMarkdown(this.plan));
      await this.app.workspace.getLeaf('tab').openFile(file);
      new Notice('Plan exported to Markdown');
    } catch { new Notice('Unable to export the plan'); }
  }
}
export default class MandalaPlugin extends Plugin {
  async renamePlan(file: TFile, goal: string) {
    const title = planBasename(goal);
    // A collision suffix is already a valid name for this goal.
    if (file.basename === title || (file.basename.startsWith(`${title} `) && /^\d+$/.test(file.basename.slice(title.length + 1)))) return;
    const path = await this.availablePath(`${file.parent?.path ?? ''}/${title}`, file.extension);
    await this.app.fileManager.renameFile(file, path);
  }
  async onload() {
    addIcon(ICON, Array.from({length:9}, (_, i) => `<rect x="${7 + i % 3 * 31}" y="${7 + Math.floor(i / 3) * 31}" width="24" height="24" rx="3" fill="currentColor"/>`).join(''));
    this.registerView(VIEW, leaf => new MandalaView(leaf, this));
    this.registerExtensions(['mandala'], VIEW);
    const ribbon = this.addRibbonIcon(ICON, 'New suToDoku plan', () => {void this.newPlan();});
    ribbon.addClass('ow-ribbon-icon');
    this.app.workspace.onLayoutReady(() => {
      if (!ribbon.isConnected) return;
      const bottom = ribbon.ownerDocument.querySelector('.workspace-ribbon.mod-left .side-dock-settings');
      bottom?.prepend(ribbon);
    });
    this.addCommand({id:'create-plan', name:'Create plan', callback:() => {void this.newPlan();}});
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFile && file.extension === 'mandala') menu.addItem(item => item.setTitle('Open suToDoku plan').setIcon(ICON).onClick(() => {void this.app.workspace.getLeaf('tab').openFile(file);}));
    }));
  }
  async availablePath(base: string, ext: string) {
    const clean = normalizePath(base.replace(/^\/+/, ''));
    let path = `${clean}.${ext}`; let i = 2;
    while (await this.app.vault.adapter.exists(path)) path = `${clean} ${i++}.${ext}`;
    return path;
  }
  async newPlan() {
    try {
      const file = await this.app.vault.create(await this.availablePath('suToDoku', 'mandala'), JSON.stringify(createPlan(), null, 2));
      await this.app.workspace.getLeaf('tab').openFile(file);
    } catch {new Notice('Unable to create a plan');}
  }
}
