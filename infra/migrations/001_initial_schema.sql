-- 001_initial_schema.sql
-- Extensiones para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Restaurante
CREATE TABLE IF NOT EXISTS restaurant (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100) NOT NULL,
    zona_horaria VARCHAR(50) NOT NULL DEFAULT 'Europe/Madrid',
    configuracion JSONB NOT NULL DEFAULT '{}',
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Mesas
CREATE TABLE IF NOT EXISTS "table" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
    numero INT NOT NULL,
    qr_token VARCHAR(64) UNIQUE NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_table_numero UNIQUE (restaurant_id, numero)
);

-- 3. Tarifas de Buffet
CREATE TABLE IF NOT EXISTS tariff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100) NOT NULL,
    precio NUMERIC(10,2) NOT NULL,
    duracion_max_min INT NOT NULL DEFAULT 100,
    platos_por_ronda INT NOT NULL DEFAULT 8,
    pausa_entre_rondas_s INT NOT NULL DEFAULT 600,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Categorías de Platos
CREATE TABLE IF NOT EXISTS category (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_es VARCHAR(100) NOT NULL,
    nombre_en VARCHAR(100) NOT NULL,
    orden INT NOT NULL DEFAULT 0,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Platos
CREATE TABLE IF NOT EXISTS dish (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES category(id) ON DELETE RESTRICT,
    nombre_es VARCHAR(100) NOT NULL,
    nombre_en VARCHAR(100) NOT NULL,
    descripcion_es TEXT,
    descripcion_en TEXT,
    imagen VARCHAR(255),
    alergenos JSONB NOT NULL DEFAULT '[]',
    limite_por_ronda INT NOT NULL DEFAULT 2,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Relación Tarifa y Platos
CREATE TABLE IF NOT EXISTS tariff_dish (
    tariff_id UUID NOT NULL REFERENCES tariff(id) ON DELETE CASCADE,
    dish_id UUID NOT NULL REFERENCES dish(id) ON DELETE CASCADE,
    PRIMARY KEY (tariff_id, dish_id)
);

-- 7. Sesiones de Mesa
CREATE TABLE IF NOT EXISTS table_session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES "table"(id) ON DELETE CASCADE,
    tariff_id UUID NOT NULL REFERENCES tariff(id) ON DELETE RESTRICT,
    comensales INT NOT NULL DEFAULT 1,
    inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fin TIMESTAMPTZ,
    estado VARCHAR(20) NOT NULL DEFAULT 'abierta',
    session_token_hash VARCHAR(128) NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Rondas de Pedidos
CREATE TABLE IF NOT EXISTS order_round (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES table_session(id) ON DELETE CASCADE,
    numero INT NOT NULL,
    idempotency_key VARCHAR(64) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'en_cola',
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_session_idempotency UNIQUE(session_id, idempotency_key)
);

-- 9. Líneas de Pedido
CREATE TABLE IF NOT EXISTS order_line (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES order_round(id) ON DELETE CASCADE,
    dish_id UUID NOT NULL REFERENCES dish(id) ON DELETE RESTRICT,
    cantidad INT NOT NULL DEFAULT 1,
    estado VARCHAR(20) NOT NULL DEFAULT 'en_cola',
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Usuarios del Personal
CREATE TABLE IF NOT EXISTS staff_user (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    rol VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Registro de Auditoría
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor VARCHAR(100) NOT NULL,
    accion VARCHAR(50) NOT NULL,
    entidad VARCHAR(50) NOT NULL,
    entidad_id UUID,
    detalles JSONB NOT NULL DEFAULT '{}',
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de Rendimiento
CREATE INDEX IF NOT EXISTS idx_table_qr_token ON "table" (qr_token);
CREATE INDEX IF NOT EXISTS idx_table_session_table ON table_session (table_id, estado);
CREATE INDEX IF NOT EXISTS idx_order_round_session ON order_round (session_id);
CREATE INDEX IF NOT EXISTS idx_order_line_round_estado ON order_line (round_id, estado);
CREATE INDEX IF NOT EXISTS idx_staff_user_restaurant_rol ON staff_user (restaurant_id, rol);
