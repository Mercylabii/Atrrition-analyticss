import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  getOrInitStateWithConnector,
  handleGetWorkspace,
  handlePostPredict,
  handlePostResetDataset,
  handlePostSelectModel,
  handlePostSyncGoogleSheet,
  handlePostUpload,
} from './src/server/workspaceCore.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

  // Ensure JSON parse / payload errors on /api/* return JSON rather than Express HTML error pages
  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (req.path.startsWith('/api/') && err) {
        const status =
          typeof (err as { status?: unknown }).status === 'number'
            ? (err as { status: number }).status
            : 400;
        const message =
          err instanceof Error ? err.message : 'Invalid JSON request payload.';
        res.status(status).json({ error: message });
        return;
      }
      next(err);
    }
  );

  // Warm up Google Sheet connector (with automatic local CSV fallback) on server boot
  void getOrInitStateWithConnector();

  app.get('/api/workspace', async (_req, res) => {
    const result = await handleGetWorkspace();
    res.setHeader('Cache-Control', 'no-store');
    res.status(result.status).json(result.body);
  });

  app.post('/api/sync-google-sheet', async (req, res) => {
    const result = await handlePostSyncGoogleSheet(req.body);
    res.setHeader('Cache-Control', 'no-store');
    res.status(result.status).json(result.body);
  });

  app.post('/api/predict', (req, res) => {
    const result = handlePostPredict(req.body);
    res.setHeader('Cache-Control', 'no-store');
    res.status(result.status).json(result.body);
  });

  app.post('/api/select-model', (req, res) => {
    const result = handlePostSelectModel(req.body);
    res.setHeader('Cache-Control', 'no-store');
    res.status(result.status).json(result.body);
  });

  app.post('/api/upload', (req, res) => {
    const result = handlePostUpload(req.body);
    res.setHeader('Cache-Control', 'no-store');
    res.status(result.status).json(result.body);
  });

  app.post('/api/reset-dataset', (_req, res) => {
    const result = handlePostResetDataset();
    res.setHeader('Cache-Control', 'no-store');
    res.status(result.status).json(result.body);
  });

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Meridian Attrition Analytics running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
