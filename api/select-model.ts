import type { IncomingMessage, ServerResponse } from 'http';
import {
  handlePostSelectModel,
  HttpRequestError,
  methodNotAllowed,
  readJsonBody,
  sendJson,
} from '../src/server/workspaceCore.ts';

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
) {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST']);
    return;
  }

  try {
    const body = await readJsonBody(req);
    const result = handlePostSelectModel(body);
    sendJson(res, result.status, result.body);
  } catch (err) {
    if (err instanceof HttpRequestError) {
      sendJson(res, err.status, { error: err.message });
      return;
    }
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : 'Unexpected server error.',
    });
  }
}
