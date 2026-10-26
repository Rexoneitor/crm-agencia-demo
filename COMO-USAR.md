# Cómo usar el CRM (guía para no técnicos)

## Antes de nada: instalar Node.js (una sola vez)

El programa necesita un motor gratuito llamado **Node.js**.

1. Entra a **https://nodejs.org**
2. Descarga el botón grande que dice **"LTS"**.
3. Abre el archivo descargado y pulsa **Siguiente → Siguiente → Instalar → Finalizar**.
4. Reinicia el computador (por si acaso).

Esto se hace **solo una vez** en el equipo.

> **Sobre internet:** sólo hace falta conexión para esta primera instalación.
> Después el programa funciona **100 % sin internet** (es local).

---

## Muy recomendado: excluir la carpeta del antivirus (una vez)

Si usas **Bitdefender**, **Avast**, **Norton** o similar, el antivirus revisa
cada archivo del programa y lo hace **más lento** (arranque y carga de
pantallas). Excluir la carpeta lo agiliza bastante.

Añade esta carpeta a las **exclusiones** de tu antivirus:

```
C:\crm-agencia-demo
```

- **Bitdefender:** Protección → Antivirus → Configuración → Gestionar
  excepciones → Añadir una excepción → pega la ruta de la carpeta.
- **Windows Defender:** Seguridad de Windows → Protección antivirus →
  Administrar la configuración → Exclusiones → Agregar → Carpeta.

Es seguro: es tu propia carpeta de trabajo, no descarga nada de internet.

---

## Encender el programa

Dentro de la carpeta del CRM
(`C:\crm-agencia-demo`) verás un archivo llamado:

> **`iniciar-crm`**  (icono de engranaje ⚙️)

**Haz doble clic en él.**

- La **primera vez** instala lo que necesita (varios minutos). Después arranca
  en unos segundos.
- El CRM se abre en **su propia ventana**, como un programa normal (sin barra
  de direcciones ni pestañas), con su icono en la barra de tareas.
- Detrás queda una **ventana negra minimizada** llamada
  **`CRM - servidor (no cerrar)`**. Es el motor del programa: **no la cierres**
  mientras trabajas. Puedes dejarla minimizada.
- La **primera vez que abres cada pantalla** tarda un par de segundos en
  cargar (la está preparando). Después es instantánea.

> Si el equipo no tiene Edge ni Chrome, el CRM se abrirá en una pestaña normal
> del navegador que uses por defecto. Funciona igual.

### Entrar

| | |
|---|---|
| Correo | `admin@agencia.com` |
| Contraseña | `admin1234` |

(Cambia esa contraseña cuando empieces a usarlo de verdad.)

---

## Apagar el programa

Cierra la ventana del CRM y luego **cierra la ventana negra**
`CRM - servidor (no cerrar)` (está minimizada en la barra de tareas). Ya está.

(Si esa ventana se quedó colgada, hay un archivo `apagar-crm` que la fuerza a
cerrar.)

---

## Usarlo desde el celular o una tablet (misma red wifi)

1. Con el CRM encendido en el computador principal, averigua la **IP** de ese
   equipo: en la ventana negra del servidor aparece una línea
   `Network: http://192.168.x.x:3200`.
2. En el celular, con el mismo wifi, abre el navegador y escribe esa dirección
   (por ejemplo `http://192.168.1.20:3200`).
3. Si no carga: hay que **permitir el puerto 3200 en el Firewall de Windows**
   del computador principal (una sola vez). Pídele ayuda a alguien de sistemas
   o busca "abrir puerto firewall windows".

---

## Consejo: crear un acceso directo en el Escritorio

Haz doble clic en **`crear-acceso-directo`** (icono de engranaje). Aparece un
icono **"CRM Agencia"** en el Escritorio; desde ahí enciendes el programa con
un doble clic.

---

## Varias personas, un mismo viaje (grupos)

Cuando una familia o un grupo de amigos viaja junto pero cada uno tiene su
**propio contrato** (a su propio nombre), puedes organizarlos juntos:

- **Crear el grupo:** al hacer un contrato nuevo (o al editar uno existente),
  en el campo **"Grupo de viaje"** escribes un nombre — p. ej. "Familia
  Pérez" — y se crea solo. Los siguientes contratos del mismo viaje usan el
  mismo grupo (lo eliges de la lista).
- **Ver el grupo completo:** menú **Grupos** → entra al grupo → ves todos sus
  contratos, cliente, precio y saldo. También puedes añadir o quitar
  contratos ahí mismo.
- **Un solo pago para varios contratos:** dentro del grupo, botón
  **"Registrar pago del grupo"**. Marcas los contratos que recibieron ese
  pago, pones el monto total, y **"Repartir parejo"** lo divide entre ellos
  (o ajustas cada importe a mano). Un solo comprobante, un solo trámite —
  cada contrato queda con su propio pago registrado. *(Sólo reparte entre
  contratos que están en la misma moneda; si alguno está en otra, se registra
  aparte.)*
- **Duplicar un contrato:** dentro de un contrato, botón **"Duplicar
  contrato"** — crea uno nuevo con el mismo destino, fechas, hotel y
  vendedor, listo para el acompañante (sólo cambias el cliente). Se añade al
  mismo grupo automáticamente.

## Añadir o quitar clientes, vendedores, destinos y hoteles

Todo esto se gestiona desde el menú lateral: **Clientes**, **Vendedores**,
**Destinos**, **Hoteles**. En cada pantalla hay un botón **"Nuevo…"** y, en cada
fila, **Editar** y **Archivar**. También tienes accesos rápidos en
**Configuración → Catálogos**.

**Atajo al crear un contrato:** en el formulario de contrato nuevo, los campos
Cliente, Vendedor, Destino y Hotel te dejan **escribir un nombre**. Si ya
existe, lo eliges de la lista; si es nuevo, aparece **"➕ Crear «…»"** y se crea
solo al guardar el contrato. Luego puedes completar sus datos (teléfono,
comisión, color…) desde su pantalla del menú.

---

## Quitar los datos de ejemplo y empezar con datos reales

El programa viene con contratos y clientes de **demostración** (para que veas
cómo funciona). Los verás marcados con **`(EJEMPLO)`** delante del nombre.
Cuando quieras arrancar en serio tienes tres opciones:

- **Archivar un contrato:** abre el contrato → pestaña *Resumen* →
  botón **Archivar contrato**. Desaparece de todas las listas pero se puede
  recuperar con el filtro *Ver archivados*. Es lo más seguro.
- **Eliminar un contrato para siempre:** en la misma pantalla, botón rojo
  **Eliminar definitivamente**. Borra el contrato y todo lo suyo (reserva,
  pagos, cuotas, documentos). Te pide escribir el número del contrato para
  confirmar. **No se puede deshacer** (queda constancia en *Sistema →
  Auditoría*).
- **Corregir un pago (fecha o importe mal):** contrato → pestaña *Pagos* → en
  la fila del asiento, **editar**. Cambias fecha, importe, referencia… y se
  guarda con registro en la auditoría. Si prefieres borrarlo: **eliminar**
  (para un error de tecleo) o **anular** (deja el rastro como "anulado").
- **Editar el contrato:** contrato → *Resumen* → botón **Editar contrato**.
  Puedes cambiar vendedor, destino, hotel, ámbito, fechas, precio, días,
  días de anticipación, **pasajeros**, **comisión** y notas. Si cambias las
  fechas de viaje, la reserva se actualiza sola.
- **Cambiar el titular de un contrato:** *Resumen* → **Cambiar titular**. El
  contrato pasa a otro cliente (escribes o eliges) sin rehacerlo; los pagos y
  el historial van con él. Queda "antes: …" y un registro en la auditoría.
- **Editar una nota:** en la pestaña *Notas*, botón **editar** en la nota.
- **Editar un cupo:** *Cupos* → abre el cupo → botón **Editar**.

## De fecha abierta a fecha cerrada

Cuando vendes un contrato **con fecha abierta** y luego el cliente elige su
fecha: abre el contrato → pestaña *Reserva* → botón **Programar viaje** →
pones la fecha. El contrato **pasa a fecha cerrada**, se crea la reserva
(pendiente de confirmar) y la ventana de vigencia queda como referencia. No
hace falta borrar ni rehacer nada.

## Cuando el vendedor se queda con su comisión

Algunos vendedores cobran su comisión **directamente**: los clientes pagan a su
cuenta, el vendedor se queda con su parte y transfiere el resto a la agencia.
El contrato **está pagado por completo** aunque a la agencia le llegue menos.

- **Marca al vendedor:** *Vendedores* → editar → casilla **"Retiene su comisión
  de los pagos"**.
- **Al registrar el pago** de ese contrato, la casilla **"Con este pago el
  contrato queda pagado"** viene ya marcada. Al guardar, lo que falte respecto
  al precio se anota como *comisión retenida* y el contrato pasa a
  **"Pagado (comisión retenida)"**.
- Si no marcaste al vendedor, puedes usar el botón **"Marcar contrato como
  pagado"** en la pestaña *Pagos* cuando corresponda.
- **Borrar TODO lo de ejemplo de una vez:** doble clic en **`empezar-de-cero`**.
  Borra todos los contratos, clientes, reservas, pagos y cupos, pero
  **conserva** los usuarios, la configuración y los catálogos (destinos,
  hoteles, vendedores). Pide confirmación y no se puede deshacer — haz un
  respaldo antes si tienes dudas.

## Calendario en Excel

En la pantalla **Calendario**, botón **Descargar calendario (Excel)**. Trae:

- **Resumen por mes:** reservas, confirmadas, por confirmar, canceladas,
  pasajeros y saldo pendiente de cada mes (con fórmulas).
- **Agenda por día:** una fila por reserva, ordenada por fecha, con filtros.
  Ámbar = por confirmar, azul = entra en los próximos 15 días, gris = cancelada;
  a la izquierda del destino, una franja con su color.
- **Una hoja por mes:** el almanaque con cada reserva como recuadro en su día,
  del color de su destino (punteado si falta confirmar, tachado si se canceló,
  punto de color según el pago). El día de hoy sale resaltado en azul.

Si tienes filtros puestos en la pantalla (destino, vendedor, confirmadas…), el
Excel sale con esos mismos filtros. El Excel completo (Sistema) también trae la
agenda y los meses.

---

## Inicio y buscador

- **Inicio** muestra arriba los accesos directos (**Revisión rápida**, **Subir
  comprobante**, **Nuevo contrato**) y cuántos contratos tienen cada pendiente
  (viaje pasado, por confirmar, sin pagos, sin vendedor, sin comprobante). Un
  clic en cualquiera abre la revisión rápida ya filtrada.
- **Buscador de arriba**: escribe nombre, N.º de contrato, cédula o teléfono y
  los resultados salen al instante. No importan las tildes ni las mayúsculas
  («jose pena» encuentra a «José Peña»). Atajo: **Ctrl+K** o la tecla **/**.
- En el **celular** hay una barra abajo con Inicio, Revisión, Comprobante y
  Contratos; el resto del menú está en el botón ☰.
- **Contratos** y **Clientes** muestran 100 por página, con el total arriba y
  botones *Anterior / Siguiente*.

## Subir comprobantes rápido (menú «Subir comprobante»)
1. Arrastra las capturas, haz clic para elegirlas (puedes elegir varias) o pega una con **Ctrl+V**.
   El CRM **lee la captura solo** y propone el monto, la fecha y la referencia
   (salen en **azul** con el texto «Leído de la captura: revísalo»). La lectura
   se hace en el propio computador: la imagen no se envía a ningún lado. La
   primera vez tarda unos segundos más (descarga el lector desde el CRM).
   **Nunca guarda solo**: siempre hay que revisar y pulsar Guardar.
2. Escribe el nombre del cliente y elige su contrato en la lista.
3. Si la captura es de un pago que **ya estaba cargado**, pulsa **«Adjuntar aquí»** en ese pago.
   Si es un pago **nuevo**, escribe **¿Cuánto entró a la agencia?** (lo que dice
   la captura) y, aparte, **Para el vendedor** lo que él se quedó. Si el
   vendedor retiene comisión se sugiere su 30 % (la agencia recibe el 70 %).
4. Antes de guardar, revisa el recuadro **«Vas a guardar»**:
   *Agencia $X + Vendedor $Y = Cliente pagó $Z* y cómo queda el saldo.
5. El CRM **no deja guardar sin confirmar** cuando:
   - el monto coincide con un pago ya cargado **sin comprobante** (casi seguro
     es ese pago: usa «adjúntalo a ese pago»);
   - ya hay un pago igual **con** comprobante (posible duplicado);
   - el cliente quedaría **pagando de más**.
   Si de verdad es un pago nuevo, marca «Revisé el aviso…» y guarda.
6. Pasa sola a la siguiente captura.

## Revisión rápida (menú «Revisión rápida»)
Muestra un contrato a la vez con lo que le falta: viaje con fecha pasada, reserva por confirmar,
sin pagos, sin vendedor o pagos sin comprobante. Resuélvelo con los botones (**Ya viajó**,
**Está confirmada**, cambiar fecha, vendedor, **Pidió reembolso**, nota) y pasa con **Siguiente**
o las flechas ← →. «Saltar» lo deja para después. Arriba puedes filtrar por tipo de pendiente.

**Atajos de teclado** (botón «Atajos» o tecla **?**):

| Tecla | Hace |
|---|---|
| ← → | Contrato anterior / siguiente |
| V | Ya viajó |
| C | Está confirmada |
| S | Saltar |
| P | Escribir el pago |
| N | Escribir una nota |
| Ctrl+V | Pegar la captura |

Los atajos no funcionan mientras escribes en una casilla: pulsa **Esc** para salir de ella.

## Reembolsos

Menú **Reembolsos**. Cada vez que un cliente pida que le devuelvan dinero (por
correo, derecho de petición, tutela, queja en la Superintendencia, WhatsApp…),
regístralo con **Nuevo reembolso**:

- Si el cliente tiene contrato, elígelo. **Si el contrato todavía no está
  cargado**, marca *«Este contrato todavía no está cargado»* y créalo ahí mismo:
  destino, vigencia o fecha de viaje, precio y lo que ya abonó. Queda en
  **Contratos** (con su abono) y ligado al reembolso. Con *«Marcar el contrato
  como cancelado»* (sirve también para un contrato existente) el contrato pasa
  a cancelado. Si solo tienes el nombre, déjalo sin contrato.
  Si lo pide un grupo, elige el grupo e indica cuántas personas son.
- **Plazo:** si es un derecho de petición y lo dejas vacío, el sistema pone
  15 días hábiles (sin contar festivos, así que avisa un poco antes).
- **Pide / Acordado:** lo que pide el cliente y lo que la agencia acepta
  devolver (pueden ser distintos; puedes dejarlos vacíos mientras tanto).
- **Estado:** solicitado → en trámite → aprobado → pagado (o rechazado /
  desistido). Cada cambio queda en el historial con su nota.
- **Registrar pago al cliente:** cada devolución (total o por partes) con su
  comprobante. Si hay contrato, también queda anotada en él como "Reembolso".
  Cuando se completa el monto, pasa sola a **Pagado**.

El **Inicio** avisa cuando hay reembolsos pendientes o con el plazo vencido, y
la ficha del contrato muestra su reembolso arriba.

---

## Llevarse TODA la información (exportar)

Menú **Sistema → Descargar TODO en un Excel**. Es un solo archivo, pensado para
**seguir trabajando sólo con él** si algún día el CRM no está:

- **Resumen:** cobrado por la agencia, retenido por los vendedores, saldo por cobrar,
  pagos del mes, reembolsos pendientes, reservas por confirmar, viajes de los
  próximos 15 días, pagos sin comprobante… y una tabla de **reservas por mes**.
  Todo con fórmulas: si cambias algo en Contratos, Pagos o Reembolsos, el
  Resumen se actualiza solo.
- **Contratos:** una fila por contrato (cliente, teléfono, vendedor, empresa,
  destino, hotel, fechas, estado de la reserva, ¿ya viajó?, precio). Las
  columnas de encabezado azul claro se **calculan solas** desde la hoja Pagos:
  recibido por la agencia, retenido por el vendedor, saldo (precio − recibido −
  retenido − descuentos + reembolsado), estado de pago y si los comprobantes
  están completos. Notas en la última columna (completas en la hoja Notas).
- **Pagos:** una fila por movimiento vigente (fecha, contrato, tipo, monto,
  método, referencia, ¿tiene comprobante?). Para registrar un pago nuevo se
  escribe en la primera fila vacía y todo lo demás se recalcula.
- **Reembolsos** (con «Pendiente» y «Días para el plazo» calculados),
  **Vendedores** (totales por vendedor con fórmulas), **Agenda por día** y una
  hoja **por mes** (el almanaque), Clientes, Grupos, Destinos, Hoteles, Pagos
  de reembolsos, Comisiones, Cupos, **Comprobantes** (las fotos dentro del
  Excel), Documentos, Notas, Historial de cambios.
- **Listas:** los valores de las listas desplegables (estado de reserva,
  empresa, Sí/No, tipo de pago…). Vendedores y destinos salen de sus propias
  hojas: uno nuevo escrito allí aparece en la lista.
- **Cómo usar:** ayuda corta y significado de los colores.

Cómo se ve y se usa:

- Cada hoja es una **tabla de Excel** con filtros en el encabezado (que queda
  fijo al bajar). La fila «**Suma de lo visible**» arriba suma sólo lo filtrado.
- Fechas como fecha y montos como número con formato **$** sin decimales: se
  pueden sumar, ordenar y filtrar.
- Listas desplegables en estado de reserva, vendedor, empresa, destino, «Ya
  viajó», tipo y método de pago.
- Colores: **rojo** falta algo (saldo, comprobante, plazo vencido) · **ámbar**
  por revisar (por confirmar, pago parcial, viaje pasado sin marcar) ·
  **verde** listo · **azul** viaja en los próximos 15 días · **gris** cancelado.
- Movimientos anulados y contratos archivados no cuentan: están aparte en
  «Pagos fuera de cuentas» y «Contratos archivados».

Desde cada pantalla (Contratos, Pagos, Reservas, Vendedores, Reembolsos…) el
botón **Exportar → Excel** baja sólo esa tabla con el mismo formato (allí los
totales que vienen de otras hojas van como valor) y **CSV** para otros sistemas.

Se abre con Excel, LibreOffice o Google Sheets y se puede seguir usando aunque el
CRM no funcione. Los PDF de los contratos no caben dentro de un Excel: están en
el **paquete .zip** (enlace más abajo en la misma pantalla), junto con el mismo
Excel y la base de datos original.

Descárgalo cada semana y guárdalo **fuera** del computador (USB, Drive, OneDrive).

---

## Copias de seguridad (¡importante!)

Dentro del programa: menú **Sistema → Crear copia de seguridad**. Además el
programa hace una copia automática cada día.

Cada copia queda en la carpeta `data\backups` e incluye también el Excel completo
(`CRM-completo.xlsx`, sin fotos: esas están en la carpeta `files` del respaldo),
para poder consultarlo aunque el programa no abra. **Cópiala de vez en cuando a
una memoria USB o a una carpeta en la nube (Drive, OneDrive)**: si se daña el
disco del computador, esa copia es lo que salva la información.

---

## Cuando el programador te pase cambios

Si recibes una versión nueva del código, haz doble clic en **`actualizar-crm`**
una vez (instala lo nuevo y actualiza la base de datos) y luego abre
`iniciar-crm` como siempre.

---

## Si algo falla

| Problema | Qué hacer |
|---|---|
| "No se encontró Node.js" | Instala Node.js (arriba) y reinicia. |
| El navegador dice "no se puede acceder a este sitio" | Espera un poco (aún está arrancando) y recarga. Revisa que la ventana negra siga abierta. |
| Todo se ve raro, sin colores | Cierra la ventana negra y vuelve a abrir `iniciar-crm`. Si sigue, ejecuta `actualizar-crm`. |
| Aparece un recuadro rojo de error en el navegador | Suele ser una **extensión del navegador** (antivirus, Grammarly…) que modifica la página. No es un fallo del programa. Recarga; si molesta, desactiva esa extensión para `localhost`. La versión optimizada ya no muestra ese recuadro. |
| Otra cosa | Anota el mensaje y consúltalo. Detalles técnicos en `README.md`. |
