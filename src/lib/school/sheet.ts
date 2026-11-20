import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export type SheetRow = { roll?: number; fullName: string; gender?: string; streamName?: string };

export function rowsFromMatrix(matrix: string[][]): SheetRow[] {
  const cleaned = matrix.map((line) => line.map((cell) => cell.trim())).filter((line) => line.some(Boolean));
  if (!cleaned.length) return [];
  const header = cleaned[0].map((cell) => cell.toLowerCase());
  const hasHeader = header.some((cell) => /name|learner|student|gender|sex|stream|roll|adm/.test(cell));
  const body = hasHeader ? cleaned.slice(1) : cleaned;
  const find = (pattern: RegExp) => (hasHeader ? header.findIndex((cell) => pattern.test(cell)) : -1);
  const nameAt = find(/name|learner|student/);
  const rollAt = find(/roll|adm|^no\b|#/);
  const genderAt = find(/gender|sex/);
  const streamAt = find(/stream|class/);

  return body
    .map((cells) => {
      if (!hasHeader) {
        if (cells.length >= 2 && /^\d+$/.test(cells[0])) {
          return { roll: Number(cells[0]), fullName: cells[1] ?? "", gender: cells[2], streamName: cells[3] };
        }
        return { fullName: cells[0] ?? "", gender: cells[1], streamName: cells[2] };
      }
      const fullName = nameAt >= 0 ? cells[nameAt] ?? "" : cells[0] ?? "";
      const rollText = rollAt >= 0 ? cells[rollAt] : "";
      const roll = rollText && /^\d+$/.test(rollText) ? Number(rollText) : undefined;
      return {
        roll,
        fullName,
        gender: genderAt >= 0 ? cells[genderAt] : undefined,
        streamName: streamAt >= 0 ? cells[streamAt] : undefined,
      };
    })
    .filter((row) => row.fullName && !/^(name|learner|student)$/i.test(row.fullName));
}

export function parseDelimited(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const sample = lines[0] ?? "";
  const delimiter = sample.includes("\t") ? "\t" : sample.includes(";") ? ";" : ",";
  return rowsFromMatrix(lines.map((line) => splitLine(line, delimiter)));
}

function splitLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
    } else current += char;
  }
  cells.push(current);
  return cells;
}

export type MarkSheetRow = { admissionNumber: string; fullName: string; scores: Record<string, number | null> };

function parseSheetScore(raw: string): number | null {
  const value = raw.trim().replace(/,/g, ".");
  if (!value) return null;
  const fraction = value.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fraction) {
    const obtained = Number(fraction[1]);
    const maximum = Number(fraction[2]);
    return maximum > 0 && obtained >= 0 && obtained <= maximum ? Math.round((obtained / maximum) * 10000) / 100 : null;
  }
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function isIdentifierHeader(label: string) {
  return /^(admission|adm(?:ission)?\s*(?:no|number)?|learner|student)?\s*(?:name|number|no\.?|id)?$|^(roll\s*(?:no|number)?|name|learner\s*name|student\s*name|adm(?:ission)?\s*(?:no|number)|gender|sex|stream|class|grade|total|average|mean|position|rank|remarks?|comment|teacher|signature|out\s*of)$/i.test(label.trim());
}

export function marksFromMatrix(matrix: string[][]): MarkSheetRow[] {
  const cleaned = matrix.map((line) => line.map((cell) => cell.trim())).filter((line) => line.some(Boolean));
  if (cleaned.length < 2) return [];
  const header = cleaned[0];
  const lower = header.map((cell) => cell.toLowerCase());
  const admissionAt = lower.findIndex((cell) => /admission|adm(?:ission)?\s*(?:no|number)?/.test(cell));
  const nameAt = lower.findIndex((cell) => /name|learner|student/.test(cell));
  if (admissionAt < 0 && nameAt < 0) throw new Error("The spreadsheet must have an Admission Number or Learner Name column.");
  return cleaned.slice(1).map((cells) => {
    const scores: Record<string, number | null> = {};
    header.forEach((label, index) => {
      if (index === admissionAt || index === nameAt || !label || isIdentifierHeader(label)) return;
      const raw = (cells[index] ?? "").trim();
      if (!raw) return;
      scores[label] = parseSheetScore(raw);
    });
    return { admissionNumber: (cells[admissionAt] ?? "").trim(), fullName: nameAt >= 0 ? (cells[nameAt] ?? "").trim() : "", scores };
  }).filter((row) => row.admissionNumber || row.fullName);
}

export function marksFromDelimited(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const sample = lines[0] ?? "";
  const delimiter = sample.includes("\t") ? "\t" : sample.includes(";") ? ";" : ",";
  return marksFromMatrix(lines.map((line) => splitLine(line, delimiter)));
}

export async function parseMarkSpreadsheet(file: File) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return marksFromMatrix(await readXlsxMatrix(new Uint8Array(await file.arrayBuffer())));
  if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) return marksFromDelimited(await file.text());
  throw new Error("Choose an .xlsx, .csv, .tsv or .txt file.");
}

export async function parseSpreadsheet(file: File) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return rowsFromMatrix(await readXlsxMatrix(new Uint8Array(await file.arrayBuffer())));
  return parseDelimited(await file.text());
}

export async function readXlsxMatrix(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const shared = files["xl/sharedStrings.xml"] ? decodeStrings(strFromU8(files["xl/sharedStrings.xml"])) : [];
  const sheetName = Object.keys(files).find((key) => /^xl\/worksheets\/sheet1\.xml$/.test(key));
  if (!sheetName) throw new Error("The spreadsheet has no first sheet.");
  const xml = strFromU8(files[sheetName]);
  const rows: string[][] = [];
  for (const row of xml.match(/<row\b[\s\S]*?<\/row>/g) ?? []) {
    const cells: string[] = [];
    let cursor = 0;
    for (const cell of row.match(/<c\b[\s\S]*?(?:\/>|<\/c>)/g) ?? []) {
      const ref = /r="([A-Z]+)\d+"/.exec(cell)?.[1] ?? "";
      const col = columnIndex(ref);
      while (cells.length < col) cells.push("");
      const type = /t="([^"]+)"/.exec(cell)?.[1] ?? "";
      const raw = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1] ?? (/<t[^>]*>([\s\S]*?)<\/t>/.exec(cell)?.[1] ?? "");
      const value = type === "s" ? shared[Number(raw)] ?? "" : unescapeXml(raw);
      cells[col] = value;
      cursor = col;
    }
    if (cells.length || cursor >= 0) rows.push(cells);
  }
  return rows;
}

function columnIndex(letters: string) {
  let n = 0;
  for (const char of letters) n = n * 26 + (char.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

function decodeStrings(xml: string) {
  return [...xml.matchAll(/<si\b[\s\S]*?<\/si>/g)].map((match) =>
    [...match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => unescapeXml(part[1] ?? "")).join(""),
  );
}

function unescapeXml(value: string) {
  return value
    .replace(/&#x([\da-f]{1,6});/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeXml(value: string) {
  const validXml = Array.from(value).filter((character) => {
    const code = character.charCodeAt(0);
    return code === 9 || code === 10 || code === 13 || code >= 32;
  }).join("");
  return validXml
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function excelColumn(index: number) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

/** Create a real, self-contained Excel workbook without adding a runtime dependency. */
export function writeXlsxFromMatrix(
  matrix: Array<Array<string | number | null | undefined>>,
  options: { sheetName?: string; orientation?: "portrait" | "landscape"; headerRow?: number; logo?: string } = {},
) {
  const rows = matrix.length ? matrix : [[]];
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const lastColumn = excelColumn(columnCount - 1);
  const lastRow = rows.length;
  const headerRow = Math.min(rows.length, Math.max(1, options.headerRow ?? 1));
  const orientation = options.orientation === "portrait" ? "portrait" : "landscape";
  const sheetName = (options.sheetName ?? "Mark list").replace(/[\\/?*:[\]]/g, " ").trim().slice(0, 31) || "Mark list";
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      if (value == null || value === "") return "";
      const reference = `${excelColumn(columnIndex)}${rowIndex + 1}`;
      const style = rowIndex + 1 === headerRow ? ' s="1"' : "";
      if (typeof value === "number" && Number.isFinite(value)) return `<c r="${reference}"${style}><v>${value}</v></c>`;
      const text = escapeXml(String(value));
      return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const freezeRows = headerRow;
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${Array.from({ length: columnCount }, (_, index) => `<col min="${index + 1}" max="${index + 1}" width="${index === 0 ? 8 : index === 1 ? 20 : index === 2 ? 30 : 14}" customWidth="1"/>`).join("")}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A${headerRow}:${lastColumn}${lastRow}"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="${orientation}" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1D4E4D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const logoBytes = options.logo?.startsWith("data:image/") ? (() => {
    try {
      const encoded = options.logo.split(",", 2)[1] ?? "";
      const binary = globalThis.atob(encoded);
      return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    } catch { return null; }
  })() : null;
  const hasLogo = Boolean(logoBytes?.length);
  const worksheetXml = hasLogo ? xml.replace("</worksheet>", '<drawing r:id="rId1"/></worksheet>') : xml;
  const contentTypesWithLogo = hasLogo ? contentTypes.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>') : contentTypes;
  const worksheetRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
  const drawing = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="1000000" cy="700000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="School logo"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;
  const drawingRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypesWithLogo),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(worksheetXml),
    "xl/styles.xml": strToU8(styles),
    ...(hasLogo ? { "xl/worksheets/_rels/sheet1.xml.rels": strToU8(worksheetRels), "xl/drawings/drawing1.xml": strToU8(drawing), "xl/drawings/_rels/drawing1.xml.rels": strToU8(drawingRels), "xl/media/image1.png": logoBytes! } : {}),
  };
  return zipSync(files, { level: 6 });
}
