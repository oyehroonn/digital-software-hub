/**
 * Dependency-free spreadsheet import for the Bulk Update tool.
 *
 * We cannot `npm install` (locked toolchain), so this parses the two formats an
 * admin actually exports without a library:
 *   - CSV / TSV  — full RFC-4180-ish parser (quotes, escaped quotes, newlines).
 *   - XLSX       — a .xlsx is a ZIP of XML. We read the ZIP central directory,
 *                  inflate the needed parts with the browser/WebView-native
 *                  DecompressionStream("deflate-raw"), then parse the sheet XML
 *                  + shared strings. No SheetJS required.
 *
 * Everything returns a plain string[][] (rows of cells). The caller maps the
 * header row to product fields. Parsing never throws into the UI — failures
 * surface as a rejected promise the caller catches.
 */

export interface Sheet {
  rows: string[][];
  format: "csv" | "tsv" | "xlsx";
}

export async function parseSpreadsheet(file: File): Promise<Sheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const buf = await file.arrayBuffer();
    return { rows: await parseXlsx(buf), format: "xlsx" };
  }
  const text = await file.text();
  if (name.endsWith(".tsv") || (!name.endsWith(".csv") && text.includes("\t"))) {
    return { rows: parseDelimited(text, "\t"), format: "tsv" };
  }
  return { rows: parseDelimited(text, ","), format: "csv" };
}

/** Parse pasted text (CSV or TSV auto-detected by delimiter frequency). */
export function parsePastedText(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return parseDelimited(text, tabs > commas ? "\t" : ",");
}

/* ------------------------------------------------------------------ *
 * Delimited text (CSV / TSV) — quote-aware
 * ------------------------------------------------------------------ */

function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/* ------------------------------------------------------------------ *
 * Minimal XLSX (ZIP + OOXML) reader
 * ------------------------------------------------------------------ */

async function parseXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const zip = readZip(new Uint8Array(buf));

  const sharedXml = await inflateEntry(zip, "xl/sharedStrings.xml");
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];

  // First worksheet: prefer sheet1, else the first xl/worksheets/*.xml.
  let sheetName = "xl/worksheets/sheet1.xml";
  if (!zip.entries.has(sheetName)) {
    const key = [...zip.entries.keys()].find((k) => /^xl\/worksheets\/.*\.xml$/.test(k));
    if (!key) throw new Error("No worksheet found in .xlsx");
    sheetName = key;
  }
  const sheetXml = await inflateEntry(zip, sheetName);
  if (!sheetXml) throw new Error("Could not read worksheet");
  return parseSheet(sheetXml, shared);
}

interface ZipEntry {
  method: number;
  offset: number; // local header offset
  compSize: number;
}

interface Zip {
  entries: Map<string, ZipEntry>;
  data: Uint8Array;
}

/** Read the ZIP central directory into a filename → entry map. */
function readZip(data: Uint8Array): Zip {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // Find End Of Central Directory (0x06054b50), scanning from the tail.
  let eocd = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid .xlsx (no ZIP directory)");
  const count = dv.getUint16(eocd + 10, true);
  let ptr = dv.getUint32(eocd + 16, true);

  const entries = new Map<string, ZipEntry>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(ptr, true) !== 0x02014b50) break;
    const method = dv.getUint16(ptr + 10, true);
    const compSize = dv.getUint32(ptr + 20, true);
    const nameLen = dv.getUint16(ptr + 28, true);
    const extraLen = dv.getUint16(ptr + 30, true);
    const commentLen = dv.getUint16(ptr + 32, true);
    const localOffset = dv.getUint32(ptr + 42, true);
    const name = dec.decode(data.subarray(ptr + 46, ptr + 46 + nameLen));
    entries.set(name, { method, offset: localOffset, compSize });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, data };
}

async function inflateEntry(zip: Zip, name: string): Promise<string | null> {
  const entry = zip.entries.get(name);
  if (!entry) return null;
  const data = zip.data;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // Local file header: name + extra lengths live at +26 / +28.
  const nameLen = dv.getUint16(entry.offset + 26, true);
  const extraLen = dv.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLen + extraLen;
  const bytes = data.subarray(start, start + entry.compSize);

  if (entry.method === 0) return new TextDecoder().decode(bytes);
  if (entry.method === 8) return new TextDecoder().decode(await inflateRaw(bytes));
  throw new Error(`Unsupported ZIP compression method ${entry.method}`);
}

/** Raw DEFLATE via the platform stream (available in Tauri WebView + Chromium). */
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as unknown as { DecompressionStream?: typeof DecompressionStream })
    .DecompressionStream;
  if (!DS) throw new Error("XLSX needs DecompressionStream — export as CSV instead");
  const ds = new DS("deflate-raw");
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(ds);
  const out = await new Response(stream).arrayBuffer();
  return new Uint8Array(out);
}

/* ------------------------------------------------------------------ *
 * OOXML parsing
 * ------------------------------------------------------------------ */

function xmlDoc(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function parseSharedStrings(xml: string): string[] {
  const doc = xmlDoc(xml);
  const out: string[] = [];
  const items = doc.getElementsByTagName("si");
  for (let i = 0; i < items.length; i++) {
    // <si> may hold one <t> or several <r><t> runs.
    const ts = items[i].getElementsByTagName("t");
    let s = "";
    for (let j = 0; j < ts.length; j++) s += ts[j].textContent ?? "";
    out.push(s);
  }
  return out;
}

function colIndex(ref: string): number {
  const m = ref.match(/^([A-Z]+)/);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const doc = xmlDoc(xml);
  const rows: string[][] = [];
  const rowEls = doc.getElementsByTagName("row");
  for (let i = 0; i < rowEls.length; i++) {
    const cells = rowEls[i].getElementsByTagName("c");
    const row: string[] = [];
    for (let j = 0; j < cells.length; j++) {
      const c = cells[j];
      const ref = c.getAttribute("r") ?? "";
      const idx = ref ? colIndex(ref) : j;
      const type = c.getAttribute("t");
      let val = "";
      if (type === "inlineStr") {
        const t = c.getElementsByTagName("t")[0];
        val = t?.textContent ?? "";
      } else {
        const v = c.getElementsByTagName("v")[0];
        const raw = v?.textContent ?? "";
        val = type === "s" ? shared[Number(raw)] ?? "" : raw;
      }
      while (row.length < idx) row.push("");
      row[idx] = val;
    }
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => (v ?? "").trim() !== ""));
}
