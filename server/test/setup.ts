// The env module validates required vars at import time and exits if missing.
// Provide safe test defaults before any source module loads.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';
process.env.ACCESS_TOKEN_SECRET = 'test-secret-value-that-is-at-least-32-characters-long';
process.env.EMBEDDING_PROVIDER = 'dev';
process.env.LLM_PROVIDER = 'dev';
