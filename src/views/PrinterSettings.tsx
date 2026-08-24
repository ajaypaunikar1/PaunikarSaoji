'use client';
import React, { useState } from 'react';
import { usePrinter } from '../context/PrinterContext';
import { useApp } from '../context/AppContext';
import {
  Printer, Plug, Unplug, FlaskConical, Activity,
  Plus, Trash2, RefreshCw, XCircle, Stethoscope, ArrowLeftRight
} from 'lucide-react';
import { toast } from 'sonner';
import type { PrinterConfig, PrinterRole } from '../services/printer/printerConfig';

const ROLES: PrinterRole[] = ['KITCHEN', 'BILLING', 'PARCEL', 'BAR'];

const STATE_PILL: Record<string, { label: string; cls: string }> = {
  connected: { label: 'Connected', cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  disconnected: { label: 'Disconnected', cls: 'bg-slate-50 border-slate-200 text-slate-600' },
  pairing: { label: 'Pairing...', cls: 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse' },
  reconnecting: { label: 'Reconnecting', cls: 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse' },
  error: { label: 'Connection Error', cls: 'bg-rose-50 border-rose-200 text-rose-700' }
};

const JOB_BADGE: Record<string, string> = {
  QUEUED: 'bg-slate-100 text-slate-600 border-slate-200',
  PRINTING: 'bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse',
  PRINTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  FAILED: 'bg-rose-50 text-rose-700 border-rose-200',
  RETRYING: 'bg-amber-50 text-amber-700 border-amber-200',
  CANCELLED: 'bg-slate-100 text-slate-400 border-slate-200'
};

function DiagRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`text-[11px] font-bold font-mono ${ok === true ? 'text-emerald-600' : ok === false ? 'text-rose-600' : 'text-slate-700'}`}>
        {value}
      </span>
    </div>
  );
}

interface Diag {
  browserName?: string;
  platform?: string;
  https?: boolean;
  webBluetooth?: boolean;
  warnings?: string[];
}

const PrinterSettingsPage: React.FC = () => {
  const {
    supported, connected, printing, error, printers,
    connectPrinter, disconnectPrinter, testPrintOn,
    retryJob, cancelJob, clearFinishedJobs, getDiagnostics,
    savePrinterConfig, removePrinterConfig, swapPrinters
  } = usePrinter();  const { settings } = useApp();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [diag, setDiag] = useState<Diag | null>(() => getDiagnostics() as Diag);

  const refreshDiag = () => setDiag(getDiagnostics() as Diag);

  const allJobs = printers.flatMap(p => p.jobs.map(j => ({ ...j, printerId: p.id })));
  const failedJobs = allJobs.filter(j => j.status === 'FAILED');

  const deviceOwners = new Map<string, string[]>();
  printers.forEach(p => {
    if (!p.config.deviceId) return;
    const owners = deviceOwners.get(p.config.deviceId) ?? [];
    owners.push(p.id);
    deviceOwners.set(p.config.deviceId, owners);
  });
  const duplicatedIds = new Set(
    [...deviceOwners.entries()].filter(([, ids]) => ids.length > 1).map(([deviceId]) => deviceId)
  );

  const handleConnect = async (id: string) => {
    setBusyId(id);
    await connectPrinter(id);
    refreshDiag();
    setBusyId(null);
  };

  const handleRePair = async (id: string) => {
    setBusyId(id);
    await disconnectPrinter(id, true);
    await connectPrinter(id);
    refreshDiag();
    setBusyId(null);
  };

  const handleTest = async (id: string) => {
    setBusyId(id);
    await testPrintOn(id, settings);
    setBusyId(null);
  };

  const handleSwap = async () => {
    const [a, b] = printers;
    if (!a || !b) return;
    setSwapping(true);
    await swapPrinters(a.id, b.id);
    setSwapping(false);
  };

  const updateConfig = (id: string, patch: Partial<PrinterConfig>) => {
    const status = printers.find(p => p.id === id);
    if (!status) return;
    savePrinterConfig({ ...status.config, ...patch });
  };

  const addPrinter = () => {
    const id = `printer-${Date.now().toString(36)}`;
    savePrinterConfig({
      id,
      name: 'KP-307',
      role: 'BILLING',
      connectionType: 'BLE',
      paperWidth: 80,
      enabled: true,
      encodingMode: 'auto-raster',
      cutMode: 'FULL'
    });
    toast.success('Printer added - connect it below.');
  };

  const handleRemove = (id: string) => {
    if (printers.length <= 1) {
      toast.error('At least one printer must stay configured.');
      return;
    }
    removePrinterConfig(id);
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 m-0">
            <Printer size={20} /> Printer Settings
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            KP-307 thermal printers over Bluetooth LE (Web Bluetooth). Each printer connects independently.
          </p>
        </div>
      </div>

      {!supported && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[10px] text-amber-800 font-semibold space-y-1">
          <p>This browser cannot reach Bluetooth printers.</p>
          <p>Open the POS in Chrome or Edge on a secure (https) page. Web Bluetooth requires a Chromium browser with Bluetooth permission.</p>
        </div>
      )}

      {error && (
        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[10px] text-rose-700 font-semibold">
          {error}
        </div>
      )}

      {duplicatedIds.size > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[10px] text-amber-800 font-semibold space-y-1">
          <p>Two printer slots are bound to the SAME physical KP-307.</p>
          <p>On one of the cards below tap Disconnect, then Re-pair, and pick the OTHER unit in the browser list (both units can share an identical name).</p>
        </div>
      )}

      {printers.filter(p => p.state === 'connected').length < 2 && (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[10px] text-slate-600 font-semibold space-y-1">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">How to connect your 2nd printer</p>
          <p>1. Power on BOTH KP-307 units with paper loaded, keep them within 2 m of this device.</p>
          <p>2. Tap Connect on the second card below - Chrome shows a device list.</p>
          <p>3. Pick the entry you have NOT used yet (names may look identical - each unit is a separate row). Tip: power ONE unit off if unsure - the entry that disappears is that unit.</p>
          <p>4. Only ONE entry in the list? Hold the printer's FEED button ~5 s to restart it, and make sure no phone is paired to it - then tap Connect again.</p>
          <p>5. After both are connected, tap Test Print on each card - the paper names its ROLE, so you instantly see which unit is which.</p>
        </div>
      )}

      {printers.length >= 2 && printers.some(p => p.config.deviceId) && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50/60 border border-indigo-200 gap-3">
          <p className="text-[10px] text-indigo-900 font-semibold m-0">
            Printed a test and the papers came from the WRONG units (e.g. "KITCHEN" on the counter printer)? Swap the bindings here - no re-pairing needed.
          </p>
          <button
            type="button"
            onClick={handleSwap}
            disabled={swapping}
            className="shrink-0 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-[10px] uppercase tracking-wider cursor-pointer transition flex items-center gap-1.5"
          >
            <ArrowLeftRight size={13} /> {swapping ? 'Swapping...' : 'Swap Devices'}
          </button>
        </div>
      )}

      {/* One card per configured printer */}
      {printers.map(p => {
        const pill = STATE_PILL[p.state] || STATE_PILL.disconnected;
        const busy = busyId === p.id;
        return (
          <div key={p.id} className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center gap-2">
              <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-600 m-0 flex items-center gap-1.5 truncate">
                {p.name}
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 normal-case">
                  {p.role}
                </span>
              </h3>
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border shrink-0 ${pill.cls}`}>
                {pill.label}
              </span>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-[11px] font-bold text-slate-700">
                  Device: {p.deviceName || <span className="text-slate-400">Not paired</span>}
                  <span className="ml-2 text-[10px] font-mono text-slate-400">{p.connection}</span>
                  {p.config.deviceId && (
                    <span className={`ml-2 text-[9px] font-mono ${duplicatedIds.has(p.config.deviceId) ? 'text-rose-600' : 'text-slate-400'}`}>
                      #{p.config.deviceId.slice(0, 8)}
                    </span>
                  )}
                </div>
                <label className="flex items-center gap-1 text-[9px] font-bold uppercase text-slate-500">
                  Enabled
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={e => updateConfig(p.id, { enabled: e.target.checked })}
                    className="accent-emerald-600"
                  />
                </label>
              </div>

              {p.lastError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[10px] text-rose-700 font-semibold">
                  {p.lastError}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => handleConnect(p.id)}
                  disabled={!supported || busy || p.state === 'connected'}
                  className="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-xs uppercase tracking-wider cursor-pointer transition flex items-center justify-center gap-1.5"
                >
                  <Plug size={14} /> {busy && p.state !== 'connected' ? 'Connecting...' : p.state === 'connected' ? 'Connected' : 'Connect'}
                </button>
                <button
                  type="button"
                  onClick={() => handleTest(p.id)}
                  disabled={busy || !supported || p.state !== 'connected'}
                  className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs uppercase tracking-wider cursor-pointer transition flex items-center justify-center gap-1.5"
                >
                  <FlaskConical size={14} /> Test Print
                </button>
                <button
                  type="button"
                  onClick={() => disconnectPrinter(p.id)}
                  disabled={p.state !== 'connected'}
                  className="py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-bold text-xs uppercase tracking-wider cursor-pointer transition flex items-center justify-center gap-1.5"
                >
                  <Unplug size={14} /> Disconnect
                </button>
                <button
                  type="button"
                  onClick={() => handleRePair(p.id)}
                  disabled={!supported || busy}
                  className="py-2.5 rounded-xl border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 text-indigo-700 font-bold text-xs uppercase tracking-wider cursor-pointer transition flex items-center justify-center gap-1.5"
                >
                  <RefreshCw size={14} /> Re-pair
                </button>
              </div>

              {/* Configuration */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
                <label className="space-y-0.5">
                  <span className="text-[8px] font-black uppercase text-slate-400 block">Name</span>
                  <input
                    type="text"
                    value={p.name}
                    onChange={e => updateConfig(p.id, { name: e.target.value })}
                    className="w-full text-[11px] font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="text-[8px] font-black uppercase text-slate-400 block">Role</span>
                  <select
                    value={p.role}
                    onChange={e => updateConfig(p.id, { role: e.target.value as PrinterRole })}
                    className="w-full text-[11px] font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[8px] font-black uppercase text-slate-400 block">Paper</span>
                  <select
                    value={p.config.paperWidth}
                    onChange={e => updateConfig(p.id, { paperWidth: Number(e.target.value) as 58 | 80 })}
                    className="w-full text-[11px] font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none"
                  >
                    <option value={80}>80 mm</option>
                    <option value={58}>58 mm</option>
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[8px] font-black uppercase text-slate-400 block">Cut Mode</span>
                  <select
                    value={p.config.cutMode || 'FULL'}
                    onChange={e => updateConfig(p.id, { cutMode: e.target.value as 'FULL' | 'PARTIAL' })}
                    className="w-full text-[11px] font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none"
                  >
                    <option value="FULL">Full cut</option>
                    <option value="PARTIAL">Partial cut</option>
                  </select>
                </label>
              </div>

              <details className="text-[10px] text-slate-500">
                <summary className="cursor-pointer font-bold uppercase tracking-wider text-[9px] text-slate-400 select-none">
                  Advanced / Encoding
                </summary>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2">
                  <label className="space-y-0.5">
                    <span className="text-[8px] font-black uppercase text-slate-400 block">Marathi Encoding</span>
                    <select
                      value={p.config.encodingMode || 'auto-raster'}
                      onChange={e => updateConfig(p.id, { encodingMode: e.target.value as PrinterConfig['encodingMode'] })}
                      className="w-full text-[11px] font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none"
                    >
                      <option value="auto-raster">Auto (raster Marathi)</option>
                      <option value="utf8-codepage">UTF-8 + code page</option>
                      <option value="ascii-fold">ASCII only (fold)</option>
                    </select>
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[8px] font-black uppercase text-slate-400 block">Code Page (ESC t n)</span>
                    <input
                      type="number"
                      min={0}
                      max={255}
                      value={p.config.codePage ?? ''}
                      onChange={e => updateConfig(p.id, { codePage: e.target.value === '' ? undefined : Number(e.target.value) })}
                      placeholder="Model specific"
                      className="w-full text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[8px] font-black uppercase text-slate-400 block">BLE Service UUID</span>
                    <input
                      type="text"
                      value={p.config.bleServiceUuid || ''}
                      onChange={e => updateConfig(p.id, { bleServiceUuid: e.target.value.trim() || undefined })}
                      placeholder="Optional"
                      className="w-full text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                    />
                  </label>
                </div>
              </details>

              <button
                type="button"
                onClick={() => handleRemove(p.id)}
                className="flex items-center gap-1 text-[10px] font-bold uppercase text-rose-500 hover:text-rose-700 cursor-pointer"
              >
                <Trash2 size={12} /> Remove this printer
              </button>
            </div>
          </div>
        );
      })}

      {/* Add printer */}
      <button
        type="button"
        onClick={addPrinter}
        className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-400 text-slate-500 hover:text-indigo-600 font-bold text-xs uppercase tracking-wider cursor-pointer transition flex items-center justify-center gap-1.5"
      >
        <Plus size={14} /> Add Another Printer
      </button>

      {/* Print queue - aggregated across all printers */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-600 m-0 flex items-center gap-1.5">
            <Activity size={13} /> Print Queue
          </h3>
          <div className="flex items-center gap-3">
            {failedJobs.length > 0 && (
              <button
                type="button"
                onClick={() => failedJobs.forEach(j => retryJob(j.printerId, j.id))}
                className="flex items-center gap-1 text-[10px] font-bold uppercase text-amber-600 hover:text-amber-800 cursor-pointer"
              >
                <RefreshCw size={11} /> Retry All Failed
              </button>
            )}
            <button
              type="button"
              onClick={clearFinishedJobs}
              disabled={printing}
              className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500 hover:text-slate-700 disabled:opacity-40 cursor-pointer"
            >
              <XCircle size={11} /> Clear Done
            </button>
          </div>
        </div>
        {allJobs.length === 0 ? (
          <div className="p-6 text-center text-[11px] text-slate-400">No print jobs yet.</div>
        ) : (
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
            {allJobs.map(job => (
              <div key={`${job.printerId}-${job.id}`} className="px-4 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[11px] font-bold text-slate-700">{job.label}</span>
                  <span className="ml-2 text-[9px] font-bold uppercase text-slate-400">{job.kind} &middot; {job.role}</span>
                  {job.lastError && job.status === 'FAILED' && (
                    <p className="text-[9px] text-rose-500 m-0 truncate max-w-md">{job.lastError}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[9px] font-mono text-slate-400">#{job.attempts}/{job.maxAttempts}</span>
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${JOB_BADGE[job.status]}`}>
                    {job.status}
                  </span>
                  {job.status === 'FAILED' && (
                    <button
                      type="button"
                      onClick={() => retryJob(job.printerId, job.id)}
                      className="p-1 rounded text-amber-600 hover:bg-amber-50 cursor-pointer"
                      title="Retry"
                    >
                      <RefreshCw size={12} />
                    </button>
                  )}
                  {(job.status === 'QUEUED' || job.status === 'RETRYING') && (
                    <button
                      type="button"
                      onClick={() => cancelJob(job.printerId, job.id)}
                      className="p-1 rounded text-slate-400 hover:bg-slate-100 cursor-pointer"
                      title="Cancel"
                    >
                      <XCircle size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Diagnostics */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-600 m-0 flex items-center gap-1.5">
            <Stethoscope size={13} /> Device Diagnostics
          </h3>
          <button
            type="button"
            onClick={refreshDiag}
            className="flex items-center gap-1 text-[10px] font-bold uppercase text-indigo-600 hover:text-indigo-800 cursor-pointer"
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
        {diag && (
          <div className="px-4 py-2">
            <DiagRow label="Browser" value={diag.browserName || 'Unknown'} />
            <DiagRow label="Platform" value={diag.platform || 'Unknown'} />
            <DiagRow label="HTTPS" value={diag.https ? 'YES' : 'NO'} ok={diag.https} />
            <DiagRow label="Web Bluetooth" value={diag.webBluetooth ? 'YES' : 'NO'} ok={diag.webBluetooth} />
            <DiagRow label="Any printer connected" value={connected ? 'YES' : 'NO'} ok={connected} />
            {diag.warnings && diag.warnings.length > 0 && (
              <div className="py-2 space-y-1">
                {diag.warnings.map((w: string, i: number) => (
                  <p key={i} className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 m-0 font-semibold">
                    {w}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PrinterSettingsPage;
