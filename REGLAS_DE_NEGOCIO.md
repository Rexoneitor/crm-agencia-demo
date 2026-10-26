# Reglas de negocio

Todas las reglas con parámetros son **configurables** desde *Configuración* y
NO están escritas en el código. Los valores aquí son las semillas iniciales.
El motor que las aplica vive en `src/core/domain/rules/` y está cubierto por
pruebas (`npm test`).

---

## Principios estructurales

1. **Los estados operativos se calculan, no se almacenan.** El sistema guarda
   hechos y decisiones humanas; deriva de ellos el estado de pago, de
   vencimiento y de incumplimiento cada vez que se consultan.
2. **El dinero es un libro de asientos inmutable.** Nada se edita ni se
   borra; todo se reversa con motivo y queda auditado.
3. **Toda dependencia del entorno está aislada tras una interfaz** (base de
   datos, almacenamiento de archivos, autenticación).

---

## RN-01 · Fecha límite de liquidación

`fecha_límite = fecha_de_viaje − días_anticipación`

`días_anticipación` proviene del tipo de viaje:

| Tipo          | Días (semilla) | Clave de configuración |
|---------------|----------------|------------------------|
| Nacional      | 30             | `liquidation.leadDays.nacional` |
| Internacional | 90             | `liquidation.leadDays.internacional` |

## RN-02 · Congelación del parámetro

Los días de anticipación se **copian al contrato** en el momento de su
creación (`Contract.liquidationLeadDays`) y quedan editables por contrato con
justificación. Si la agencia cambia mañana la política, los contratos ya
vendidos conservan la condición con la que se vendieron. El parámetro global
solo define el valor por defecto de las ventas futuras.

## RN-03 · Saldo

`saldo = precio_bruto − Σ(asientos que liquidan, no anulados)`

| Tipo de asiento           | Efecto sobre el saldo |
|---------------------------|-----------------------|
| `pago_recibido`           | −  (liquida) |
| `aplicacion_de_anticipo`  | −  (liquida) |
| `comision_retenida`       | −  (liquida) |
| `descuento`               | −  (liquida) |
| `castigo`                 | −  (liquida) |
| `reembolso`               | +  (devuelve saldo) |
| cualquiera **anulado**    | 0  (no cuenta) |

El saldo se calcula **exclusivamente con los importes aplicados** (en la
moneda del contrato). La caja real recibida se calcula aparte, con los
importes recibidos, agrupada por su moneda.

**Estado de pago derivado:**

- `sin_pagos` — no hay asientos que liquiden.
- `parcial` — `0 < Σ liquidan < precio`.
- `pagado` — `Σ(pago_recibido + aplicacion_de_anticipo) ≥ precio`.
- `liquidado` (se muestra como **"Pagado (comisión retenida)"**) —
  `Σ liquidan ≥ precio` pero el valor pagado real no lo cubre: el contrato está
  saldado y el resto se cerró con **comisión retenida** (el vendedor cobró su
  parte directamente) o con descuento / castigo. La caja recibida por la
  agencia es menor que el precio, y así lo reflejan los reportes.

**Vendedor que retiene su comisión** (`Seller.retainsCommission`): al registrar
un pago con ese vendedor, la opción "el contrato queda pagado" viene marcada;
al guardar se crea un asiento `comision_retenida` por el saldo restante.

## RN-04 · Contrato de fecha cerrada genera reserva

Toda reserva nace en estado **`pendiente_confirmacion`**, nunca confirmada
automáticamente. Tener fechas en un papel no significa disponibilidad
confirmada por el proveedor.

## RN-05 · Contrato de fecha abierta NO genera reserva

Hasta que exista una fecha de viaje definida. La acción *Programar viaje*
crea la reserva reutilizando los datos del contrato **y cambia la modalidad a
fecha cerrada**; la ventana de vigencia se conserva como referencia histórica.
No hay que borrar ni rehacer el contrato.

## RN-06 · Vencimiento de vigencia (fecha abierta)

Un contrato de fecha abierta cuya ventana termine dentro del umbral
(`alerts.vigenciaThresholdDays`, semilla **45 días**) genera alerta. Si la
ventana expira sin viaje programado, el contrato **requiere revisión**. Nunca
se cancela ni se elimina automáticamente.

## RN-07 · Incumplimiento de plazo

Si se alcanza la fecha límite de liquidación con saldo pendiente, el contrato
se marca visualmente **fuera de plazo** y genera alerta de prioridad crítica.
El sistema jamás elimina la reserva. Un administrador debe resolver
explícitamente: `mantener_activo`, `fecha_extendida`, `incumplido`,
`excepcion_autorizada` (o cancelar). La decisión queda auditada
(`Contract.exceptionResolution`).

## RN-08 · Escala de alertas de pago

Avisos a **15, 7, 3 y 1** días antes del vencimiento
(`alerts.paymentLeadDays`), el día del vencimiento y después de él.
Configurable.

## RN-09 · Comisión

Se calcula sobre el **precio bruto** (o sobre el neto tras descuentos, según
`commission.base`), por porcentaje o valor fijo según la configuración del
vendedor. Ese valor se **congela en el contrato** al momento de la venta
(`Contract.commissionKind` / `commissionValue` / `commissionCurrency`).

- La **comisión esperada** es un valor derivado y no genera asiento.
- La **comisión retenida** solo existe como asiento cuando una persona
  ejecuta *Marcar como liquidado* indicando el motivo.
- La **liquidación de la comisión al vendedor** es un flujo de cuentas por
  pagar (`Commission.settledAt`), distinto del cobro al cliente.

## RN-10 · Integridad temporal

- La fecha final nunca puede ser anterior a la inicial.
- Un contrato de fecha cerrada exige fecha de viaje.
- Uno de fecha abierta exige ventana de vigencia válida.

## RN-11 · Integridad financiera

- No se admiten montos negativos en pagos.
- Las correcciones de importe se hacen por **anulación + nuevo registro**
  (`LedgerEntry.voided` + `voidReason`): el rastro queda a la vista.
- **Excepción — error de tecleo.** `payment.delete` (sólo admin) elimina el
  asiento por completo. Es para asientos creados por equivocación, no para
  corregir; queda constancia en la auditoría. No se permite sobre asientos de
  `aplicacion_de_anticipo` ligados a un cupo (hay que revertir la asignación).

## RN-12 · Eliminación

La vía normal para retirar una entidad crítica es **archivarla**
(`archivedAt`): desaparece de listas, calendario, alertas y reportes, pero se
puede **restaurar**, y todo queda auditado.

**Excepción — borrado definitivo de un contrato.** Existe una acción de
administración (`contract.delete`, sólo rol admin) que elimina de verdad un
contrato y todo lo que cuelga de él (reserva, asientos del libro, cuotas,
comisión, documentos y notas). Está pensada para depurar datos de prueba o
cargas erróneas, no para la operación diaria. Salvaguardas:

- capacidad exclusiva del administrador;
- hay que **reescribir el número del contrato** para confirmar;
- los cupos que tuviera asignados se **liberan** y se recalcula su estado;
- queda un asiento en la **bitácora de auditoría** (`AuditLog` no tiene clave
  foránea al contrato, así que el rastro del borrado sobrevive);
- los archivos (documentos y comprobantes) pasan a la papelera interna del
  almacenamiento, no se destruyen de inmediato.

## RN-13 · Moneda del contrato (multimoneda)

- Cada contrato se denomina en **una sola moneda** (la de su precio y su
  saldo).
- Un asiento puede recibirse en otra moneda, pero registra la **tasa de
  cambio aplicada** y el importe convertido a la moneda del contrato. Esa
  tasa queda **congelada en el asiento** y jamás se recalcula.
- **Ningún cálculo suma importes de monedas distintas sin agruparlos por
  moneda.** El tipo `Money` lanza una excepción si se intenta.
- Exponentes: **COP → 0 decimales**, **USD → 2 decimales**
  (`currency.default`, tabla en `src/core/money/currency.ts`).

## RN-14 · Aplicación de anticipo de cupo

El pago que un vendedor hace por un cupo anticipado constituye un **anticipo
con saldo propio**. Al asignar el cupo a un contrato:

1. se crea `InventoryAssignment`,
2. se genera en el contrato un asiento `aplicacion_de_anticipo`,
3. se descuentan las plazas del cupo.

**Invariante:** `Σ aplicaciones de un cupo ≤ Σ pagos recibidos del cupo`.
Este asiento liquida saldo del contrato pero **no computa como caja recibida**
en el período de la aplicación (el efectivo entró cuando el vendedor pagó el
cupo). La asignación es **reversible con motivo**.

## RN-15 · Devengo de comisión

El momento en que la comisión se hace exigible —al vender, al completarse el
pago o al viajar— es `commission.accrual` (semilla: **al completarse el
pago**). No afecta al cálculo del saldo del contrato.

## RN-16 · Cancelación

Cancelar un contrato es una **acción**, no una nota. Exige motivo obligatorio
y usuario responsable, y produce en la misma transacción:

- `Contract.lifecycleState = cancelado` + `cancellationReason` +
  `cancellationCode` (campo estructurado, filtrable — no en notas),
- `Reservation.state = cancelada` si existía,
- opcionalmente asientos `reembolso` (lo que se devuelve al cliente) y/o
  `castigo` (penalidad que la agencia retiene), cada uno con su motivo.

Una reserva cancelada recibe en el calendario un tratamiento visual
oscurecido y desaturado, además del tachado de los estados finales.

## RN-17 · Un destino por contrato (v1)

Cada contrato referencia un único destino y, si corresponde, un único hotel.
No hay paquetes multidestino en esta versión. El campo se modela de forma que
ampliarlo a una tabla de segmentos de viaje sea aditivo, no destructivo.

## RN-18 · Grupos de viaje y pago repartido

Un `ContractGroup` (menú *Grupos*) es puramente **organizativo**: enlaza
varios contratos del mismo viaje (p. ej. una familia, cada persona con su
propio contrato). No es una entidad financiera ni cambia el cálculo de saldo
o estado de pago (RN-03): cada contrato sigue siendo autónomo.

**Pago repartido entre contratos del grupo:** un pago recibido se registra
como **N asientos `pago_recibido` independientes** (uno por contrato),
etiquetados con el mismo `LedgerEntry.groupPaymentId` únicamente para poder
verlos juntos en el libro ("pago de grupo"). No se permite repartir entre
contratos de distinta moneda en el mismo formulario (RN-13): cada moneda se
paga aparte. El comprobante subido se enlaza (`Receipt`) a cada asiento
creado — `Receipt` no exige una relación 1:1 con `Document`.

---

## Estados

### Estados ALMACENADOS (decisiones humanas)

| Entidad | Campo | Valores |
|---|---|---|
| Contrato | `lifecycleState` | borrador · activo · cancelado · finalizado |
| Contrato | `modality` | fecha_abierta · fecha_cerrada |
| Contrato | `exceptionResolution` | ninguna · mantener_activo · fecha_extendida · incumplido · excepcion_autorizada |
| Reserva | `state` | pendiente_confirmacion · confirmada · requiere_cambio_fecha · cancelada · finalizada |
| Cuota | `manualState` | vigente · cancelada |
| Cupo | `state` | disponible · parcialmente_asignado · asignado · cancelado · vencido |
| Asiento | `voided` | verdadero / falso, con motivo |

### Estados DERIVADOS (calculados en cada lectura, no existen como columna)

| Estado | Se calcula desde |
|---|---|
| Estado de pago | asientos aplicados vs. precio bruto |
| Días para el viaje / para la fecha límite | fechas vs. hoy (RN-01/02) |
| Fuera de plazo / en riesgo | RN-07 |
| Vigencia por expirar / expirada | RN-06 |
| Cuota vencida / próxima / parcial / pagada | fecha e imputación de asientos |
| Alertas activas | motor de reglas sobre contratos + cupos vs. configuración |

---

## Alertas (§13)

Las alertas se **derivan, no se generan**: el motor produce la lista activa
en cada consulta. Solo se persiste el *estado de interacción* del usuario
(leída / pospuesta / descartada) por combinación de tipo + entidad + fecha de
referencia. Una alerta desaparece sola cuando su causa se resuelve.

Tipos: `pago_por_vencer`, `pago_vencido`, `contrato_proximo_a_limite`,
`contrato_fuera_de_plazo`, `viaje_proximo`, `reserva_sin_confirmar`,
`vigencia_por_expirar`, `cupo_por_vencer`.

---

## Decisiones de negocio pendientes

1. **Cupo vencido sin asignar:** ¿el dinero se pierde, queda como crédito con
   el proveedor o se devuelve al vendedor?
2. **Comisión (RN-09/RN-15):** confirmar base (bruto/neto) y momento de
   devengo antes de poner el módulo de comisiones en producción.
3. **Facturación electrónica (DIAN):** este sistema es de gestión interna y
   **no** sustituye la facturación.

> **Traspaso de titular** (antes pendiente): ya implementado —
> *Resumen → Cambiar titular*.
