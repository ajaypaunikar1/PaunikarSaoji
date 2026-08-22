/**
 * Frontend print queue. All KOT / bill / test jobs flow through here so
 * multiple simultaneous print requests never race on the same serial port.
 *
 * Lifecycle:
 *   QUEUED -> PRINTING -> PRINTED
 *                 |-> RETRYING (short delay, then longer) -> PRINTING ...
 *                 |-> FAILED (after max attempts)
 */

export type PrintJobStatus = 'QUEUED' | 'PRINTING' | 'PRINTED' | 'FAILED' | 'RETRYING';

export type PrintJobKind = 'KOT' | 'BILL' | 'TEST';

export interface PrintJob {
  id: string;
  kind: PrintJobKind;
  role: string;
  label: string;
  status: PrintJobStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
}

type Listener = (jobs: PrintJob[]) => void;

interface QueueEntry extends PrintJob {
  data: Uint8Array;
  seq: number;
  resolve: (printed: boolean) => void;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1500, 4000, 8000];
let seqCounter = 0;

class PrintQueue {
  private entries: QueueEntry[] = [];
  private listeners = new Set<Listener>();
  private processing = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): PrintJob[] {
    return this.entries.map(({ data: _data, resolve: _resolve, ...job }) => job);
  }

  counts(): Record<PrintJobStatus, number> {
    const counts: Record<PrintJobStatus, number> = {
      QUEUED: 0, PRINTING: 0, PRINTED: 0, FAILED: 0, RETRYING: 0
    };
    for (const e of this.entries) counts[e.status] += 1;
    return counts;
  }

  isBusy(): boolean {
    return this.entries.some(e => e.status === 'PRINTING' || e.status === 'RETRYING');
  }

  /** Enqueue raw ESC/POS bytes. Resolves true when printed, false when failed. */
  enqueue(opts: {
    kind: PrintJobKind;
    role: string;
    label: string;
    data: Uint8Array;
    maxAttempts?: number;
  }): Promise<boolean> {
    return new Promise(resolve => {
      const entry: QueueEntry = {
        id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: opts.kind,
        role: opts.role,
        label: opts.label,
        status: 'QUEUED',
        attempts: 0,
        maxAttempts: opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: opts.data,
        seq: ++seqCounter,
        resolve
      };
      // Newest at the front for UI; processing picks from the tail (FIFO).
      this.entries.unshift(entry);
      this.emit();
      void this.process();
    });
  }

  retry(jobId: string): void {
    const entry = this.entries.find(e => e.id === jobId);
    if (!entry || entry.status !== 'FAILED') return;
    entry.status = 'QUEUED';
    entry.attempts = 0;
    entry.updatedAt = Date.now();
    this.emit();
    void this.process();
  }

  clearFinished(): void {
    this.entries = this.entries.filter(
      e => e.status === 'QUEUED' || e.status === 'PRINTING' || e.status === 'RETRYING'
    );
    this.emit();
  }

  private emit(): void {
    const snap = this.snapshot();
    this.listeners.forEach(l => l(snap));
  }

  private touch(entry: QueueEntry, status: PrintJobStatus, error?: string): void {
    entry.status = status;
    entry.updatedAt = Date.now();
    if (error !== undefined) entry.lastError = error;
    this.emit();
  }

  /** Sequential processor - strictly one job writes to the port at a time. */
  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      for (;;) {
        const next = [...this.entries]
          .filter(e => e.status === 'QUEUED')
          .sort((a, b) => a.seq - b.seq)[0];
        if (!next) break;
        await this.run(next);
      }
    } finally {
      this.processing = false;
    }
  }

  private async run(entry: QueueEntry): Promise<void> {
    while (entry.attempts < entry.maxAttempts) {
      entry.attempts += 1;
      this.touch(entry, 'PRINTING');
      try {
        await this.writer(entry.data);
        this.touch(entry, 'PRINTED');
        entry.resolve(true);
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        entry.lastError = message;
        if (entry.attempts >= entry.maxAttempts) break;
        this.touch(entry, 'RETRYING', message);
        await this.delay(RETRY_DELAYS_MS[Math.min(entry.attempts - 1, RETRY_DELAYS_MS.length - 1)]);
      }
    }
    this.touch(entry, 'FAILED', entry.lastError);
    entry.resolve(false);
  }

  /** Injected by PrinterManager so the queue stays transport-agnostic. */
  private writerImpl: ((data: Uint8Array) => Promise<void>) | null = null;
  setWriter(fn: (data: Uint8Array) => Promise<void>): void {
    this.writerImpl = fn;
  }
  private async writer(data: Uint8Array): Promise<void> {
    if (!this.writerImpl) throw new Error('Printer is not connected.');
    return this.writerImpl(data);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}

export const printQueue = new PrintQueue();
