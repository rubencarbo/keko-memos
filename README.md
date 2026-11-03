# Informe · 03/11/2026 22:06

Commit: `660f1ae` · [ejecución](https://github.com/rubencarbo/keko-memos/actions/runs/41718006843)

| Fase | Resultado |
|---|---|
| Pruebas con emuladores | ✅ success |
| Publicar en Firebase | ✅ success |
| Web publicada | ✅ success |

## Reglas de seguridad

✅ un extraño no puede leer el hogar ni sus recetas
✅ sin sesión no se puede consultar un código
✅ unirse con el código correcto funciona
✅ unirse con un código falso falla
✅ crear una familia nueva necesita una invitación de Rubén (y solo sirve una vez)
✅ misiones: el menor no se da puntos ni estrellas, solo pide; el adulto verifica y entrega
✅ los menores no pueden verificar sus tareas; los adultos sí
✅ no se puede secuestrar un código de otro hogar
✅ un menor lee recetas pero no las edita ni borra
✅ un menor no puede planificar menús
✅ un menor añade y marca la compra pero no la borra
✅ un menor no puede hacerse adulto
✅ un adulto planifica, edita recetas y cambia quién cocina
✅ el titular solo pasa a otro adulto y el código no cambia
✅ los avisos se firman con el propio usuario
✅ cualquier miembro registra tareas de casa
✅ un adulto puede borrar un perfil duplicado, pero nadie al administrador
✅ fusionar al titular: pasa a otro adulto y se borra el duplicado en el mismo paso

## Recorrido con emuladores (http://127.0.0.1:5000)

✅ La pantalla de entrada carga
✅ Entrar con el código familiar (anónimo) y unirse al hogar
✅ Modo tablet activado
✅ Hoy: muestra los platos del día y la cocinera habitual
✅ Tareas: marcar que Lucía ha puesto la mesa suma puntos
✅ Aviso rápido «Poned la mesa» se envía
✅ Cambiar quién cocina solo para hoy
✅ Tablet: un peque pregunta a KeKoMeMos y supera el reto
✅ Recetas: el asistente «Añadir receta» ofrece internet, IA y a mano
✅ Hoy: botón «No sé qué cocinar · ¡Dame ideas!»
✅ Semana: se ve la planificación
✅ Semana: intercambiar dos días
✅ Menús: rellenar huecos sin repetir plato en 4 días
✅ Menús: vista mensual
✅ Menús: crear una receta nueva directamente en un día vacío
✅ Recetas: lista, filtro y detalle
✅ Recetas: crear una receta nueva
✅ Modo cocina: abre y avanza de paso
✅ Compra: añadir, marcar y guardar en casa
✅ Perfil: QR, código y los 5 temas
✅ Rubén cambia el nombre de un miembro
✅ Recetas: exportar a JSON e importar sin duplicar
✅ Rubén: panel «Reiniciar» (prueba con los avisos)
✅ Móvil: un menor se une con el código
✅ Móvil menor: el menú está oculto hasta resolver el reto
✅ Móvil menor: puede añadir a la compra pero no borrar
✅ Un menor marca una tarea y queda pendiente hasta que Rubén la verifica
✅ Misiones: Rubén ve el panel de adultos, añade un premio y encarga una misión
✅ Misiones: Hugo cumple su encargo, Rubén le da «¡Perfecto!» y se celebra en su móvil
✅ Tienda: Hugo canjea un premio y Rubén se lo entrega
✅ Rubén resta puntos a un menor
✅ La tablet recibe el aviso que envía el móvil
✅ Sin duplicados: Hugo entra desde otro móvil y elige su perfil
✅ Móvil adulto: vistas principales

**34 de 34 pasos correctos.**

### Errores de la página
- [tablet] consola: Failed to load resource: the server responded with a status of 401 (Unauthorized)
- [tablet] consola: FirebaseError: Unauthenticated [401]
- [móvil menor] consola: Failed to load resource: the server responded with a status of 401 (Unauthorized)


## Recorrido en la web publicada (https://keko-memos.web.app)

✅ La pantalla de entrada carga

**1 de 1 pasos correctos.**

### Errores de la página
- [tablet] consola: requestStorageAccess: Permission denied.


## despliegue (últimas líneas)
```
i  firestore: ensuring required API firestore.googleapis.com is enabled...
i  firestore: reading indexes from firestore.indexes.json...
i  cloud.firestore: checking firestore.rules for compilation errors...
⚠  [W] 40:16 - Unused function: esAdmin.
⚠  [W] 40:50 - Invalid function name: get.
✔  cloud.firestore: rules file firestore.rules compiled successfully
i  storage: latest version of storage.rules already up to date, skipping upload...
i  firestore: uploading rules firestore.rules...
i  firestore: deploying indexes...
✔  firestore: deployed indexes in firestore.indexes.json successfully for (default) database
i  hosting[keko-memos]: beginning deploy...
i  hosting[keko-memos]: found 10 files in public
i  hosting: upload complete
✔  hosting[keko-memos]: file upload complete
✔  storage: released rules storage.rules to firebase.storage
✔  firestore: released rules firestore.rules to cloud.firestore
i  hosting[keko-memos]: finalizing version...
✔  hosting[keko-memos]: version finalized
i  hosting[keko-memos]: releasing new version...
✔  hosting[keko-memos]: release complete

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/keko-memos/overview
Hosting URL: https://keko-memos.web.app
```
## despliegue-funciones (últimas líneas)
```
✔  extensions: required API firebaseextensions.googleapis.com is enabled
i  functions: Loaded environment variables from funciones/.env
i  functions: preparing funciones directory for uploading...
i  functions: packaged /home/runner/work/keko-memos/keko-memos/funciones (39.28 KB) for uploading
i  functions: ensuring required API run.googleapis.com is enabled...
i  functions: ensuring required API eventarc.googleapis.com is enabled...
i  functions: ensuring required API pubsub.googleapis.com is enabled...
i  functions: ensuring required API storage.googleapis.com is enabled...
✔  functions: required API run.googleapis.com is enabled
✔  functions: required API pubsub.googleapis.com is enabled
✔  functions: required API eventarc.googleapis.com is enabled
✔  functions: required API storage.googleapis.com is enabled
i  functions: generating the service identity for pubsub.googleapis.com...
i  functions: generating the service identity for eventarc.googleapis.com...
i  functions: Skipping the deploy of unchanged functions.
✔  functions[enviarAviso(europe-west1)] Skipped (No changes detected)
✔  functions[guardarFotoWeb(europe-west1)] Skipped (No changes detected)
✔  functions[unirse(europe-west1)] Skipped (No changes detected)
✔  functions[familiaCreada(europe-west1)] Skipped (No changes detected)
✔  functions[leerWebs(europe-west1)] Skipped (No changes detected)
✔  functions[ia(europe-west1)] Skipped (No changes detected)

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/keko-memos/overview
```
Estado del despliegue: `web=0 funciones=0`
