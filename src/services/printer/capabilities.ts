/**
 * Browser / device capability detection for thermal printing.
 *
 * Android + browser combinations expose Bluetooth Classic (SPP) and BLE very
 * differently. This module never *attempts* a connection - it only reports
 * what the current environment supports so the UI can pick the right
 * transport (or explain clearly why none is available).
 */

export interface BrowserCapabilities {
  webSerial: boolean;
  webBluetooth: boolean;
  secureContext: boolean;
  isAndroid: boolean;
  isChromium: boolean;
  isWebView: boolean;
  browserName: string;
  platform: string;
}

function detectBrowser(ua: string): string {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Chrome|CriOS/.test(ua)) return 'Chrome';
  if (/Firefox|FxiOS/.test(ua)) return 'Firefox';
  if (/Safari/.test(ua)) return 'Safari';
  return 'Unknown';
}

export function detectCapabilities(): BrowserCapabilities {
  if (typeof navigator === 'undefined') {
    return {
      webSerial: false,
      webBluetooth: false,
      secureContext: false,
      isAndroid: false,
      isChromium: false,
      isWebView: false,
      browserName: 'Unknown',
      platform: 'Unknown'
    };
  }

  const ua = navigator.userAgent || '';
  const isAndroid = /Android/.test(ua);
  const isWebView = isAndroid && /;\s*wv\)/.test(ua);
  const isChromium = !!(window as any).chrome || /Chrom(e|ium)/.test(ua);

  return {
    webSerial: 'serial' in navigator,
    webBluetooth: 'bluetooth' in navigator,
    secureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
    isAndroid,
    isChromium,
    isWebView,
    browserName: detectBrowser(ua),
    platform: isAndroid ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : 'Desktop'
  };
}

/** Human-readable explanation of why this environment cannot reach a BT printer. */
export function capabilityWarnings(caps: BrowserCapabilities): string[] {
  const warnings: string[] = [];
  if (!caps.secureContext) {
    warnings.push('This page is not served over HTTPS (or localhost). Web Serial and Web Bluetooth are disabled by the browser on insecure pages.');
  }
  if (!caps.webSerial && !caps.webBluetooth) {
    warnings.push(`Neither Web Serial nor Web Bluetooth is available in ${caps.browserName}. Use Chrome (or another Chromium browser) on Android.`);
  }
  if (caps.isWebView && !caps.webSerial) {
    warnings.push('This looks like an Android WebView without serial access. Open the POS in Chrome instead.');
  }
  if (caps.isAndroid && caps.webSerial && !caps.isChromium) {
    warnings.push('Web Serial detected in a non-Chromium browser - it may not work reliably.');
  }
  return warnings;
}
