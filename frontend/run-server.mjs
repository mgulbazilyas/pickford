import express from 'express';
import { handler as ssrHandler } from './dist/server/entry.mjs';

const app = express();

// Force enable console logging regardless of NODE_ENV
if (process.env.NODE_ENV === 'production') {
  console.log('=== FRONTEND SERVER STARTING IN PRODUCTION MODE ===');
  console.log('Console logging is explicitly enabled');
  console.log('Environment variables:', {
    NODE_ENV: process.env.NODE_ENV,
    DEBUG: process.env.DEBUG,
    LOG_LEVEL: process.env.LOG_LEVEL,
    PORT: 8080
  });
}

// Change this based on your astro.config.mjs, `base` option.
// They should match. The default value is "/".
const base = '/';
app.use(base, express.static('dist/client/'));
app.use(ssrHandler);

app.listen(8080, () => {
  console.log('Frontend server is running on port 8080');
});