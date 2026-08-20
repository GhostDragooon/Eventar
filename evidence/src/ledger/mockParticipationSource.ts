import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  EventRecord,
  LedgerEntry,
  ParticipationSource,
} from '../types.js';

type MockFile = {
  events: EventRecord[];
  entries: LedgerEntry[];
};

const here = dirname(fileURLToPath(import.meta.url));
const defaultPath = join(here, '../../fixtures/mock-data.json');

export class MockParticipationSource implements ParticipationSource {
  private data: MockFile | null = null;

  constructor(private readonly path: string = defaultPath) {}

  private async load(): Promise<MockFile> {
    if (this.data) return this.data;
    const raw = await readFile(this.path, 'utf8');
    this.data = JSON.parse(raw) as MockFile;
    return this.data;
  }

  async getEvent(eventId: string): Promise<EventRecord | null> {
    const data = await this.load();
    return data.events.find((e) => e.event_id === eventId) ?? null;
  }

  async listEntries(eventId: string): Promise<LedgerEntry[]> {
    const data = await this.load();
    return data.entries.filter((e) => e.event_id === eventId);
  }
}
