import type { EntityId, PropertyValue, SnapshotId } from "./types.js";
import { generateId } from "../utils/id.js";

export interface StateEvent {
  id: string;
  timestamp: number;
  entityId: EntityId;
  property: string;
  oldValue: PropertyValue;
  newValue: PropertyValue;
  cause: "direct" | "cascade" | "prediction" | "user_input";
  sourceEventId?: string;
  branchId: SnapshotId;
}

export class EventLog {
  private events: StateEvent[] = [];

  append(event: Omit<StateEvent, "id" | "timestamp">): StateEvent {
    const full: StateEvent = {
      ...event,
      id: generateId(),
      timestamp: Date.now(),
    };
    this.events.push(full);
    return full;
  }

  getAll(): readonly StateEvent[] {
    return this.events;
  }

  getEventsAfter(timestamp: number): StateEvent[] {
    return this.events.filter(e => e.timestamp > timestamp);
  }

  getEventsForEntity(entityId: EntityId): StateEvent[] {
    return this.events.filter(e => e.entityId === entityId);
  }

  getEventsForBranch(branchId: SnapshotId): StateEvent[] {
    return this.events.filter(e => e.branchId === branchId);
  }

  get length(): number {
    return this.events.length;
  }

  toJSON(): StateEvent[] {
    return [...this.events];
  }

  static fromJSON(events: StateEvent[]): EventLog {
    const log = new EventLog();
    log.events = [...events];
    return log;
  }
}
