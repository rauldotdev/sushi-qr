import { describe, it, expect } from 'vitest';
import { menuService } from '../../src/customer/services/menuService.js';

describe('MenuService Unit Tests', () => {
  it('debe generar ETags deterministas a partir de la misma carga de datos', () => {
    const dataA = [{ id: '1', nombre: 'Nigiri' }];
    const dataB = [{ id: '1', nombre: 'Nigiri' }];
    const dataC = [{ id: '2', nombre: 'Sashimi' }];

    const etagA = menuService.generateEtag(dataA);
    const etagB = menuService.generateEtag(dataB);
    const etagC = menuService.generateEtag(dataC);

    expect(etagA).toBe(etagB);
    expect(etagA).not.toBe(etagC);
    expect(etagA).toMatch(/^"[0-9a-f]{64}"$/);
  });
});
