import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { MAX_TEXT, normalise, type FeedbackExample, type FeedbackIndex, type FeedbackLabel } from './shared.ts';

type Entry = FeedbackExample & { id: string; updatedAt: number };
export const feedbackId = (text: string) => createHash('sha256').update(normalise(text)).digest('hex');
export class FeedbackStore {
  entries: Entry[] = [];
  revision = 0;
  file?: string;
  constructor(file?: string) {
    this.file = file;
    if (!file) return;
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      if (data.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Array.isArray(data.entries) || data.entries.length > 200) throw new Error('Invalid feedback file');
      for (const entry of data.entries) {
        if (typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > MAX_TEXT || !['potential-ai','keep'].includes(entry.label) || entry.id !== feedbackId(entry.text) || !Number.isFinite(entry.updatedAt)) throw new Error('Invalid feedback file');
      }
      if (new Set(data.entries.map((e: Entry) => e.id)).size !== data.entries.length) throw new Error('Invalid feedback file');
      this.entries = data.entries; this.revision = data.revision;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Saved feedback could not be read. Preserve the file and repair it before saving new feedback.');
    }
  }
  lookup(text: string): FeedbackLabel | undefined { return this.entries.find(entry => entry.id === feedbackId(text))?.label; }
  index(): FeedbackIndex {
    return { revision: this.revision, potentialAI: this.entries.filter(e => e.label === 'potential-ai').length, kept: this.entries.filter(e => e.label === 'keep').length, decisions: Object.fromEntries(this.entries.map(e => [e.id, e.label])) };
  }
  examples(): FeedbackExample[] {
    // Balanced, bounded context. Exact decisions are retained for 200 texts;
    // up to three recent examples per label inform new, unseen replies.
    return (['potential-ai', 'keep'] as const).flatMap(label => this.entries.filter(e => e.label === label).slice(-3).map(e => ({ label: e.label, text: e.text.slice(0, 600) })));
  }
  save(text: string, label: FeedbackLabel): FeedbackIndex {
    text = normalise(text);
    if (!text || text.length > MAX_TEXT || !['potential-ai','keep'].includes(label)) throw new Error('Invalid feedback');
    const id = feedbackId(text);
    const next = [...this.entries.filter(e => e.id !== id), { id, text, label, updatedAt: Date.now() }].slice(-200);
    this.persist(next); return this.index();
  }
  clear(): FeedbackIndex { this.persist([]); return this.index(); }
  private persist(entries: Entry[]) {
    const revision = this.revision + 1;
    if (this.file) {
      mkdirSync(dirname(this.file), { recursive: true });
      const temporary = this.file + '.' + randomUUID() + '.tmp';
      try {
        writeFileSync(temporary, JSON.stringify({ version: 1, revision, entries }), { mode: 0o600 });
        renameSync(temporary, this.file);
      } catch (error) { try { unlinkSync(temporary); } catch {} throw error; }
    }
    this.entries = entries; this.revision = revision;
  }
}
