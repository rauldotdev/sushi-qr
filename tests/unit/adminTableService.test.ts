import { describe, it, expect } from 'vitest';
import { adminTableService } from '../../src/admin/services/adminTableService.js';

describe('AdminTableService Unit Tests', () => {
  it('debe generar tokens QR aleatorios de al menos 128 bits (64 caracteres hex / 256 bits)', () => {
    const token1 = adminTableService.generateQrToken();
    const token2 = adminTableService.generateQrToken();

    expect(token1).toHaveLength(64);
    expect(token2).toHaveLength(64);
    expect(token1).not.toBe(token2);
    // Solo caracteres hexadecimales válidos
    expect(token1).toMatch(/^[0-9a-f]{64}$/);
  });
});
