import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { type Options as RateLimitOptions } from 'express-rate-limit';

/**
 * Origens permitidas para o frontend.
 *
 * Configuravel por `ALLOWED_ORIGINS` (lista separada por virgula). O padrao de
 * desenvolvimento e o endereco do Vite.
 */
export function parseAllowedOrigins(value: string | undefined): string[] {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : ['http://localhost:5173'];
}

export const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

/**
 * Opcoes do CORS.
 *
 * A autenticacao usa JWT via header `Authorization` (Bearer), nao cookies.
 * Por isso `Access-Control-Allow-Credentials` NAO e tecnico-necessario hoje.
 * Mantemos `credentials: false` por padrao para reduzir a superficie: com
 * credenciais ligadas e uma origem refletida, um futuro bug de reflexao de
 * origem permitiria requisicoes autenticadas por cookie. Caso o projeto passe
 * a usar cookies httpOnly, basta ligar `credentials: true` de forma explicita.
 */
export const corsOptions: cors.CorsOptions = {
  origin: allowedOrigins,
  credentials: false,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      // A API responde JSON; nenhuma origem precisa carregar recursos dela.
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
});

/**
 * Rate limiting das rotas de autenticacao.
 *
 * Fica em modulo proprio para poder ser instanciado com opcoes de teste e
 * provar, de verdade, o comportamento (200 -> 429 -> recuperacao) em vez de
 * apenas checar que o middleware esta registrado.
 *
 * `trustProxy` e resolvido pelo Express (`app.set('trust proxy', ...)`). Em
 * producao, atras de proxy (Render/Vercel), confiar em 1 hop evita que todos
 * os clientes compartilhem o mesmo IP. Nunca confiar em `true` com proxy
 * aberto, sob risco de spoofing de `X-Forwarded-For`.
 */
export function createAuthRateLimiter(overrides: Partial<RateLimitOptions> = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Muitas tentativas. Tente novamente mais tarde.',
      },
    },
    ...overrides,
  });
}

/** Limiter de producao usado pelas rotas de auth. */
export const authRateLimiter = createAuthRateLimiter();
