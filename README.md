# Informe · 19/10/2026 21:00

Commit: `b30168d` · [ejecución](https://github.com/rubencarbo/keko-memos/actions/runs/39307110746)

| Fase | Resultado |
|---|---|
| Pruebas con emuladores | ❌ failure |
| Publicar en Firebase | ⏭️ skipped |
| Web publicada | ⏭️ skipped |

## Reglas de seguridad

✅ un extraño no puede leer el hogar ni sus recetas
✅ sin sesión no se puede consultar un código
✅ unirse con el código correcto funciona
✅ unirse con un código falso falla
✅ crear un hogar nuevo con su código funciona
✅ no se puede secuestrar un código de otro hogar
✅ un menor lee recetas pero no las edita ni borra
✅ un menor no puede planificar menús
✅ un menor añade y marca la compra pero no la borra
✅ un menor no puede hacerse adulto
✅ un adulto planifica, edita recetas y cambia quién cocina
✅ nadie puede cambiar el administrador ni el código del hogar
✅ los avisos se firman con el propio usuario
✅ cualquier miembro registra tareas de casa

## Recorrido con emuladores (http://127.0.0.1:5000)

✅ La pantalla de entrada carga
✅ Entrar con el código familiar (anónimo) y unirse al hogar
✅ Modo tablet activado
✅ Hoy: muestra los platos del día y la cocinera habitual
✅ Tareas: marcar que Lucía ha puesto la mesa suma puntos
✅ Aviso rápido «Poned la mesa» se envía
✅ Cambiar quién cocina solo para hoy
✅ Tablet: un peque pregunta a KeKoMeMos y supera el reto
✅ Recetas: la opción «Pedir a KeKoMeMos» está disponible
✅ Semana: se ve la planificación
✅ Semana: intercambiar dos días
✅ Menús: vista mensual
✅ Menús: crear una receta nueva directamente en un día vacío
✅ Recetas: lista, filtro y detalle
✅ Recetas: crear una receta nueva
✅ Modo cocina: abre y avanza de paso
✅ Compra: añadir, marcar y guardar en casa
❌ Perfil: QR, código y los 5 temas — locator.waitFor: Error: strict mode violation: getByText('PRUEBA') resolved to 3 elements:
✅ Móvil: un menor se une con el código
✅ Móvil menor: el menú está oculto hasta resolver el reto
✅ Móvil menor: puede añadir a la compra pero no borrar
✅ La tablet recibe el aviso que envía el móvil
✅ Móvil adulto: vistas principales

**22 de 23 pasos correctos.**

### Errores de la página
- [tablet] consola: Failed to load resource: the server responded with a status of 401 ()
- [móvil menor] consola: Failed to load resource: the server responded with a status of 401 ()


