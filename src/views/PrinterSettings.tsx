'use client';
import React, { useEffect, useState } from 'react';
import { usePrinter } from '../context/PrinterContext';
import { useApp } from '../context/AppContext';
import {
  Printer, Plug, Unplug, FlaskConical, Activity,
  Plus, Trash2, RefreshCw, XCircle, Stethoscope
} from 'lucide-react';
import { toast } from 'sonner';
import type { PrinterConfig, PrinterRole, ConnectionType } from '../services/printer/printerConfig';
import type { PrinterDiagnostics } from '../services/printer/PrinterManager';

const ROLES: PrinterRole[] = ['KITCHEN', 'BILLING', 'PARCEL', 'BAR'];

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  connected: { label: 'Connected', cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  disconnected: { label: 'Disconnected', cls: 'bg-slate-50 border-slate-200 text-slate-600' },
  connecting: { label: 'Connecting', cls: 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse' },
  reconnecting: { label: 'Reconnecting', cls: 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse' },
  unsupported: { label: 'Unsupported', cls: 'bg-rose-50 border-rose-200 text-rose-700' },
  'permission-required': { label: 'Permission Required', cls: 'bg-amber-50 border-amber-200 text-amber-800' },
  error: { label: 'Connection Error', cls: 'bg-rose-50 border-rose-200 text-rose-700' }
};

const JOB_BADGE: Record<string, string> = {
  QUEUED: 'bg-slate-100 text-slate-600 border-slate-200',
  PRINTING: 'bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse',
  PRINTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  FAILED: 'bg-rose-50 text-rose-700 border-rose-200',
  RETRYING: 'bg-amber-50 text-amber-700 border-amber-200'
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

const PrinterSettingsPage: React.FC = () => {
  const {
    supported, status, connected, connecting, connectionType, connectionDetail,
    printing, error, queue,
    printers, activePrinterId, activePrinter, connect, disconnect, testPrint,
    savePrinterConfig, removePrinterConfig, setActivePrinter,
    retryJob, clearFinishedJobs, getDiagnostics
  } = usePrinter();
  const { settings } = useApp();

  const [connectLoading, setConnectLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [diag, setDiag] = useState<PrinterDiagnostics | null>(null);

  useEffect(() => {
    getDiagnostics().then(setDiag).catch(() => setDiag(null));
  }, [getDiagnostics, status]);

  const pill = STATUS_PILL[status] || STATUS_PILL.disconnected;
  const printFailed = queue.counts.FAILED > 0;

  const handleConnect = async () => {
    setConnectLoading(true);
    await connect(activePrinterId);
    setConnectLoading(false);
  };

  const handleTest = async () => {
    setTestLoading(true);
    await testPrint(settings);
    setTestLoading(false);
  };

  const updateConfig = (id: string, patch: Partial<PrinterConfig>) => {
    const current = printers.find(p => p.id === id);
    if (!current) return;
    savePrinterConfig({ ...current, ...patch });
  };

  const addPrinter = () => {
    const id = `printer-${Date.now().toString(36)}`;
    savePrinterConfig({
      id,
      name: 'KP-307',
      role: 'BILLING',
      connectionType: 'BLUETOOTH',
      paperWidth: 80,
      enabled: true,
      baudRate: 9600,
      encodingMode: 'auto-raster'
    });
    setActivePrinter(id);
    toast.success('Printer added - configure and connect it below.');
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 m-0">
            <Printer size={20} /> Printer Settings
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">KP-307 thermal printer over Bluetooth (Web Serial first, BLE fallback).</p>
        </div>
      </div>

      {/* Connection card */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className={`text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${pill.cls}`}>
              {pill.label}
            </span>
            {printFailed && (
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border bg-rose-50 border-rose-200 text-rose-700">
                Print Failed ({queue.counts.FAILED})
              </span>
            )}
          </div>
          <Printer size={16} className={connected ? 'text-emerald-600' : 'text-slate-400'} />
        </div>

        {activePrinter && (
          <div className="text-[11px] font-bold text-slate-700">
            {activePrinter.name}
            <span className="ml-2 text-[10px] font-mono text-slate-400">{activePrinter.connectionType === 'BLE' ? 'Bluetooth LE' : 'Bluetooth'} &middot; {activePrinter.paperWidth}mm</span>
          </div>
        )}
        {connectionDetail && connectionDetail !== 'Not connected' && (
          <div className="text-[10px] font-semibold text-slate-500">
            Connection: <span className="font-bold text-slate-700">{connectionType || '—'}</span>
            <span className="ml-1.5 font-mono">({connectionDetail})</span>
          </div>
        )}

        {error && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[10px] text-rose-700 font-semibold">
            {error}
          </div>
        )}

        {!supported ? (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[10px] text-amber-800 font-semibold space-y-1">
            <p>This browser cannot reach a Bluetooth serial printer.</p>
            <p>Open the POS in Chrome on this device. If Chrome still cannot see the KP-307, this Android/browser combination does not expose Bluetooth serial printers to web apps - pair the printer to another POS device instead.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {!connected ? (
              <button
                type="button"
                onClick={handleConnect}
                disabled={connectLoading}
                className="col-span-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider cursor-pointer transition flex items-center justify-center gap-1.5"
              >
                <Plug size={14} /> {connectLoading || connecting ? 'Connecting...' : 'Connect'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testLoading || printing}
                  className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider cursor-pointer transition flex items-center justify-center gap-1.5"
                >
                  <FlaskConical size={14} /> {(testLoading || printing) ? 'Printing...' : 'Test Print'}
                </button>
                <button
                  type="button"
                  onClick={() => disconnect()}
                  className="py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs uppercase tracking-wider cursor-pointer transition flex items-center justify-center gap-1.5 col-span-2"
                >
                  <Unplug size={14} /> Disconnect
                </button>
              </>
            )}
          </div>
        )}

        {status === 'permission-required' && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[10px] text-amber-800 font-semibold space-y-1">
            <p className="m-0">Could not connect to the KP-307.</p>
            <p className="m-0">Make sure:</p>
            <ol className="list-decimal ml-4 space-y-0.5 m-0">
              <li>Bluetooth is ON.</li>
              <li>KP-307 is powered ON.</li>
              <li>The printer is paired with this device.</li>
              <li>Chrome has permission to access the printer.</li>
            </ol>
          </div>
        )}
      </div>

      {/* Printer configurations */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-600 m-0">Printers</h3>
          <button
            type="button"
            onClick={addPrinter}
            className="flex items-center gap-1 text-[10px] font-bold uppercase text-indigo-600 hover:text-indigo-800 cursor-pointer"
          >
            <Plus size={12} /> Add Printer
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {printers.map(p => (
            <div key={p.id} className={`p-4 space-y-3 ${p.id === activePrinterId ? 'bg-indigo-50/30' : ''}`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="active-printer"
                    checked={p.id === activePrinterId}
                    onChange={() => setActivePrinter(p.id)}
                    className="accent-indigo-600"
                  />
                  <input
                    type="text"
                    value={p.name}
                    onChange={e => updateConfig(p.id, { name: e.target.value })}
                    className="text-xs font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none w-40"
                  />
                </label>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[9px] font-bold uppercase text-slate-500">
                    Enabled
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={e => updateConfig(p.id, { enabled: e.target.checked })}
                      className="accent-emerald-600"
                    />
                  </label>
                  {printers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePrinterConfig(p.id)}
                      className="p-1 rounded text-rose-500 hover:bg-rose-50 cursor-pointer"
                      title="Remove printer"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
                  <span className="text-[8px] font-black uppercase text-slate-400 block">Connection</span>
                  <select
                    value={p.connectionType}
                    onChange={e => updateConfig(p.id, { connectionType: e.target.value as ConnectionType })}
                    className="w-full text-[11px] font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none"
                  >
                    <option value="BLUETOOTH">Bluetooth (Serial/SPP)</option>
                    <option value="BLE">Bluetooth LE (GATT)</option>
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[8px] font-black uppercase text-slate-400 block">Paper</span>
                  <select
                    value={p.paperWidth}
                    onChange={e => updateConfig(p.id, { paperWidth: Number(e.target.value) as 58 | 80 })}
                    className="w-full text-[11px] font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none"
                  >
                    <option value={80}>80 mm</option>
                    <option value={58}>58 mm</option>
                  </select>
                </label>
                {p.connectionType === 'BLUETOOTH' ? (
                  <label className="space-y-0.5">
                    <span className="text-[8px] font-black uppercase text-slate-400 block">Baud Rate</span>
                    <select
                      value={p.baudRate || 9600}
                      onChange={e => updateConfig(p.id, { baudRate: Number(e.target.value) })}
                      className="w-full text-[11px] font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none"
                    >
                      {[4800, 9600, 19200, 38400, 57600, 115200].map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </label>
                ) : (
                  <label className="space-y-0.5">
                    <span className="text-[8px] font-black uppercase text-slate-400 block">BLE Service UUID</span>
                    <input
                      type="text"
                      value={p.bleServiceUuid || ''}
                      onChange={e => updateConfig(p.id, { bleServiceUuid: e.target.value.trim() || undefined })}
                      placeholder="Optional"
                      className="w-full text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                    />
                  </label>
                )}
              </div>

              <details className="text-[10px] text-slate-500">
                <summary className="cursor-pointer font-bold uppercase tracking-wider text-[9px] text-slate-400 select-none">
                  Advanced / Encoding
                </summary>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2">
                  <label className="space-y-0.5">
                    <span className="text-[8px] font-black uppercase text-slate-400 block">Marathi Encoding</span>
                    <select
                      value={p.encodingMode || 'auto-raster'}
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
                      value={p.codePage ?? ''}
                      onChange={e => updateConfig(p.id, { codePage: e.target.value === '' ? undefined : Number(e.target.value) })}
                      placeholder="Model specific"
                      className="w-full text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                    />
                  </label>
                  <label className="flex items-end gap-1.5 text-[9px] font-bold uppercase text-slate-500 pb-1.5">
                    <input
                      type="checkbox"
                      checked={!!p.beepEnabled}
                      onChange={e => updateConfig(p.id, { beepEnabled: e.target.checked })}
                      className="accent-indigo-600"
                    />
                    Beep after print (if supported)
                  </label>
                </div>
              </details>
            </div>
          ))}
        </div>
      </div>

      {/* Print queue */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-600 m-0 flex items-center gap-1.5">
            <Activity size={13} /> Print Queue
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-bold text-slate-400 font-mono">
              Q:{queue.counts.QUEUED} P:{queue.counts.PRINTING} OK:{queue.counts.PRINTED} F:{queue.counts.FAILED}
            </span>
            {printFailed && (
              <button
                type="button"
                onClick={() => queue.jobs.filter(j => j.status === 'FAILED').forEach(j => retryJob(j.id))}
                className="flex items-center gap-1 text-[10px] font-bold uppercase text-amber-600 hover:text-amber-800 cursor-pointer"
              >
                <RefreshCw size={11} /> Retry All
              </button>
            )}
            <button
              type="button"
              onClick={clearFinishedJobs}
              className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              <XCircle size={11} /> Clear Done
            </button>
          </div>
        </div>
        {queue.jobs.length === 0 ? (
          <div className="p-6 text-center text-[11px] text-slate-400">No print jobs yet.</div>
        ) : (
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
            {queue.jobs.map(job => (
              <div key={job.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
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
                      onClick={() => retryJob(job.id)}
                      className="p-1 rounded text-amber-600 hover:bg-amber-50 cursor-pointer"
                      title="Retry"
                    >
                      <RefreshCw size={12} />
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
            onClick={() => getDiagnostics().then(setDiag).catch(() => setDiag(null))}
            className="flex items-center gap-1 text-[10px] font-bold uppercase text-indigo-600 hover:text-indigo-800 cursor-pointer"
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
        {diag && (
          <div className="px-4 py-2">
            <DiagRow label="Browser" value={diag.browserName} />
            <DiagRow label="Android detected" value={diag.androidDetected ? 'YES' : 'NO'} />
            <DiagRow label="HTTPS" value={diag.https ? 'YES' : 'NO'} ok={diag.https} />
            <DiagRow label="Web Serial" value={diag.webSerial ? 'YES' : 'NO'} ok={diag.webSerial} />
            <DiagRow label="Web Bluetooth" value={diag.webBluetooth ? 'YES' : 'NO'} ok={diag.webBluetooth} />
            <DiagRow label="Previously granted ports" value={String(diag.grantedSerialPorts)} />
            <DiagRow label="Bluetooth permission" value={diag.bluetoothPermission} />
            <DiagRow label="Printer connected" value={diag.printerConnected ? 'YES' : 'NO'} ok={diag.printerConnected} />
            <DiagRow label="Connection type" value={diag.connectionType || '—'} />
            {diag.warnings.length > 0 && (
              <div className="py-2 space-y-1">
                {diag.warnings.map((w, i) => (
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
