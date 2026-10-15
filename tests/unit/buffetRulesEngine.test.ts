import { describe, it, expect } from 'vitest';
import { buffetRulesEngine, BuffetSessionContext, DishValidationContext, PreviousRoundContext } from '../../src/orders/services/buffetRulesEngine.js';
import { AppError } from '../../src/common/errors/appError.js';

describe('BuffetRulesEngine Unit Tests (100% Reglas de Negocio)', () => {
  const baseSession: BuffetSessionContext = {
    sessionId: 'session-123',
    inicio: new Date(Date.now() - 10 * 60 * 1000), // Empezó hace 10 min
    comensales: 2,
    duracionMaxMin: 90,
    platosPorRonda: 6, // Máx 2 * 6 = 12 platos por ronda
    pausaEntreRondasS: 300 // 5 min cooldown
  };

  const defaultDishesMap = new Map<string, DishValidationContext>([
    ['dish-salmon', { id: 'dish-salmon', activo: true, limitePorRonda: 3, isInTariff: true }],
    ['dish-gyoza', { id: 'dish-gyoza', activo: true, limitePorRonda: 2, isInTariff: true }],
    ['dish-unavail', { id: 'dish-unavail', activo: false, limitePorRonda: 2, isInTariff: true }],
    ['dish-not-tariff', { id: 'dish-not-tariff', activo: true, limitePorRonda: 2, isInTariff: false }]
  ]);

  function expectBuffetError(fn: () => void, expectedCode: string, expectedStatus: number) {
    try {
      fn();
      expect.unreachable('Debería haber lanzado un AppError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe(expectedCode);
      expect(err.statusCode).toBe(expectedStatus);
    }
  }

  it('1. Debe aceptar un pedido válido que cumpla todas las reglas', () => {
    expect(() => {
      buffetRulesEngine.validate(
        [
          { dish_id: 'dish-salmon', cantidad: 3 },
          { dish_id: 'dish-gyoza', cantidad: 2 }
        ],
        baseSession,
        defaultDishesMap,
        null
      );
    }).not.toThrow();
  });

  it('2. ROUND_LIMIT: Debe lanzar 422 si el total de platos supera comensales * platosPorRonda', () => {
    expectBuffetError(() => {
      buffetRulesEngine.validate(
        [
          { dish_id: 'dish-salmon', cantidad: 3 },
          { dish_id: 'dish-gyoza', cantidad: 10 } // Total 13 > 12
        ],
        baseSession,
        defaultDishesMap,
        null
      );
    }, 'ROUND_LIMIT', 422);
  });

  it('3. DISH_LIMIT: Debe lanzar 422 si se supera el límite individual del plato', () => {
    expectBuffetError(() => {
      buffetRulesEngine.validate(
        [{ dish_id: 'dish-gyoza', cantidad: 3 }], // Límite es 2
        baseSession,
        defaultDishesMap,
        null
      );
    }, 'DISH_LIMIT', 422);
  });

  it('4. DISH_NOT_IN_TARIFF: Debe lanzar 422 si el plato no está en la tarifa del cliente', () => {
    expectBuffetError(() => {
      buffetRulesEngine.validate(
        [{ dish_id: 'dish-not-tariff', cantidad: 1 }],
        baseSession,
        defaultDishesMap,
        null
      );
    }, 'DISH_NOT_IN_TARIFF', 422);
  });

  it('5. DISH_UNAVAILABLE: Debe lanzar 422 si el plato está agotado o inactivo', () => {
    expectBuffetError(() => {
      buffetRulesEngine.validate(
        [{ dish_id: 'dish-unavail', cantidad: 1 }],
        baseSession,
        defaultDishesMap,
        null
      );
    }, 'DISH_UNAVAILABLE', 422);
  });

  it('6. ROUND_PENDING: Debe lanzar 422 si la ronda anterior aún tiene platos sin servir', () => {
    const lastRoundWithPending: PreviousRoundContext = {
      createdAt: new Date(Date.now() - 400 * 1000), // Hace 400s (cooldown superado)
      hasUnservedLines: true
    };

    expectBuffetError(() => {
      buffetRulesEngine.validate(
        [{ dish_id: 'dish-salmon', cantidad: 2 }],
        baseSession,
        defaultDishesMap,
        lastRoundWithPending
      );
    }, 'ROUND_PENDING', 422);
  });

  it('7. ROUND_COOLDOWN: Debe lanzar 422 si no ha terminado la pausa entre rondas', () => {
    const lastRoundRecent: PreviousRoundContext = {
      createdAt: new Date(Date.now() - 100 * 1000), // Hace 100s, faltan 200s
      hasUnservedLines: false
    };

    expectBuffetError(() => {
      buffetRulesEngine.validate(
        [{ dish_id: 'dish-salmon', cantidad: 2 }],
        baseSession,
        defaultDishesMap,
        lastRoundRecent
      );
    }, 'ROUND_COOLDOWN', 422);
  });

  it('8. SESSION_EXPIRED: Debe lanzar 409 si la sesión ha superado la duración máxima', () => {
    const expiredSession: BuffetSessionContext = {
      ...baseSession,
      inicio: new Date(Date.now() - 100 * 60 * 1000) // Empezó hace 100 min (máx 90)
    };

    expectBuffetError(() => {
      buffetRulesEngine.validate(
        [{ dish_id: 'dish-salmon', cantidad: 2 }],
        expiredSession,
        defaultDishesMap,
        null
      );
    }, 'SESSION_EXPIRED', 409);
  });
});
