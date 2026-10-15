import { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../errors/appError.js';
import { customerSessionService } from '../../customer/services/customerSessionService.js';

export interface StaffTokenPayload {
  sub: string;
  restaurantId: string;
  nombre: string;
  email: string;
  rol: 'sala' | 'cocina' | 'admin';
  type: 'staff';
}

export interface CustomerTokenPayload {
  sub: string;
  sessionId: string;
  tableId: string;
  tariffId: string;
  comensales: number;
  type: 'customer';
}

declare module 'fastify' {
  interface FastifyRequest {
    staffUser?: StaffTokenPayload;
    customerSession?: {
      id: string;
      tableId: string;
      tariffId: string;
      comensales: number;
      inicio: string;
      duracionMaxMin: number;
      platosPorRonda: number;
      pausaEntreRondasS: number;
    };
  }
  interface FastifyInstance {
    authenticateStaff: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateCustomerSession: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function authenticateStaff(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    const payload = await request.jwtVerify<StaffTokenPayload>();
    if (!payload || payload.type !== 'staff') {
      throw new AppError('UNAUTHORIZED', 'Token de personal no válido', 401);
    }
    request.staffUser = payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('UNAUTHORIZED', 'Sesión no iniciada o token expirado', 401);
  }
}

export async function authenticateCustomerSession(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    const payload = await request.jwtVerify<CustomerTokenPayload>();
    if (!payload || payload.type !== 'customer') {
      throw new AppError('UNAUTHORIZED', 'Token de sesión de comensal no válido', 401);
    }

    // Validación activa en la base de datos: la mesa debe seguir abierta y dentro del tiempo límite
    const activeSession = await customerSessionService.validateActiveSession(payload.sessionId);
    request.customerSession = activeSession;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('UNAUTHORIZED', 'Sesión no válida o expirada', 401);
  }
}

export function authorizeRole(allowedRoles: ('sala' | 'cocina' | 'admin')[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.staffUser) {
      throw new AppError('UNAUTHORIZED', 'No autenticado', 401);
    }
    if (!allowedRoles.includes(request.staffUser.rol)) {
      throw new AppError('FORBIDDEN', 'Rol insuficiente para realizar esta acción', 403);
    }
  };
}
