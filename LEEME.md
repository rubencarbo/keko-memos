# Menú Familiar · puesta en marcha

App web (PWA) para la tablet de la cocina y los móviles de la familia. Usa solo servicios de Google: Firebase Hosting, Auth, Firestore, Storage, Cloud Messaging, una Cloud Function y Gemini (Firebase AI Logic).

## Archivos

```
public/index.html      estructura
public/estilos.css     estilos y los 5 temas (por defecto: Pizarra clara)
public/app.js          pantallas, datos, avisos, puntos
public/asistente.js    Gemini, modo cocina por voz, reto de los menores
public/sw.js           funcionamiento sin conexión y notificaciones
funciones/index.js     envía los avisos como notificaciones push
firestore.rules, storage.rules, firebase.json   configuración
```

## 1. Preparar el proyecto en la consola de Firebase (keko-memos)

1. **Plan Blaze**: Configuración › Uso y facturación › Modificar plan. Después, en Google Cloud › Facturación › Presupuestos, crea una alerta de **1 €**. La alerta avisa, pero no corta el gasto.
2. **Authentication** › Método de acceso: activa **Google** y **Anónimo**.
3. **Firestore Database** › Crear base de datos › ubicación **eur3 (Europa)** › modo producción.
   *Si eliges otra ubicación, cambia `region` en `funciones/index.js` (nam5 → `us-central1`).*
4. **Storage** › Empezar, en la misma zona.
5. **AI Logic** › Empezar › elige **Gemini Developer API**. Después, **App Check** (obligatorio para Gemini): crea una clave **reCAPTCHA** de tipo Web para `keko-memos.web.app` y `keko-memos.firebaseapp.com` en console.cloud.google.com/security/recaptcha, regístrala en Firebase › Seguridad › App Check › Apps y pégala en `public/app.js`, en `const CLAVE_RECAPTCHA = "…"`.
6. **Cloud Messaging** › Configuración del proyecto › Cloud Messaging › *Certificados push web* › **Generar par de claves**. Copia la clave y pégala en `public/app.js`, en `const CLAVE_VAPID = "…"`.

## 2. Publicar

**Automático (recomendado):** cada cambio que llega a la rama `main` de GitHub pasa por las pruebas (reglas de seguridad y un recorrido completo de la app en tablet y móvil con datos de ejemplo en emuladores). Si todo va bien, se publica en Firebase y se comprueba la web real. El informe, con capturas de pantalla, queda en la rama **`informes`** del repositorio.

Requisito: el secreto `FIREBASE_SERVICE_ACCOUNT` (Settings › Secrets and variables › Actions › *Repository secret*) con el JSON de una cuenta de servicio con los roles *Editor* y *Usuario de cuenta de servicio*.

**Manual (alternativa):** con [Node.js LTS](https://nodejs.org) instalado, en esta carpeta:

```
npm install -g firebase-tools
firebase login
cd funciones && npm install && cd ..
firebase deploy
```

La app queda en **https://keko-memos.web.app**.

## 3. Primer uso

1. **Administrador**: entra con Google › *Crear un hogar nuevo*. En **Yo › Hogar** aparecen el QR y el código familiar; elige ahí **quién cocina habitualmente**.
2. **Tablet de la cocina**: entra con una cuenta de adulto y marca **Yo › Este dispositivo › Es la tablet de la cocina**. Puedes darle un tema propio.
3. **Móviles**: escanead el QR con la cámara. Los adultos entran con Google y los chicos con *Entrar con el código familiar*.
   - **iPhone**: Safari › Compartir › **Añadir a pantalla de inicio**, abrir desde el icono y, en **Yo**, *Activar notificaciones*.
   - **Android**: Chrome ofrece instalarla. Después, *Activar notificaciones*.

## Cómo funciona

- **Hoy**: comida y cena del día (cambiar plato, ver receta, cocinar), avisos a la familia, tareas de casa, próximos días y liga del mes.
- **Quién cocina**: siempre aparece la persona habitual. Si otra persona cocina algún día, se toca su nombre arriba y se cambia **solo para ese día**.
- **Puntos**: solo por **tareas de casa** (poner o quitar la mesa, llenar o vaciar el lavavajillas, basura, compra) y por el reto del menú. Cocinar no puntúa. Las tareas se marcan desde la tablet eligiendo quién las ha hecho. Los menores solo pueden marcarse a sí mismos.
- **Menores** (hasta 21 años): ven el menú del día tras resolver un reto de lógica, no organizan menús y no borran nada.
- **Avisos**: «¡A comer!», «Poned la mesa» (el primero que pulsa «La pongo yo» suma puntos), «¿Cuánto falta?» (respuestas rápidas), «Comprad…» y mensajes libres.
- **Compra**: un producto está *por comprar*, *en el carro* o *hay en casa*. Si añades algo que ya hay en casa, la app te avisa. Gemini puede generar la lista a partir del menú de la semana.
- **Recetas**: categorías *Favoritos*, *Quiero probar* y *Especiales* (con ocasión: fin de semana, Navidad…). La foto del plato puede ser tuya o generada por Gemini. Las recetas se pueden importar pegando un texto o haciendo una foto.
- **Modo cocina** (tablet): pasos en grande y pantalla siempre encendida. Se maneja por voz («siguiente», «repite», «temporizador de 10 minutos», preguntas libres) o escribiendo. El botón **Voz natural** activa la conversación por voz de Gemini Live. Si falla, usa la voz del sistema.

## Ajustes rápidos

- Modelos de Gemini y voz: al principio de `public/asistente.js` (`MODELOS`, `VOZ_GEMINI`).
- Tareas y puntos: `TAREAS` al principio de `public/app.js`.
