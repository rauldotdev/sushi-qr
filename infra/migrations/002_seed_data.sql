-- 002_seed_data.sql
-- Datos iniciales para pruebas locales y desarrollo

-- 1. Restaurante
INSERT INTO restaurant (id, nombre, zona_horaria, configuracion)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Sakura Sushi Gourmet',
    'Europe/Madrid',
    '{"moneda": "EUR", "alérgenos_activos": ["gluten", "crustaceos", "pescado", "soja", "sesamo"]}'
) ON CONFLICT DO NOTHING;

-- 2. Tarifas
INSERT INTO tariff (id, nombre, precio, duracion_max_min, platos_por_ronda, pausa_entre_rondas_s, activo)
VALUES 
(
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    'Buffet Mediodía',
    19.95,
    90,
    6,
    480,
    true
),
(
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    'Buffet Noche & Fin de Semana',
    27.95,
    120,
    8,
    600,
    true
) ON CONFLICT DO NOTHING;

-- 3. Mesas con QR Token seguro (Hex de 64 caracteres)
INSERT INTO "table" (id, restaurant_id, numero, qr_token)
VALUES
(
    'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a41',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    1,
    '7f8c9d0e1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d'
),
(
    'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a42',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    2,
    '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b'
),
(
    'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a43',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    3,
    '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d'
) ON CONFLICT DO NOTHING;

-- 4. Categorías
INSERT INTO category (id, nombre_es, nombre_en, orden)
VALUES
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a51', 'Entrantes', 'Starters', 1),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a52', 'Nigiri & Gunkan', 'Nigiri & Gunkan', 2),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a53', 'Maki & Rolls', 'Maki & Rolls', 3),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a54', 'Postres', 'Desserts', 4)
ON CONFLICT DO NOTHING;

-- 5. Platos
INSERT INTO dish (id, category_id, nombre_es, nombre_en, descripcion_es, descripcion_en, imagen, alergenos, limite_por_ronda, activo)
VALUES
(
    'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a61',
    'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a51',
    'Edamame al Vapor',
    'Steamed Edamame',
    'Vainas de soja tierna con sal marina en escamas',
    'Tender steamed soybean pods seasoned with sea salt flakes',
    '/images/dishes/edamame.webp',
    '["soja"]',
    2,
    true
),
(
    'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a62',
    'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a51',
    'Gyozas de Pollo y Verduras (3 uds)',
    'Chicken & Veg Gyoza (3 pcs)',
    'Empanadillas japonesas a la plancha con salsa ponzu',
    'Pan-seared Japanese dumplings with citrus ponzu sauce',
    '/images/dishes/gyoza.webp',
    '["gluten", "soja", "sesamo"]',
    2,
    true
),
(
    'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a63',
    'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a52',
    'Nigiri de Salmón Noruego (2 uds)',
    'Norwegian Salmon Nigiri (2 pcs)',
    'Salmón fresco sobre arroz avinagrado artesanal',
    'Fresh premium salmon over handcrafted seasoned sushi rice',
    '/images/dishes/nigiri-salmon.webp',
    '["pescado"]',
    3,
    true
),
(
    'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a64',
    'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a52',
    'Nigiri de Atún Rojo Flameado (2 uds)',
    'Torched Bluefin Tuna Nigiri (2 pcs)',
    'Atún rojo soasado con mayonesa japonesa trufada',
    'Lightly torched bluefin tuna with truffle japanese mayo',
    '/images/dishes/nigiri-tuna.webp',
    '["pescado", "soja", "huevo"]',
    2,
    true
),
(
    'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a65',
    'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a53',
    'California Roll (4 uds)',
    'California Roll (4 pcs)',
    'Cangrejo real, aguacate, pepino y huevas tobiko',
    'King crab, avocado, cucumber and tobiko roe',
    '/images/dishes/california-roll.webp',
    '["crustaceos", "pescado", "sesamo"]',
    2,
    true
),
(
    'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66',
    'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a53',
    'Dragon Roll Tempura (4 uds)',
    'Crispy Dragon Roll (4 pcs)',
    'Langostino tempurizado recubierto de aguacate y unagi',
    'Tempura shrimp roll wrapped with avocado and eel sauce',
    '/images/dishes/dragon-roll.webp',
    '["crustaceos", "gluten", "soja"]',
    2,
    true
),
(
    'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a67',
    'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a54',
    'Mochi de Té Verde Matcha (1 ud)',
    'Matcha Green Tea Mochi (1 pc)',
    'Pastel tradicional de arroz relleno de helado de matcha',
    'Traditional rice cake filled with artisanal matcha ice cream',
    '/images/dishes/mochi-matcha.webp',
    '["lacteos", "soja"]',
    1,
    true
)
ON CONFLICT DO NOTHING;

-- 6. Asignar Platos a Tarifas
-- Todos a Buffet Noche; Buffet Mediodía sin atún rojo ni dragon roll
INSERT INTO tariff_dish (tariff_id, dish_id)
VALUES
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a61'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a62'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a63'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a64'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a65'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a67'),
-- Mediodía:
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a61'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a62'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a63'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a65'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a67')
ON CONFLICT DO NOTHING;

-- 7. Personal (Hash Argon2 precalculado de "Sakura2026!")
INSERT INTO staff_user (id, restaurant_id, nombre, email, rol, password_hash)
VALUES
(
    '00eebc99-9c0b-4ef8-bb6d-6bb9bd380a71',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Admin Principal',
    'admin@sakura.es',
    'admin',
    '$argon2id$v=19$m=65536,t=3,p=4$vQh27P9XgN8Wq6+87nZ59A$1t1kSj4B889tC4+J10fF+7k7XwO4oR3903RzO1Yw6x4'
),
(
    '00eebc99-9c0b-4ef8-bb6d-6bb9bd380a72',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Camarero Sala 1',
    'waiter@sakura.es',
    'sala',
    '$argon2id$v=19$m=65536,t=3,p=4$vQh27P9XgN8Wq6+87nZ59A$1t1kSj4B889tC4+J10fF+7k7XwO4oR3903RzO1Yw6x4'
),
(
    '00eebc99-9c0b-4ef8-bb6d-6bb9bd380a73',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Chef Cocina 1',
    'kitchen@sakura.es',
    'cocina',
    '$argon2id$v=19$m=65536,t=3,p=4$vQh27P9XgN8Wq6+87nZ59A$1t1kSj4B889tC4+J10fF+7k7XwO4oR3903RzO1Yw6x4'
)
ON CONFLICT DO NOTHING;
