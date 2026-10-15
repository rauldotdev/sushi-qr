import { AppError } from '../../common/errors/appError.js';
import { OrderItemDto } from '../dtos/createOrder.dto.js';

export interface BuffetSessionContext {
  sessionId: string;
  inicio: Date | string;
  comensales: number;
  duracionMaxMin: number;
  platosPorRonda: number;
  pausaEntreRondasS: number;
}

export interface DishValidationContext {
  id: string;
  activo: boolean;
  limitePorRonda: number;
  isInTariff: boolean;
}

export interface PreviousRoundContext {
  createdAt: Date | string;
  hasUnservedLines: boolean;
}

export class BuffetRulesEngine {
  /**
   * Valida todas las reglas anti-abuso del buffet.
   * Lanza AppError con código HTTP 422 o 409 si incumple alguna regla.
   */
  public validate(
    items: OrderItemDto[],
    session: BuffetSessionContext,
    dishesMap: Map<string, DishValidationContext>,
    lastRound: PreviousRoundContext | null,
    now: Date = new Date()
  ): void {
    const currentTime = now.getTime();
    const sessionStartTime = new Date(session.inicio).getTime();

    // 1. Duración máxima de la sesión (409 SESSION_EXPIRED)
    const elapsedMinutes = (currentTime - sessionStartTime) / (1000 * 60);
    if (elapsedMinutes >= session.duracionMaxMin) {
      throw new AppError('SESSION_EXPIRED', 'El tiempo límite del buffet ha expirado', 409);
    }

    // 2. Ronda pendiente anterior (422 ROUND_PENDING)
    if (lastRound && lastRound.hasUnservedLines) {
      throw new AppError(
        'ROUND_PENDING',
        'Hay platos de la ronda anterior aún en cocina. Deben servirse antes de pedir la siguiente ronda.',
        422
      );
    }

    // 3. Pausa entre rondas / Cooldown (422 ROUND_COOLDOWN)
    if (lastRound) {
      const lastRoundTime = new Date(lastRound.createdAt).getTime();
      const elapsedSeconds = Math.floor((currentTime - lastRoundTime) / 1000);
      const remainingSeconds = session.pausaEntreRondasS - elapsedSeconds;

      if (remainingSeconds > 0) {
        throw new AppError(
          'ROUND_COOLDOWN',
          `Debes esperar antes de pedir la siguiente ronda. Segundos restantes: ${remainingSeconds}`,
          422,
          { segundosRestantes: remainingSeconds }
        );
      }
    }

    // 4. Límite total de platos por ronda (422 ROUND_LIMIT)
    const maxDishesAllowed = session.comensales * session.platosPorRonda;
    const totalDishesOrdered = items.reduce((sum, item) => sum + item.cantidad, 0);

    if (totalDishesOrdered > maxDishesAllowed) {
      throw new AppError(
        'ROUND_LIMIT',
        `Has superado el límite de platos para esta ronda. Máximo permitido: ${maxDishesAllowed} (${session.comensales} comensales × ${session.platosPorRonda} platos). Pedidos: ${totalDishesOrdered}`,
        422,
        { maxPermitido: maxDishesAllowed, pedidos: totalDishesOrdered }
      );
    }

    // 5. Validaciones individuales de cada plato
    for (const item of items) {
      const dish = dishesMap.get(item.dish_id);

      if (!dish) {
        throw new AppError('DISH_NOT_FOUND', `Plato con ID ${item.dish_id} no existe`, 404);
      }

      // Plato en tarifa (422 DISH_NOT_IN_TARIFF)
      if (!dish.isInTariff) {
        throw new AppError('DISH_NOT_IN_TARIFF', `El plato ${item.dish_id} no está incluido en tu tarifa`, 422);
      }

      // Plato activo/agotado (422 DISH_UNAVAILABLE)
      if (!dish.activo) {
        throw new AppError('DISH_UNAVAILABLE', `El plato ${item.dish_id} está agotado temporalmente`, 422);
      }

      // Límite por plato y ronda (422 DISH_LIMIT)
      if (item.cantidad > dish.limitePorRonda) {
        throw new AppError(
          'DISH_LIMIT',
          `Has superado el límite de unidades para este plato en una ronda (Máx: ${dish.limitePorRonda})`,
          422,
          { dishId: item.dish_id, limite: dish.limitePorRonda, solicitados: item.cantidad }
        );
      }
    }
  }
}

export const buffetRulesEngine = new BuffetRulesEngine();
