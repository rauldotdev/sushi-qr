import { describe, it, expect } from 'vitest';
import { authService } from '../../src/auth/services/authService.js';

describe('AuthService Unit Tests (Argon2id)', () => {
  it('debe hashear una contraseña con Argon2id y verificarla correctamente', async () => {
    const plain = 'ContraseñaSecreta2026!';
    const hash = await authService.hashPassword(plain);

    expect(hash).toBeDefined();
    expect(hash).toContain('$argon2id$');

    const isValid = await authService.verifyPassword(hash, plain);
    expect(isValid).toBe(true);

    const isInvalid = await authService.verifyPassword(hash, 'ContraseñaErronea');
    expect(isInvalid).toBe(false);
  });

  it('debe autenticar exitosamente a un usuario del seed con sus credenciales correctas', async () => {
    const user = await authService.authenticate({
      email: 'waiter@sakura.es',
      password: 'Sakura2026!'
    });

    expect(user).toBeDefined();
    expect(user.email).toBe('waiter@sakura.es');
    expect(user.rol).toBe('sala');
  });

  it('debe rechazar la autenticación si la contraseña es incorrecta con código INVALID_CREDENTIALS', async () => {
    await expect(
      authService.authenticate({
        email: 'waiter@sakura.es',
        password: 'PasswordIncorrecto'
      })
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      statusCode: 401
    });
  });
});
