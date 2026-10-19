import { buildApp } from './app.mjs';

const options = {
  dataDir: process.env.KB_DATA_DIR,
  dbPath: process.env.KB_DB_PATH,
  host: process.env.KB_HOST,
  port: process.env.KB_PORT,
  webDist: process.env.KB_WEB_DIST,
  allowedOrigins: process.env.KB_ALLOWED_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean),
  releaseId: process.env.KB_RELEASE_ID,
  logger: true,
};

let app;
try {
  app = await buildApp(options);
  await app.listen({ host: app.kbConfig.host, port: app.kbConfig.port });
  const shutdown = async () => {
    try { await app.close(); process.exitCode = 0; }
    catch { process.exitCode = 1; }
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch (error) {
  // Operator-facing startup messages contain no request payload or credentials.
  console.error('Knowledge base startup failed:', error.message);
  if (app) await app.close();
  process.exitCode = 1;
}
