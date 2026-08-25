/**
 * Rasterizes non-Latin (Devanagari / Marathi) receipt lines into monochrome
 * bitmaps so they can be printed on thermal printers whose built-in code pages
 * only cover Latin + Chinese scripts (e.g. the KPC307-UEWB-6178).
 *
 * ESC/POS thermal printers cannot render Devanagari from raw UTF-8 bytes (they
 * print the bytes through their own font table, which produces gibberish). The
 * reliable fix is to draw the text on a hidden <canvas> with a bundled
 * Devanagari font, crop it to the actual ink, and ship it as a GS v 0 raster
 * image.
 *
 * Only lines that actually contain non-ASCII characters take the image path;
 * plain Latin lines are still sent as regular ESC/POS text (fast, native).
 */

export const PRINTER_DOTS_80 = 576; // 72 mm printable width @ 203 dpi
export const PRINTER_DOTS_58 = 384; // 48 mm printable width @ 203 dpi

export type RasterAlign = 'left' | 'center' | 'right';

export interface RasterTextLineOptions {
  /** Printable width in dots (576 for 80mm, 384 for 58mm paper). */
  widthDots: number;
  align?: RasterAlign;
  bold?: boolean;
  /** Base glyph size in printer dots (=canvas px). */
  fontSize?: number;
  /** Extra feed (dots) after the image to separate lines. */
  feedDots?: number;
}

const FONT_NAME = 'Noto Sans Devanagari';
const FONT_FAMILY =
  `'Noto Sans Devanagari','Nirmala UI','Mangal','Lohit Devanagari',` +
  `'Kohinoor Devanagari',sans-serif`;
const FONT_DEVANAGARI_URL =
  `${typeof window !== 'undefined' ? window.location.origin : ''}` +
  `/fonts/NotoSansDevanagari.woff2`;
const FONT_LATIN_URL =
  `${typeof window !== 'undefined' ? window.location.origin : ''}` +
  `/fonts/NotoSansDevanagari-Latin.woff2`;

let fontReady: Promise<void> | null = null;

function ensureFont(): Promise<void> {
  if (fontReady) return fontReady;
  fontReady = (async () => {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    try {
      const devanagari = new FontFace(FONT_NAME, `url(${FONT_DEVANAGARI_URL})`, {
        weight: '100 900',
        unicodeRange: 'U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+20F0, U+25CC, U+A830-A839, U+A8E0-A8FF'
      });
      const latin = new FontFace(FONT_NAME, `url(${FONT_LATIN_URL})`, {
        weight: '100 900',
        unicodeRange: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
      });

      const [dResult, lResult] = await Promise.allSettled([devanagari.load(), latin.load()]);

      if (dResult.status === 'rejected') {
        console.warn('[RASTER] Devanagari font failed to load:', dResult.reason);
      }
      if (lResult.status === 'rejected') {
        console.warn('[RASTER] Latin font failed to load:', lResult.reason);
      }

      if (dResult.status === 'fulfilled') document.fonts.add(devanagari);
      if (lResult.status === 'fulfilled') document.fonts.add(latin);

      await document.fonts.ready;
      await document.fonts.load(`16px ${FONT_NAME}`, '\u0915');
    } catch (err) {
      console.warn('[RASTER] Font loading error, falling back to system Devanagari fonts:', err);
    }
  })();
  return fontReady;
}

/** True when a line can be sent as plain ESC/POS text (safe ASCII). */
export function isPlainAscii(text: string): boolean {
  return /^[\x20-\x7E]*$/.test(text);
}

/** Pack a 1-bit row-major bitmap (MSB first) into GS v 0 raster bytes. */
function gsV0(widthBytes: number, heightDots: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length);
  out[0] = 0x1d; // GS
  out[1] = 0x76; // v
  out[2] = 0x30; // 0
  out[3] = 0x00; // m = normal density
  out[4] = widthBytes & 0xff; // xL
  out[5] = (widthBytes >> 8) & 0xff; // xH
  out[6] = heightDots & 0xff; // yL
  out[7] = (heightDots >> 8) & 0xff; // yH
  out.set(data, 8);
  return out;
}

/**
 * Render a single text line as an ESC/POS raster image (GS v 0).
 * Alignment is baked into the bitmap (left / center / right relative to the
 * printable width), so the printer only needs to print from the left margin.
 */
export async function rasterizeTextLine(
  text: string,
  options: RasterTextLineOptions
): Promise<Uint8Array> {
  const { widthDots } = options;
  const align = options.align ?? 'left';
  const bold = options.bold ?? false;
  const feedDots = options.feedDots ?? 6;
  let fontSize = options.fontSize ?? (widthDots >= 576 ? 32 : 26);

  await ensureFont();

  const canvas = document.createElement('canvas');
  canvas.width = widthDots;
  canvas.height = Math.ceil(fontSize * 1.7) + 10;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is not available');

  const draw = (size: number) => {
    ctx.font = `${bold ? 700 : 400} ${size}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillText(text, 0, 4);
  };

  draw(fontSize);
  let metrics = ctx.measureText(text);
  while (metrics.width > widthDots - 8 && fontSize > 10) {
    fontSize -= 1;
    draw(fontSize);
    metrics = ctx.measureText(text);
  }

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  const isInk = (x: number, y: number) => {
    const i = (y * canvas.width + x) * 4;
    return (
      px[i + 3] > 64 &&
      px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114 < 160
    );
  };

  // Find the bounding box of the actual ink so each line stays as small as
  // possible (less data -> much faster at the printer's serial baud rate).
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (isInk(x, y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Blank line -> just a small feed.
  if (maxX < 0) {
    console.warn('[RASTER] No ink detected for text:', JSON.stringify(text), '- font may not support these characters');
    return new Uint8Array([0x1b, 0x4a, feedDots]); // ESC J n
  }

  const pad = 2;
  const textW = Math.min(maxX - minX + 1 + pad * 2, widthDots);
  const textH = maxY - minY + 1 + pad * 2;

  let leftPad: number;
  if (align === 'center') leftPad = Math.max(0, Math.floor((widthDots - textW) / 2));
  else if (align === 'right') leftPad = Math.max(0, widthDots - textW);
  else leftPad = 0;

  let widthBytes = Math.ceil((textW + leftPad) / 8);
  if (widthBytes % 2 !== 0) widthBytes += 1; // many printers want an even byte width
  const maxBytes = Math.floor(widthDots / 8);
  if (widthBytes > maxBytes) widthBytes = maxBytes;

  const rowBytes = widthBytes * 8;
  const data = new Uint8Array(widthBytes * textH);

  for (let row = 0; row < textH; row++) {
    const srcY = minY - pad + row;
    for (let col = 0; col < textW; col++) {
      const srcX = minX - pad + col;
      const dstX = leftPad + col;
      if (dstX >= rowBytes) break;
      if (
        srcY < 0 || srcY >= canvas.height ||
        srcX < 0 || srcX >= canvas.width
      ) {
        continue;
      }
      if (isInk(srcX, srcY)) {
        data[row * widthBytes + (dstX >> 3)] |= 0x80 >> (dstX & 7);
      }
    }
  }

  const out = gsV0(widthBytes, textH, data);
  const withFeed = new Uint8Array(out.length + 3);
  withFeed.set(out);
  withFeed[out.length] = 0x1b; // ESC J n -> feed to separate lines
  withFeed[out.length + 1] = 0x4a;
  withFeed[out.length + 2] = feedDots;
  return withFeed;
}