import { describe, it, expect, vi } from 'vitest';
import { kitchenService } from '../../src/kitchen/services/kitchenService.js';
import { db } from '../../src/main/database/db.js';
import { AppError } from '../../src/common/errors/appError.js';
import { StaffTokenPayload } from '../../src/common/middleware/authMiddleware.js';

describe('KitchenService Unit Tests (Transiciones de Estado y Validaciones)', () => {
  const dummyStaff: StaffTokenPayload = {
    sub: 'staff-123',
    restaurantId: 'rest-123',
    nombre: 'Chef Juan',
    email: 'chef@sakura.es',
    rol: 'cocina',
    type: 'staff'
  };

  it('1. Debe lanzar 404 ORDER_LINE_NOT_FOUND si la comanda no existe', async () => {
    vi.spyOn(db, 'query').mockResolvedValueOnce({ rows: [] } as any);

    await expect(
      kitchenService.updateOrderLineStatus('non-existent-line', 'en_cocina', dummyStaff)
    ).rejects.toMatchObject({
      code: 'ORDER_LINE_NOT_FOUND',
      statusCode: 404
    });
  });

  it('2. Debe lanzar 422 INVALID_LINE_TRANSITION si la línea ya está servida', async () => {
    vi.spyOn(db, 'query').mockResolvedValueOnce({
      rows: [
        {
          id: 'line-servido',
          round_id: 'round-1',
          dish_id: 'dish-1',
          cantidad: 2,
          estado: 'servido',
          session_id: 'session-1',
          round_numero: 1,
          table_number: 1,
          nombre_es: 'Gyozas',
          nombre_en: 'Gyozas'
        }
      ]
    } as any);

    await expect(
      kitchenService.updateOrderLineStatus('line-servido', 'en_cocina', dummyStaff)
    ).rejects.toMatchObject({
      code: 'INVALID_LINE_TRANSITION',
      statusCode: 422
    });
  });

  it('3. Debe lanzar 422 INVALID_LINE_TRANSITION si la línea ya está cancelada', async () => {
    vi.spyOn(db, 'query').mockResolvedValueOnce({
      rows: [
        {
          id: 'line-cancelado',
          round_id: 'round-1',
          dish_id: 'dish-1',
          cantidad: 2,
          estado: 'cancelado',
          session_id: 'session-1',
          round_numero: 1,
          table_number: 1,
          nombre_es: 'Gyozas',
          nombre_en: 'Gyozas'
        }
      ]
    } as any);

    await expect(
      kitchenService.updateOrderLineStatus('line-cancelado', 'en_cocina', dummyStaff)
    ).rejects.toMatchObject({
      code: 'INVALID_LINE_TRANSITION',
      statusCode: 422
    });
  });

  it('4. Debe retornar directamente sin cambios si el estado es el mismo (idempotencia)', async () => {
    vi.spyOn(db, 'query').mockResolvedValueOnce({
      rows: [
        {
          id: 'line-en-cola',
          round_id: 'round-1',
          dish_id: 'dish-1',
          cantidad: 2,
          estado: 'en_cola',
          session_id: 'session-1',
          round_numero: 1,
          table_number: 1,
          nombre_es: 'Gyozas',
          nombre_en: 'Gyozas'
        }
      ]
    } as any);

    const result = await kitchenService.updateOrderLineStatus('line-en-cola', 'en_cola', dummyStaff);
    expect(result.estado).toBe('en_cola');
  });
});
