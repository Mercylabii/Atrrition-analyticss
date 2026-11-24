import Papa from 'papaparse';
import { suggestColumnMapping } from '../shared/dataCleaner.ts';
import type { ColumnMapping } from '../shared/types.ts';

export const DEFAULT_GOOGLE_SHEET_URL =
  process.env.GOOGLE_SHEET_CONNECTOR_URL?.trim() ||
  'https://script.google.com/macros/s/AKfycbyheE41_jJFZlPHmntBivpb-xCsT7pfnhDhphrp-NDJ-EgHW2gGTjUl8gnynRwmVAOjAQ/exec';

const ALLOWED_CONNECTOR_HOSTS = new Set([
  'script.google.com',
  'script.googleusercontent.com',
  'docs.google.com',
]);

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

export class ConnectorValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ConnectorValidationError';
    this.status = status;
  }
}

export function validateGoogleConnectorUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new ConnectorValidationError('Google Sheet Web App URL is required.', 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ConnectorValidationError('Invalid Google Sheet Web App URL format.', 400);
  }

  if (parsed.protocol !== 'https:') {
    throw new ConnectorValidationError(
      'Google Sheet connector URL must use HTTPS.',
      400
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_CONNECTOR_HOSTS.has(host)) {
    throw new ConnectorValidationError(
      'Connector URL host must be script.google.com, script.googleusercontent.com, or docs.google.com.',
      400
    );
  }

  if (host === 'docs.google.com') {
    const match = parsed.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (match && !parsed.pathname.includes('/export')) {
      const sheetId = match[1];
      const gidFromSearch = parsed.searchParams.get('gid');
      const gidFromHash = parsed.hash.match(/gid=(\d+)/)?.[1];
      const gid = gidFromSearch ?? gidFromHash;
      const exportUrl = new URL(`https://docs.google.com/spreadsheets/d/${sheetId}/export`);
      exportUrl.searchParams.set('format', 'csv');
      if (gid) {
        exportUrl.searchParams.set('gid', gid);
      }
      return exportUrl;
    }
  }

  return parsed;
}

async function fetchWithAllowlistedRedirects(initialUrl: URL): Promise<{
  status: number;
  contentType: string;
  text: string;
}> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(currentUrl.toString(), {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      headers: {
        Accept: 'application/json, text/csv, text/plain;q=0.9',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        throw new ConnectorValidationError(
          `Google Sheet endpoint returned redirect (${res.status}) without a Location header.`,
          502
        );
      }
      const nextUrl = new URL(location, currentUrl);
      currentUrl = validateGoogleConnectorUrl(nextUrl.toString());
      continue;
    }

    const contentType = res.headers.get('content-type') ?? '';
    const rawBuffer = await res.arrayBuffer();
    if (rawBuffer.byteLength > MAX_RESPONSE_BYTES) {
      throw new ConnectorValidationError(
        'Google Sheet response exceeded the 10MB dataset limit.',
        413
      );
    }

    const text = new TextDecoder('utf-8').decode(rawBuffer);
    if (!res.ok) {
      const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 180);
      throw new ConnectorValidationError(
        `Google Sheet endpoint returned HTTP ${res.status}${snippet ? `: ${snippet}` : ''}`,
        502
      );
    }

    return { status: res.status, contentType, text };
  }

  throw new ConnectorValidationError(
    'Google Sheet endpoint exceeded maximum redirect depth.',
    502
  );
}

function normalizeGridToCsv(grid: unknown[][]): { csvText: string; headers: string[] } {
  const nonEmptyRows = grid.filter(
    (row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')
  );
  if (nonEmptyRows.length < 2) {
    throw new ConnectorValidationError(
      'Google Sheet returned fewer than 2 rows (header + at least 1 employee record required).',
      400
    );
  }

  const rawHeaders = nonEmptyRows[0].map((h, idx) => {
    const val = String(h ?? '').trim();
    return val || `Column_${idx + 1}`;
  });

  const objects = nonEmptyRows.slice(1).map((row) => {
    const obj: Record<string, unknown> = {};
    rawHeaders.forEach((h, idx) => {
      obj[h] = row[idx] ?? '';
    });
    return obj;
  });

  const csvText = Papa.unparse(objects, { columns: rawHeaders });
  return { csvText, headers: rawHeaders };
}

function normalizeObjectsToCsv(rows: Record<string, unknown>[]): {
  csvText: string;
  headers: string[];
} {
  if (rows.length === 0) {
    throw new ConnectorValidationError(
      'Google Sheet returned 0 employee records.',
      400
    );
  }

  const headerSet = new Set<string>();
  for (const row of rows) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      for (const key of Object.keys(row)) {
        const trimmed = key.trim();
        if (trimmed) headerSet.add(trimmed);
      }
    }
  }
  const headers = Array.from(headerSet);
  if (headers.length < 2) {
    throw new ConnectorValidationError(
      'Google Sheet records must include at least 2 columns.',
      400
    );
  }

  const sanitizedRows = rows.map((row) => {
    const clean: Record<string, unknown> = {};
    for (const h of headers) {
      const val = row[h];
      if (val instanceof Date) {
        clean[h] = val.toISOString().slice(0, 10);
      } else if (val !== null && typeof val === 'object') {
        clean[h] = JSON.stringify(val);
      } else {
        clean[h] = val ?? '';
      }
    }
    return clean;
  });

  const csvText = Papa.unparse(sanitizedRows, { columns: headers });
  return { csvText, headers };
}

function extractCsvFromJsonPayload(parsed: unknown): {
  csvText: string;
  headers: string[];
} {
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      throw new ConnectorValidationError('Google Sheet returned an empty dataset.', 400);
    }
    if (Array.isArray(parsed[0])) {
      return normalizeGridToCsv(parsed as unknown[][]);
    }
    return normalizeObjectsToCsv(parsed as Record<string, unknown>[]);
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;

    if (
      obj.status === 'error' ||
      obj.ok === false ||
      obj.success === false ||
      typeof obj.error === 'string'
    ) {
      const remoteMessage =
        (typeof obj.message === 'string' && obj.message) ||
        (typeof obj.error === 'string' && obj.error) ||
        'Google Apps Script reported an error.';
      throw new ConnectorValidationError(remoteMessage, 422);
    }

    if (Array.isArray(obj.headers) && Array.isArray(obj.rows)) {
      return normalizeGridToCsv([obj.headers, ...obj.rows] as unknown[][]);
    }

    const candidateKeys = ['data', 'rows', 'employees', 'records', 'items', 'values', 'result'];
    for (const key of candidateKeys) {
      const candidate = obj[key];
      if (Array.isArray(candidate)) {
        if (candidate.length === 0) {
          throw new ConnectorValidationError(
            `Google Sheet "${key}" array is empty.`,
            400
          );
        }
        if (Array.isArray(candidate[0])) {
          return normalizeGridToCsv(candidate as unknown[][]);
        }
        return normalizeObjectsToCsv(candidate as Record<string, unknown>[]);
      }
    }
  }

  throw new ConnectorValidationError(
    'Unrecognized JSON structure from Google Sheet connector. Expected a row array or { data/rows/employees: [...] }.',
    422
  );
}

export async function fetchGoogleSheetDataset(rawUrl = DEFAULT_GOOGLE_SHEET_URL): Promise<{
  url: string;
  csvText: string;
  mapping: ColumnMapping;
}> {
  const validUrl = validateGoogleConnectorUrl(rawUrl);
  const { contentType, text } = await fetchWithAllowlistedRedirects(validUrl);
  const trimmed = text.trim();

  if (!trimmed) {
    throw new ConnectorValidationError('Google Sheet endpoint returned an empty response.', 422);
  }

  if (
    contentType.toLowerCase().includes('text/html') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<')
  ) {
    throw new ConnectorValidationError(
      'Google Apps Script returned an HTML page instead of JSON/CSV. Ensure the Web App is deployed with access set to "Anyone".',
      422
    );
  }

  let csvText = '';
  let headers: string[] = [];

  if (
    contentType.toLowerCase().includes('application/json') ||
    contentType.toLowerCase().includes('+json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[')
  ) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new ConnectorValidationError(
        'Google Sheet endpoint returned invalid JSON.',
        422
      );
    }
    const normalized = extractCsvFromJsonPayload(parsed);
    csvText = normalized.csvText;
    headers = normalized.headers;
  } else {
    const parsedCsv = Papa.parse<Record<string, string>>(trimmed, {
      header: true,
      skipEmptyLines: true,
    });
    headers = (parsedCsv.meta.fields ?? []).map((h) => h.trim()).filter(Boolean);
    if (headers.length < 2 || parsedCsv.data.length === 0) {
      throw new ConnectorValidationError(
        'Google Sheet CSV response does not contain valid headers and rows.',
        422
      );
    }
    csvText = trimmed;
  }

  const mapping = suggestColumnMapping(headers);
  if (!mapping.Attrition_Status) {
    throw new ConnectorValidationError(
      `Could not auto-detect an attrition target column in Google Sheet headers (${headers.join(', ')}). Include a column such as Attrition_Status, Attrition, Left, or Exited.`,
      422
    );
  }

  return {
    url: validUrl.toString(),
    csvText,
    mapping,
  };
}
