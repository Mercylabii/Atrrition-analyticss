import type { IncomingMessage, ServerResponse } from 'http';
import {
  handlePostResetDataset,
  methodNotAllowed,
  sendJson,
} from '../src/server/workspaceCore.ts';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST']);
    return;
  }

  try {
    const result = handlePostResetDataset();
    sendJson(res, result.status, result.body);
  } catch (err) {
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : 'Unexpected server error.',
    });
  }
}
