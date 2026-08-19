'use client';
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef
} from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { webSerialPrinter } from '../services/webSerialPrinter';
import { generateKOT, generateBillReceipt, generateTestPrint } from '../utils/escpos';
import type { ReceiptSettings } from '../utils/escpos';
import type { Order, Bill } from '../types/types';

interface PrinterState {
  supported: boolean;
  connected: boolean;
  printerName: string;
  printing: boolean;
  error: string | null;
}

interface PrinterContextType extends PrinterState {
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  testPrint: (settings?: ReceiptSettings) => Promise<boolean>;
  printKOT: (order: Order, settings?: ReceiptSettings) => Promise<boolean>;
  printBill: (bill: Bill, order: Order, settings?: ReceiptSettings) => Promise<boolean>;
}

const PrinterContext = createContext<PrinterContextType | undefined>(undefined);

export const PrinterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [supported, setSupported] = useState<boolean>(false);
  const [connected, setConnected] = useState<boolean>(false);
  const [printerName, setPrinterName] = useState<string>('');
  const [printing, setPrinting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const connectedRef = useRef<boolean>(false);

  // Keep a polling loop that reflects connection state changes on every screen
  // (e.g. when the user plugs/unplugs the printer).
  useEffect(() => {
    const supported = webSerialPrinter.isSupported();
    setSupported(supported);
    if (!supported) return;

    const serial = navigator.serial as Serial | undefined;

    const refresh = async () => {
      const isConnected = webSerialPrinter.isConnected();
      if (isConnected !== connectedRef.current) {
        connectedRef.current = isConnected;
        setConnected(isConnected);
        if (isConnected) {
          const ports = await webSerialPrinter.getAuthorizedPorts();
          const info = ports[0]?.getInfo?.();
          setPrinterName(info?.usbVendorId ? 'KPC307-UEWB-6178' : 'Thermal Printer');
          setError(null);
        } else {
          setPrinterName('');
        }
      }
      setPrinting(webSerialPrinter.isPrinting());
    };

    // Physical unplug / port revoked outside our control
    const handleDisconnect = () => {
      connectedRef.current = false;
      setConnected(false);
      setPrinterName('');
      setError('Printer disconnected. Reconnect the printer and try again.');
    };

    refresh();
    const interval = setInterval(refresh, 1500);
    serial?.addEventListener?.('disconnect', handleDisconnect);
    return () => {
      clearInterval(interval);
      serial?.removeEventListener?.('disconnect', handleDisconnect);
    };
  }, []);

  const connect = useCallback(async (): Promise<boolean> => {
    if (!webSerialPrinter.isSupported()) {
      toast.error('Web Serial is not supported. Please use a compatible Chromium-based browser.');
      return false;
    }
    try {
      await webSerialPrinter.connect();
      connectedRef.current = true;
      setConnected(true);
      setError(null);
      setPrinterName('KPC307-UEWB-6178');
      toast.success('Printer connected!');
      return true;
    } catch (err: any) {
      const message = err?.message || 'Failed to connect to printer';
      setError(message);
      toast.error(message);
      return false;
    }
  }, []);

  const disconnect = useCallback(async () => {
    await webSerialPrinter.disconnect();
    connectedRef.current = false;
    setConnected(false);
    setPrinterName('');
    setError(null);
    toast.info('Printer disconnected');
  }, []);

  const testPrint = useCallback(
    async (settings?: ReceiptSettings): Promise<boolean> => {
      if (!webSerialPrinter.isConnected()) {
        toast.error('Printer not connected. Tap "Connect Printer" first.');
        return false;
      }
      try {
        await webSerialPrinter.print(await generateTestPrint(settings));
        toast.success('Test print sent successfully!');
        return true;
      } catch (err: any) {
        const message = err?.message || 'Test print failed';
        setError(message);
        toast.error(message);
        return false;
      }
    },
    []
  );

  const printKOT = useCallback(
    async (order: Order, settings?: ReceiptSettings): Promise<boolean> => {
      if (!webSerialPrinter.isConnected()) {
        toast.error('Printer not connected. Tap "Connect Printer" and select the thermal printer.');
        return false;
      }
      try {
        await webSerialPrinter.print(await generateKOT(order, settings));
        toast.success(`KOT #${order.id.substring(4, 10)} printed`);
        return true;
      } catch (err: any) {
        const message = err?.message || 'KOT printing failed';
        setError(message);
        toast.error(message);
        return false;
      }
    },
    []
  );

  const printBill = useCallback(
    async (bill: Bill, order: Order, settings?: ReceiptSettings): Promise<boolean> => {
      if (!webSerialPrinter.isConnected()) {
        toast.error('Printer not connected. Tap "Connect Printer" and select the thermal printer.');
        return false;
      }
      try {
        await webSerialPrinter.print(await generateBillReceipt(bill, order, settings));
        toast.success(`Bill #${bill.id.substring(5, 12)} printed`);
        return true;
      } catch (err: any) {
        const message = err?.message || 'Bill printing failed';
        setError(message);
        toast.error(message);
        return false;
      }
    },
    []
  );

  return (
    <PrinterContext.Provider
      value={{
        supported,
        connected,
        printerName,
        printing,
        error,
        connect,
        disconnect,
        testPrint,
        printKOT,
        printBill
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