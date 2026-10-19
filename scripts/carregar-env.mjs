// Carrega a configuracao local de ambiente a partir do `.env` da raiz.
//
// O arquivo esta no .gitignore e nunca e versionado. Nenhum valor lido aqui
// e impresso: a funcao `origem()` devolve apenas de onde o valor veio.

import { config as loadEnv } from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raizDoProjeto = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const caminhoDoEnv = resolve(raizDoProjeto, '.env');

let carregado = false;

export function carregarEnv() {
  if (carregado) return;
  carregado = true;
  if (existsSync(caminhoDoEnv)) {
    loadEnv({ path: caminhoDoEnv, quiet: true });
  }
}

/** De onde vem o valor, sem revelar o valor. */
export function origem(chave) {
  carregarEnv();
  if (!process.env[chave]) return 'nao definida';
  const noArquivo =
    existsSync(caminhoDoEnv) &&
    readFileSync(caminhoDoEnv, 'utf8')
      .split(/\r?\n/)
      .some((linha) => linha.trim().startsWith(`${chave}=`));
  return noArquivo ? '.env local' : 'variavel de ambiente';
}

export const caminhoEnv = caminhoDoEnv;
