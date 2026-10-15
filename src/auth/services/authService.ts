import argon2 from 'argon2';
import { db } from '../../main/database/db.js';
import { AppError } from '../../common/errors/appError.js';
import { LoginDto } from '../dtos/login.dto.js';

export interface StaffUserPayload {
  id: string;
  restaurant_id: string;
  nombre: string;
  email: string;
  rol: 'sala' | 'cocina' | 'admin';
}

export class AuthService {
  /**
   * Hashea una contraseña en texto plano utilizando Argon2id
   */
  public async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4
    });
  }

  /**
   * Verifica una contraseña en texto plano contra un hash Argon2id
   */
  public async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /**
   * Autentica a un miembro del personal
   */
  public async authenticate(dto: LoginDto): Promise<StaffUserPayload> {
    const { rows } = await db.query(
      `SELECT id, restaurant_id, nombre, email, rol, password_hash, activo 
       FROM staff_user 
       WHERE email = $1`,
      [dto.email.toLowerCase()]
    );

    const user = rows[0];
    if (!user || !user.activo) {
      throw new AppError('INVALID_CREDENTIALS', 'Credenciales no válidas', 401);
    }

    const isValid = await this.verifyPassword(user.password_hash, dto.password);
    if (!isValid) {
      throw new AppError('INVALID_CREDENTIALS', 'Credenciales no válidas', 401);
    }

    return {
      id: user.id,
      restaurant_id: user.restaurant_id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol
    };
  }
}

export const authService = new AuthService();
