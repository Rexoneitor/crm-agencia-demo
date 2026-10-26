# CRM — Agencia de Viajes (Demo Técnica)

> **Nota:** Este repositorio es una versión de demostración técnica del sistema de gestión interna (CRM/ERP ligero) desarrollado para una agencia de viajes.  
> **Todo el contenido y las bases de datos incluidas utilizan datos sintéticos generados mediante seeds para fines de prueba de concepto.** No contiene datos personales ni contratos reales.

---

## 📌 Descripción del Sistema

Sistema diseñado para consolidar en una única fuente de verdad la operativa de una agencia turística:
- **Expedientes de viaje y contratos:** Control de pasajeros, titular, fechas y estado de contratación.
- **Control de pagos y saldos:** Registro de abonos, cuentas de cobro, conciliación y cálculo automático de saldos pendientes.
- **Gestión de cupos y hoteles:** Asignación de habitaciones, tipos de acomodación y proveedores.
- **Auditoría de acciones:** Trazabilidad de operaciones críticas y cambios de estado.
- **Diseño local-first:** Ejecución en red local mediante SQLite o despliegue en servidor PostgreSQL, accesible desde cualquier dispositivo conectado a la red vía navegador web.

---

## 🛠️ Stack Tecnológico

- **Frontend & Backend:** Next.js (App Router), React, TypeScript.
- **Base de Datos & ORM:** Prisma ORM con soporte dual (SQLite local / PostgreSQL).
- **Estilos:** Tailwind CSS.
- **Seguridad y Criptografía:** Hashing de contraseñas con Argon2 (`@node-rs/argon2`), sesiones tipadas.
- **Testing:** Vitest con pruebas unitarias y de integración.

---

## 🚀 Instalación y Ejecución Local

### Requisitos
- **Node.js 20 o superior** (LTS recomendado).

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env

# Generar clave secreta para la sesión (PowerShell / Bash):
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# Pega el valor generado en AUTH_SECRET dentro de .env

# 3. Aplicar migraciones y cargar datos de demostración sintéticos
npm run db:deploy
npm run db:seed

# 4. Iniciar el servidor en modo desarrollo
npm run dev
```

### Usuarios de Demostración (Seed Sintético)

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@agencia.com` | `admin1234` |
| Usuario Estándar | `usuario@agencia.com` | `usuario1234` |

---

## 📖 Documentación Adicional

- [`ARQUITECTURA.md`](ARQUITECTURA.md): Decisiones técnicas de diseño, estructura de módulos y flujo de datos.
- [`REGLAS_DE_NEGOCIO.md`](REGLAS_DE_NEGOCIO.md): Especificación de estados de reservas, liquidación de comisiones y validaciones financieras.
- [`COMO-USAR.md`](COMO-USAR.md): Guía de usuario y manual operativo de la interfaz.
