import React, { useState } from 'react';
import { Plug, Unplug } from 'lucide-react';
import { usePrinter } from '../context/PrinterContext';
import type { PrinterRole } from '../services/printer/printerConfig';

interface Props {
  role: PrinterRole;
  label?: string;
}

const RolePrinterButton: React.FC<Props> = ({ role, label }) => {
  const { printers, supported, connectPrinter, disconnectPrinter } = usePrinter();
  const [busy, setBusy] = useState(false);

  const printer = printers.find(p => p.role === role);
  const state = printer?.state ?? 'disconnected';
  const isConn = state === 'connected';
  const name = label || (printer ? `${role.charAt(0)}${role.slice(1).toLowerCase()} Printer` : role);

  const handleClick = async () => {
    if (!printer) return;
    setBusy(true);
    try {
      if (isConn) await disconnectPrinter(printer.id);
      else await connectPrinter(printer.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!supported || busy || state === 'pairing' || state === 'reconnecting'}
      title={
        !supported
          ? 'Web Bluetooth unavailable in this browser'
          : printer?.lastError || (isConn ? `Tap to disconnect ${name}` : `Tap to connect ${name}`)
      }
      className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs shadow-sm border transition cursor-pointer disabled:opacity-50 ${
        isConn
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
          : state === 'pairing' || state === 'reconnecting'
            ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${
          isConn ? 'bg-emerald-500 animate-pulse' : state === 'pairing' || state === 'reconnecting' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'
        }`}
      />
      <span className="font-bold">{name}</span>
      <span className="text-[9px] font-black uppercase tracking-wider opacity-70">
        {state === 'pairing'
          ? 'Pairing...'
          : state === 'reconnecting'
            ? 'Reconnecting...'
            : busy
              ? isConn ? '...' : 'Connect'
              : isConn ? <Unplug size={11} className="inline" /> : <Plug size={11} className="inline" />}
      </span>
    </button>
  );
};

export default RolePrinterButton;
