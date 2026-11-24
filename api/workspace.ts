import type { IncomingMessage, ServerResponse } from 'http';
import {
  handleGetWorkspace,
  methodNotAllowed,
  sendJson,
} from '../src/server/workspaceCore.ts';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  try {
    const result = await handleGetWorkspace();
    sendJson(res, result.status, result.body);
  } catch (err) {
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : 'Unexpected server error.',
    });
  }
}
