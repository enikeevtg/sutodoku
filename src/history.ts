import type {Plan} from './model';

/** Independent snapshots keep deleted cards, archives and timestamps intact. */
export class PlanHistory {
  private states: string[] = [];
  private cursor = -1;
  constructor(private limit = 100) {}
  get canUndo() {return this.cursor > 0;}
  get canRedo() {return this.cursor >= 0 && this.cursor < this.states.length - 1;}
  clear() {this.states = []; this.cursor = -1;}
  reset(plan: Plan) {this.states = [JSON.stringify(plan)]; this.cursor = 0;}
  record(plan: Plan) {
    const state = JSON.stringify(plan);
    if (this.states[this.cursor] === state) return;
    this.states = this.states.slice(0, this.cursor + 1);
    this.states.push(state);
    if (this.states.length > this.limit + 1) this.states.shift();
    this.cursor = this.states.length - 1;
  }
  undo(): Plan | null {
    return this.canUndo ? JSON.parse(this.states[--this.cursor]) as Plan : null;
  }
  redo(): Plan | null {
    return this.canRedo ? JSON.parse(this.states[++this.cursor]) as Plan : null;
  }
}
