# Arquitectura

> Documento vivo. El diseño original y su justificación están en
> `../ARQUITECTURA_CRM_AGENCIA_VIAJES.md`; este archivo describe **lo
> implementado**.

---

## 1. Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| UI + servidor | **Next.js 15** (App Router) + React 19 + TypeScript | Un solo proceso Node sirve la interfaz y el backend; acceso multiplataforma por navegador; el mismo proyecto se despliega en la nube sin refactor. |
| Base de datos | **Prisma** sobre **SQLite** | Migraciones versionadas, tipado generado; el respaldo es copiar un archivo. Portable a PostgreSQL. |
| Estilos | **Tailwind v4** + sistema de diseño propio (tokens claro/oscuro) · fuente del sistema | UI moderna sin dependencias pesadas; sin descargas de fuentes (funciona sin internet). |
| Cliente | Server Components + Server Actions, **sin** librería de *data-fetching* | Menos JS en el navegador; el estado del servidor se resuelve en el servidor. |
| Autenticación | Sesiones propias · **Argon2id** (`@node-rs/argon2`) | Cookie `HttpOnly` + registro en BD; cerrar sesión invalida el registro, no solo la cookie. |
| Validación | **zod 4** en el borde del servidor | Primera línea de defensa contra datos malformados. |
| Dinero | Tipo `Money` propio: `bigint` en unidades mínimas + código ISO | Nunca flotante; rechaza operaciones entre monedas distintas. |
| Exportación | **exceljs** | XLSX + CSV. |
| Pruebas | **vitest** | Motor de reglas puro. |

No hay APIs de pago ni servicios externos obligatorios.

---

## 2. Capas (las dependencias apuntan hacia adentro)

```
┌───────────────────────────────────────────────────────────┐
│ PRESENTACIÓN  src/app/**, src/shared/ui/**                │
│   Solo muestra y captura. Cero lógica financiera.         │
├───────────────────────────────────────────────────────────┤
│ APLICACIÓN    src/modules/*/service.ts  +  */actions.ts   │
│   Casos de uso: crearContrato, registrarPago, asignarCupo │
│   Abren transacción, validan (zod), escriben auditoría.   │
├───────────────────────────────────────────────────────────┤
│ DOMINIO       src/core/domain/rules/**   (PURO)           │
│   Saldos, fechas límite, estados derivados, alertas.      │
│   Sin acceso a BD. Recibe el "ahora" como parámetro.     │
├───────────────────────────────────────────────────────────┤
│ PUERTOS       src/core/ports/**                           │
│   Repositorios · Almacenamiento · Auth · Config · Reloj   │
├───────────────────────────────────────────────────────────┤
│ ADAPTADORES   src/core/adapters/**, src/core/db/**        │
│   SQLite (Prisma) · Disco local  → intercambiables        │
└───────────────────────────────────────────────────────────┘
```

**Dos disciplinas obligatorias:**

1. El motor de reglas **recibe el reloj inyectado** (`Clock`), nunca lee la
   hora del sistema. Sin eso no se pueden probar vencimientos de forma
   determinista.
2. **Toda escritura pasa por un servicio**, jamás desde la presentación. El
   servicio garantiza la transacción y la auditoría en el mismo bloque
   atómico.

---

## 3. Organización del código (módulos verticales)

```
src/
  app/
    (auth)/login/            inicio de sesión
    (app)/                   layout con sidebar + topbar
      page.tsx               DASHBOARD
      contratos/             lista, /nuevo, /[id] (pantalla 360°)
      calendario/            4 vistas + panel lateral
      clientes/ [id]/        lista + ficha 360°
      pagos/                 vista transversal del libro
      cupos/ [id]/           inventario anticipado
      vendedores/ destinos/ hoteles/   maestros
      configuracion/         reglas de negocio editables
      sistema/               exportación · respaldos · auditoría
      notificaciones/        centro de alertas
    api/
      files/[id]/            entrega de archivos autenticada
      export/[kind]/         descargas CSV / XLSX
  core/
    domain/
      enums.ts               vocabulario de estados + etiquetas ES
      rules/                 MOTOR: config, types, contract, alerts (+tests)
    money/                   currency.ts, money.ts (+tests)
    time/                    clock.ts — PlainDate + reloj (+tests)
    auth/                    password (Argon2id), session, index (capacidades)
    db/                      prisma.ts (cliente único)
    audit/                   writeAudit(tx, ...)
    ports/ adapters/         storage
    errors.ts  forms.ts      errores de dominio + helpers de Server Actions
  modules/
    contracts/  reservations/  payments/  inventory/
    clients/  sellers/  destinations/  hotels/
    settings/  alerts/  documents/  notes/  search/  dashboard/
    export/  backup/
  shared/ui/                 button, card, table, dialog, tabs, badge, ...
```

---

## 4. Modelo de datos

Ver `prisma/schema.prisma`. Convenciones:

- **id** `cuid()` en toda entidad; número amigable en contratos
  (`CTR-2026-000123`, secuencia por año vía tabla `Counter`, `@unique`).
- **Importes:** `BigInt` en unidades mínimas + campo `*Currency`.
- **Fechas puras** (viaje, vigencia, cuota, valor de asiento): `String`
  `"YYYY-MM-DD"`, sin hora ni zona. **Marcas de tiempo del sistema:**
  `DateTime` UTC.
- **Borrado lógico:** `archivedAt`.
- **Bloqueo optimista:** `version` en `Contract` y `Reservation`.
- SQLite no tiene enums → columnas `String` validadas en `core/domain/enums.ts`.

**Entidad central: `Contract`.** De ella cuelgan `ContractPassenger` (1:1),
`Reservation` (1:1, solo si hay fecha), `LedgerEntry[]` (libro inmutable),
`Installment[]`, `Commission` (1:1), `InventoryAssignment[]`, y —vía
`entityType`/`entityId`— `Document[]`, `Note[]`, `AuditLog[]`.

**`LedgerEntry` lleva dos importes:** `received*` (moneda real del
movimiento) y `applied*` (moneda del contrato) + `exchangeRate` congelada. El
saldo se calcula con los aplicados; la caja real con los recibidos.

---

## 5. Flujos principales

- **Alta de contrato** → transacción: número, congela días de anticipación y
  comisión, crea pasajeros, crea reserva `pendiente_confirmacion` si es fecha
  cerrada, crea fila de comisión esperada, auditoría, adjunta PDF.
- **Registrar pago** → asiento `pago_recibido` con doble importe; si la
  moneda difiere, congela la tasa; imputa a cuota si se indica; el saldo se
  re-deriva.
- **Marcar liquidado** → asiento `comision_retenida` por el saldo.
- **Asignar cupo** (RN-14) → `InventoryAssignment` + asiento
  `aplicacion_de_anticipo` + descuento de plazas, todo en una transacción.
- **Cancelar** (RN-16) → estado + reserva + asientos opcionales, auditado.
- **Reprogramar** → edita la reserva, conserva el valor anterior en el
  historial, re-deriva la fecha límite y las alertas.

---

## 6. Estrategia de archivos

`data/files/{año}/{uuid}.{ext}` — nombre interno del sistema, nombre original
solo como metadato. Cada documento registra su hash **SHA-256** (detección de
duplicados + verificación de respaldos). Los archivos se entregan **siempre**
por `/api/files/[id]`, que verifica sesión antes de transmitir — nunca por
ruta directa. El almacenamiento está tras la interfaz `StoragePort`
(`save` / `read` / `softDelete` / `signAccess`), con implementación local hoy
y S3 mañana.

---

## 7. Respaldos

Ver `README.md → Respaldos`. Carpeta con `crm.db` (copiado tras
`PRAGMA wal_checkpoint(TRUNCATE)`) + `files/` + `settings.json` +
`manifest.json` (esquema, fecha, conteos, checksum SHA-256). Rotación 7/4/12.
Copia a `BACKUP_SECONDARY_DIR`. Restauración con validación previa + copia
preventiva.

---

## 8. Seguridad

- Argon2id (m=19456, t=2, p=1); cookie `HttpOnly` + `SameSite=Lax` +
  `Secure` en producción; cierre de sesión borra el registro en BD.
- Autorización **por capacidad** (`core/auth/index.ts`): `contract.create`,
  `reservation.confirm`, `payment.void`, `contract.mark_liquidated`,
  `backup.restore`, … — comprobada en el servicio (`assertCan`), no en la UI.
  Roles v1: `admin`, `standard`; añadir supervisor/reservas/vendedor/solo
  lectura es configuración, no refactor.
- Toda entrada validada con zod en el servidor. Acceso a datos solo por el
  ORM parametrizado.
- Operaciones sensibles (anular pago, marcar liquidado, restaurar) exigen
  motivo y quedan en auditoría.
- Secretos en variables de entorno (`.env.example` sin valores reales).

---

## 9. Decisiones técnicas notables

- **Estados calculados, no almacenados:** cambiar una regla en Configuración
  reevalúa correctamente todo el histórico; desaparece la clase de errores
  por estados desincronizados.
- **Alertas derivadas:** no hay tarea programada que genere filas → sin
  duplicados, sin avisos huérfanos, sin notificaciones fósiles.
- **`Money` que rechaza cross-currency:** un error de agregación se manifiesta
  como excepción inmediata, no como un número plausible en un informe.
- **`BigInt` y SQL estándar:** la portabilidad SQLite→PostgreSQL no requiere
  tocar la lógica.
