import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
loadEnv({ path: resolve(rootDir, '.env') });

const port = Number(process.env.PORT ?? 3000);
const developmentDatabaseUrl = process.env.DATABASE_URL;
const databaseUrl = process.env.VITEST
  ? (process.env.TEST_DATABASE_URL ?? deriveTestSchemaUrl(developmentDatabaseUrl))
  : developmentDatabaseUrl;
const jwtSecret =
  process.env.JWT_SECRET ??
  (process.env.VITEST ? 'test-secret-that-is-long-enough-to-pass-validation' : undefined);
const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? '1h';

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

if (process.env.VITEST && !isIsolatedTestStorage(developmentDatabaseUrl, databaseUrl)) {
  throw new Error('Tests require a database distinct from DATABASE_URL');
}

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters');
}

if (!/^\d+[smhd]$/.test(jwtExpiresIn)) {
  throw new Error('JWT_EXPIRES_IN must use a duration such as 15m, 1h, or 7d');
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

export const env = {
  port,
  databaseUrl,
  jwtSecret,
  jwtExpiresIn,
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const;

export const bootstrapEnv = {
  name: process.env.ADMIN_BOOTSTRAP_NAME,
  email: process.env.ADMIN_BOOTSTRAP_EMAIL,
  password: process.env.ADMIN_BOOTSTRAP_PASSWORD,
} as const;

function deriveTestSchemaUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const url = new URL(value);
  url.searchParams.set('options', '-c search_path=supportflow_test');
  return url.toString();
}

function isIsolatedTestStorage(developmentValue: string | undefined, testValue: string): boolean {
  if (!developmentValue) {
    return false;
  }

  const development = new URL(developmentValue);
  const test = new URL(testValue);
  const sameDatabase =
    development.protocol === test.protocol &&
    development.hostname === test.hostname &&
    development.port === test.port &&
    development.pathname === test.pathname;

  if (!sameDatabase) {
    return true;
  }

  const isolatedSearchPath = /^-c\s+search_path=([A-Za-z_][A-Za-z0-9_]*)$/.exec(
    (test.searchParams.get('options') ?? '').trim(),
  );
  return isolatedSearchPath !== null && isolatedSearchPath[1] !== 'public';
}
