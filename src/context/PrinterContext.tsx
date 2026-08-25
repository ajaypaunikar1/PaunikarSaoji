import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { printerHub } from '../services/printer/multiPrinterManager';
import { BluetoothPrinter } from '../services/printer/bluetoothPrinter';
import type { PrinterStatusInfo } from '../services/printer/multiPrinterManager';
import type { ConnectionTiming } from '../services/printer/bluetoothPrinter';
import type { ReceiptOptions } from '../utils/escpos';
import { toStaffError } from '../services/printer/friendlyErrors';
import type { StaffError } from '../services/printer/friendlyErrors';
import { generateKOT, generateBillReceipt, generateTestPrint } from '../utils/escpos';
import type { ReceiptSettings } from '../utils/escpos';
import type { PrinterConfig } from '../services/printer/printerConfig';
import type { Order, Bill } from '../types/types';

/**
 * PrinterContext - the ONLY printer API the POS views consume.
 *
 * Legacy single-printer surface (connect / printKOT / printBill / testPrint)
 * is preserved verbatim so existing screens keep working. Internally every
 * job is routed by ROLE through the multi-printer hub:
 *
 *   printKOT  -> KITCHEN printer
 *   printBill -> BILLING printer (PARCEL falls back to BILLING)
 *   testPrint -> active printer
 */

interface PrinterContextType {
  // ----- legacy surface (unchanged signatures) -----
  supported: boolean;
  connected: boolean;
  printerName: string;
  printing: boolean;
  error: string | null;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  testPrint: (settings?: ReceiptSettings) => Promise<boolean>;
  printKOT: (order: Order, settings?: ReceiptSettings) => Promise<boolean>;
  printBill: (bill: Bill, order: Order, settings?: ReceiptSettings, waiterName?: string) => Promise<boolean>;
  // ----- multi-printer surface -----
  printers: PrinterStatusInfo[];
  connectPrinter: (printerId: string) => Promise<boolean>;
  disconnectPrinter: (printerId: string, forget?: boolean) => Promise<void>;
  testPrintOn: (printerId: string, settings?: ReceiptSettings) => Promise<boolean>;
  retryJob: (printerId: string, jobId: string) => void;
  cancelJob: (printerId: string, jobId: string) => void;
  clearFinishedJobs: () => void;
  getDiagnostics: () => Record<string, unknown>;
  getTiming: (printerId: string) => ConnectionTiming | null;
  // ----- configuration CRUD (settings page) -----
  savePrinterConfig: (config: PrinterConfig) => void;
  removePrinterConfig: (printerId: string) => void;
  swapPrinters: (printerIdA: string, printerIdB: string) => Promise<void>;
  setActivePrinter: (printerId: string) => void;
}

const PrinterContext = createContext<PrinterContextType | undefined>(undefined);

export const PrinterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [printers, setPrinters] = useState<PrinterStatusInfo[]>([]);
  const [supported] = useState<boolean>(() => BluetoothPrinter.isSupported());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    printerHub.init();

    // Silent launch-time reconnect to previously granted BLE devices.
    void printerHub.autoReconnectOnLaunch().catch(() => {
      /* no granted devices or browser refused - user connects manually */
    });

    const unsubscribe = printerHub.onStatus(statuses => setPrinters(statuses));
    return unsubscribe;
  }, []);

  const connected = useMemo(
    () => printers.some(p => p.enabled && p.state === 'connected'),
    [printers]
  );
  const printing = useMemo(
    () =>
      printers.some(p => p.jobs.some(j => j.status === 'PRINTING' || j.status === 'RETRYING')),
    [printers]
  );
  const printerName = useMemo(() => {
    const active = printers.find(p => p.state === 'connected');
    return active?.deviceName || '';
  }, [printers]);
  const hubError = useMemo(
    () => printers.find(p => p.lastError)?.lastError ?? null,
    [printers]
  );

  /** Show a staff-friendly toast for any printer failure. */
  const reportError = useCallback((err: unknown): string => {
    const friendly: StaffError = toStaffError(err);
    const message = err instanceof Error ? err.message : String(err);
    toast.error(`${friendly.title}${friendly.detail ? ` ${friendly.detail}` : ''}`);
    return message || friendly.title;
  }, []);

  /** Receipt options (cut mode, paper width) of the printer handling `role`. */
  const optsForRole = useCallback(
    (role: PrinterStatusInfo['role']): ReceiptOptions => {
      const config = printerHub.resolveForRole(role);
      return {
        cutMode: config?.cutMode ?? 'FULL',
        paperWidth: config?.paperWidth ?? 80
      };
    },
    []
  );

  // ----- legacy surface -----

  const connect = useCallback(async (): Promise<boolean> => {
    if (!BluetoothPrinter.isSupported()) {
      toast.error('Web Bluetooth is not supported. Please use Chrome or Edge on a secure (https) page.');
      return false;
    }
    try {
      await printerHub.connectPrinter(printerHub.getActiveConfig().id);
      toast.success('Printer connected!');
      return true;
    } catch (err) {
      if ((err as { code?: string })?.code === 'USER_CANCELLED') return false;
      setError(reportError(err));
      return false;
    }
  }, [reportError]);

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      await printerHub.disconnectPrinter(printerHub.getActiveConfig().id);
      toast.info('Printer disconnected');
    } catch (err) {
      setError(reportError(err));
    }
  }, [reportError]);

  const testPrint = useCallback(
    async (settings?: ReceiptSettings): Promise<boolean> => {
      const role = printerHub.getActiveConfig().role;
      try {
        const data = await generateTestPrint(settings, optsForRole(role));
        const printed = await printerHub.route({
          kind: 'TEST',
          role,
          label: 'Test Print',
          data
        });
        if (printed) toast.success('Test print sent successfully!');
        else setError('Test print failed - see Printer Settings queue.');
        return printed;
      } catch (err) {
        setError(reportError(err));
        return false;
      }
    },
    [optsForRole, reportError]
  );

  const printKOT = useCallback(
    async (order: Order, settings?: ReceiptSettings): Promise<boolean> => {
      try {
        const data = await generateKOT(order, settings, optsForRole('KITCHEN'));
        const printed = await printerHub.route({
          kind: 'KOT',
          role: 'KITCHEN',
          label: `KOT #${order.id.substring(4, 10)}`,
          data
        });
        if (printed) toast.success(`KOT #${order.id.substring(4, 10)} printed`);
        return printed;
      } catch (err) {
        setError(reportError(err));
        return false;
      }
    },
    [optsForRole, reportError]
  );

  const printBill = useCallback(
    async (bill: Bill, order: Order, settings?: ReceiptSettings, waiterName?: string): Promise<boolean> => {
      try {
        const data = await generateBillReceipt(bill, order, settings, { ...optsForRole('BILLING'), waiterName });
        const printed = await printerHub.route({
          kind: 'BILL',
          role: 'BILLING',
          label: `Bill #${bill.id.substring(5, 12)}`,
          data
        });
        if (printed) toast.success(`Bill #${bill.id.substring(5, 12)} printed`);
        return printed;
      } catch (err) {
        setError(reportError(err));
        return false;
      }
    },
    [optsForRole, reportError]
  );

  // ----- multi-printer surface -----

  const connectPrinter = useCallback(
    async (printerId: string): Promise<boolean> => {
      if (!BluetoothPrinter.isSupported()) {
        toast.error('Web Bluetooth is not supported. Please use Chrome or Edge on a secure (https) page.');
        return false;
      }
      try {
        await printerHub.connectPrinter(printerId);
        const p = printers.find(x => x.id === printerId);
        toast.success(`${p?.name ?? 'Printer'} connected!`);
        return true;
      } catch (err) {
        if ((err as { code?: string })?.code === 'USER_CANCELLED') return false;
        setError(reportError(err));
        return false;
      }
    },
    [printers, reportError]
  );

  const disconnectPrinter = useCallback(
    async (printerId: string, forget = false): Promise<void> => {
      try {
        await printerHub.disconnectPrinter(printerId, forget);
      } catch (err) {
        setError(reportError(err));
      }
    },
    [reportError]
  );

  const testPrintOn = useCallback(
    async (printerId: string, settings?: ReceiptSettings): Promise<boolean> => {
      try {
        const config = printerHub.getConfigs().find(c => c.id === printerId);
        const data = await generateTestPrint(
          settings,
          {
            cutMode: config?.cutMode ?? 'FULL',
            paperWidth: config?.paperWidth ?? 80
          },
          { name: config?.name ?? 'Printer', role: String(config?.role ?? 'UNKNOWN') }
        );
        const printed = await printerHub.printOn(printerId, {
          kind: 'TEST',
          label: 'Test Print',
          data
        });
        if (printed) toast.success('Test print sent successfully!');
        return printed;
      } catch (err) {
        setError(reportError(err));
        return false;
      }
    },
    [reportError]
  );

  const retryJob = useCallback((printerId: string, jobId: string) => {
    printerHub.retryJob(printerId, jobId);
  }, []);

  const cancelJob = useCallback((printerId: string, jobId: string) => {
    printerHub.cancelJob(printerId, jobId);
  }, []);

  const clearFinishedJobs = useCallback(() => {
    printerHub.clearFinishedJobs();
  }, []);

  const getDiagnostics = useCallback((): Record<string, unknown> => {
    return printerHub.diagnostics();
  }, []);

  const getTiming = useCallback((printerId: string): ConnectionTiming | null => {
    return printerHub.getTiming(printerId);
  }, []);

  const savePrinterConfig = useCallback((config: PrinterConfig): void => {
    printerHub.upsertConfig(config);
  }, []);

  const removePrinterConfig = useCallback((printerId: string): void => {
    printerHub.removeConfig(printerId);
  }, []);

  const swapPrinters = useCallback(
    async (printerIdA: string, printerIdB: string): Promise<void> => {
      try {
        await printerHub.swapDevices(printerIdA, printerIdB);
        toast.success('Devices swapped between the two slots');
      } catch (err) {
        setError(reportError(err));
      }
    },
    [reportError]
  );

  const setActivePrinter = useCallback((printerId: string): void => {
    printerHub.setActivePrinter(printerId);
  }, []);

  return (
    <PrinterContext.Provider
      value={{
        supported,
        connected,
        printerName,
        printing,
        error: error ?? hubError,
        connect,
        disconnect,
        testPrint,
        printKOT,
        printBill,
        printers,
        connectPrinter,
        disconnectPrinter,
        testPrintOn,
        retryJob,
        cancelJob,
        clearFinishedJobs,
        getDiagnostics,
        getTiming,
        savePrinterConfig,
        removePrinterConfig,
        swapPrinters,
        setActivePrinter
      }}
    >
      {children}
    </PrinterContext.Provider>
  );
};

export const usePrinter = (): PrinterContextType => {
  const ctx = useContext(PrinterContext);
  if (!ctx) {
    throw new Error('usePrinter must be used within a PrinterProvider');
  }
  return ctx;
};
