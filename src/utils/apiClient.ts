import type { CustomDatasetContext } from '../shared/types.ts';

export class ApiError extends Error {
  status: number;
  endpoint: string;
  code?: string;

  constructor(message: string, status: number, endpoint: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.endpoint = endpoint;
    this.code = code;
  }
}

export async function fetchJson<T>(
  endpoint: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(endpoint, { ...init, cache: init.cache ?? 'no-store', headers });
  } catch (err) {
    console.error('[API Network Error]', {
      endpoint,
      method: init.method ?? 'GET',
      error: err instanceof Error ? err.message : String(err),
    });
    throw new ApiError(
      `Network error while contacting ${endpoint}. Please check your connection and try again.`,
      0,
      endpoint
    );
  }

  const contentType = res.headers.get('content-type') ?? '';
  const isJsonContentType =
    contentType.toLowerCase().includes('application/json') ||
    contentType.toLowerCase().includes('+json');

  const rawText = await res.text();

  if (!isJsonContentType) {
    const snippet = rawText.replace(/\s+/g, ' ').trim().slice(0, 140);
    console.error('[API Non-JSON Response]', {
      endpoint,
      method: init.method ?? 'GET',
      status: res.status,
      statusText: res.statusText,
      contentType: contentType || '(none)',
      bodySnippet: snippet,
    });

    if (res.status === 404) {
      throw new ApiError(
        `API endpoint ${endpoint} returned HTTP 404 (Not Found). Verify that backend API routes are deployed.`,
        res.status,
        endpoint
      );
    }

    if (res.status === 413) {
      throw new ApiError(
        `Request to ${endpoint} exceeded the server payload size limit (HTTP 413).`,
        res.status,
        endpoint
      );
    }

    throw new ApiError(
      res.ok
        ? `Unexpected non-JSON response from ${endpoint} (${contentType || 'unknown content-type'}).`
        : `Request to ${endpoint} failed with HTTP ${res.status}${res.statusText ? ` (${res.statusText})` : ''}.`,
      res.status,
      endpoint
    );
  }

  let parsed: unknown = null;
  if (rawText.trim().length > 0) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error('[API Invalid JSON]', {
        endpoint,
        method: init.method ?? 'GET',
        status: res.status,
        contentType,
        bodySnippet: rawText.slice(0, 140),
      });
      throw new ApiError(
        `Received malformed JSON from ${endpoint} (HTTP ${res.status}).`,
        res.status,
        endpoint
      );
    }
  }

  if (!res.ok) {
    const errObj =
      parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    const message =
      (typeof errObj?.error === 'string' && errObj.error) ||
      (typeof errObj?.message === 'string' && errObj.message) ||
      `Request to ${endpoint} failed with HTTP ${res.status}.`;
    const code = typeof errObj?.code === 'string' ? errObj.code : undefined;

    if (code !== 'DATASET_REHYDRATE_REQUIRED') {
      const logFn = res.status >= 500 ? console.error : console.warn;
      logFn('[API Error Response]', {
        endpoint,
        method: init.method ?? 'GET',
        status: res.status,
        code,
        error: message,
      });
    }

    throw new ApiError(message, res.status, endpoint, code);
  }

  return parsed as T;
}

export async function postWithDatasetRehydrate<T>(
  endpoint: string,
  payload: Record<string, unknown>,
  customDataset: CustomDatasetContext | null
): Promise<T> {
  const bodyWithHash = customDataset?.datasetHash
    ? { ...payload, datasetHash: customDataset.datasetHash }
    : payload;

  try {
    return await fetchJson<T>(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyWithHash),
    });
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.status === 409 &&
      err.code === 'DATASET_REHYDRATE_REQUIRED' &&
      customDataset
    ) {
      return await fetchJson<T>(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bodyWithHash,
          customDataset: {
            csvText: customDataset.csvText,
            mapping: customDataset.mapping,
            source: customDataset.source,
            googleSheetUrl: customDataset.googleSheetUrl,
          },
        }),
      });
    }
    throw err;
  }
}
