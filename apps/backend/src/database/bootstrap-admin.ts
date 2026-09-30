import { bootstrapEnv } from '../config/env.js';
import { pool } from './pool.js';
import {
  createUser,
  findAnyAdmin,
  findUserByEmail,
  updateUser,
} from '../repositories/users.repository.js';
import { hashPassword } from '../services/password.service.js';
import { normalizeEmail, validateName, validatePassword } from '../validation/users.validation.js';

async function bootstrapAdmin(): Promise<void> {
  if (!bootstrapEnv.name || !bootstrapEnv.email || !bootstrapEnv.password) {
    throw new Error(
      'ADMIN_BOOTSTRAP_NAME, ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD are required',
    );
  }

  const name = validateName(bootstrapEnv.name);
  const email = normalizeEmail(bootstrapEnv.email);
  const password = validatePassword(bootstrapEnv.password);
  const existingUser = await findUserByEmail(email);
  const existingAdmin = await findAnyAdmin();

  if (existingUser) {
    if (existingUser.role !== 'admin' && existingAdmin) {
      throw new Error('An administrator is already configured; bootstrap was not changed');
    }

    if (existingUser.role !== 'admin' || !existingUser.is_active) {
      await updateUser(existingUser.id, { role: 'admin', isActive: true });
      console.log(`Bootstrap admin already exists and was activated: ${email}`);
    } else {
      console.log(`Bootstrap admin already exists: ${email}`);
    }

    return;
  }

  if (existingAdmin) {
    throw new Error('An administrator is already configured; bootstrap was not changed');
  }

  await createUser({
    name,
    email,
    passwordHash: await hashPassword(password),
    role: 'admin',
  });

  console.log(`Bootstrap admin created: ${email}`);
}

bootstrapAdmin()
  .catch((error: unknown) => {
    console.error('Admin bootstrap failed');
    process.exitCode = 1;

    if (error instanceof Error && error.message) {
      console.error(error.message);
    }
  })
  .finally(async () => {
    await pool.end();
  });
