#!/usr/bin/env node
// Confere a configuracao local do SupportFlow sem revelar nenhum valor.
//
//   node scripts/conferir-config.mjs
//
// Mostra apenas o que esta definido e de onde vem. Nao imprime a connection
// string, a senha nem o segredo de assinatura.

import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { carregarEnv, origem, caminhoEnv } from './carregar-env.mjs';

carregarEnv();

const raizDoProjeto = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function linha(nome, valor, detalhe = '') {
  console.log(`  ${valor ? 'OK   ' : 'FALTA'} ${nome.padEnd(24)} ${detalhe}`);
}

let versionado = 'verificacao indisponivel';
try {
  const listados = execFileSync('git', ['ls-files', '.env'], {
    cwd: raizDoProjeto,
    encoding: 'utf8',
  }).trim();
  versionado = listados ? 'SIM — PROBLEMA' : 'nao (correto)';
} catch (erro) {
  console.error(`  (nao foi possivel checar o git: ${erro.message})`);
}

console.log('=== Configuracao local do SupportFlow ===\n');
console.log(`  Arquivo: ${caminhoEnv}`);
console.log(`  Existe: ${existsSync(caminhoEnv) ? 'sim' : 'nao'}`);
console.log(`  Versionado: ${versionado}\n`);

console.log('  Variaveis:');
linha('DATABASE_URL', Boolean(process.env.DATABASE_URL), origem('DATABASE_URL'));
linha('TEST_DATABASE_URL', Boolean(process.env.TEST_DATABASE_URL), origem('TEST_DATABASE_URL'));
linha('JWT_SECRET', Boolean(process.env.JWT_SECRET), origem('JWT_SECRET'));
linha(
  'ADMIN_BOOTSTRAP_EMAIL',
  Boolean(process.env.ADMIN_BOOTSTRAP_EMAIL),
  origem('ADMIN_BOOTSTRAP_EMAIL'),
);
linha(
  'ADMIN_BOOTSTRAP_PASSWORD',
  Boolean(process.env.ADMIN_BOOTSTRAP_PASSWORD),
  origem('ADMIN_BOOTSTRAP_PASSWORD'),
);
linha('DEMO_URL', Boolean(process.env.DEMO_URL), origem('DEMO_URL'));
linha('DEMO_PASSWORD', Boolean(process.env.DEMO_PASSWORD), origem('DEMO_PASSWORD'));

if (process.env.DATABASE_URL) {
  let formatoOk = false;
  let temSsl = false;
  let host = '';
  try {
    const url = new URL(process.env.DATABASE_URL);
    formatoOk = url.protocol.startsWith('postgres') && Boolean(url.hostname);
    temSsl = /sslmode=require/.test(process.env.DATABASE_URL);
    host = url.hostname;
  } catch (erro) {
    console.error(`  (nao foi possivel ler a connection string: ${erro.message})`);
  }
  console.log('\n  Connection string:');
  linha('formato postgres://', formatoOk, formatoOk ? 'ok' : 'formato invalido');
  linha('sslmode=require', temSsl, temSsl ? 'ok' : 'recomendado pelo Neon');
  linha('host', Boolean(host), host ? `${host.slice(0, 4)}***` : '');
  console.log('  (o restante da string nunca e mostrado)');
}

if (process.env.JWT_SECRET) {
  console.log('\n  JWT_SECRET:');
  linha(
    'minimo 32 caracteres',
    process.env.JWT_SECRET.length >= 32,
    `${process.env.JWT_SECRET.length} caracteres`,
  );
}

if (process.env.DEMO_PASSWORD) {
  console.log('\n  DEMO_PASSWORD:');
  linha(
    'minimo 12 caracteres',
    process.env.DEMO_PASSWORD.length >= 12,
    `${process.env.DEMO_PASSWORD.length} caracteres`,
  );
}

console.log('\n  Proximos passos:');
if (!process.env.DATABASE_URL) {
  console.log('    1. Pegue a connection string no painel do Neon (projeto "supportflow")');
  console.log('    2. Cole no arquivo .env local, na linha DATABASE_URL=');
  console.log('    3. Rode: npm run db:migrate --workspace=@supportflow/backend');
} else {
  console.log('    1. npm run db:migrate --workspace=@supportflow/backend');
  console.log('    2. npm run bootstrap:admin --workspace=@supportflow/backend');
  console.log('    3. npm run seed:demo');
}
