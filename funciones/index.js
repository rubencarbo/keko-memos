// =========================================================
// Menú Familiar · funciones/index.js
// Único código en servidor: envía los avisos como notificaciones push
// =========================================================
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2/options");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

// Debe coincidir con la ubicación de Firestore: eur3 → "europe-west1", nam5 → "us-central1"
setGlobalOptions({ region: "europe-west1", maxInstances: 3 });

initializeApp();
const db = getFirestore();

exports.enviarAviso = onDocumentCreated("hogares/{hogar}/avisos/{aviso}", async (event) => {
  const aviso = event.data?.data();
  if (!aviso) return;
  const hogar = event.params.hogar;

  const miembros = await db.collection(`hogares/${hogar}/miembros`).get();
  const destinos = [];
  miembros.forEach((m) => {
    if (m.id === aviso.de) return;
    if (aviso.para && aviso.para !== "todos" && aviso.para !== m.id) return;
    (m.data().tokens || []).forEach((token) => destinos.push({ token, uid: m.id }));
  });
  if (!destinos.length) return;

  const respuesta = await getMessaging().sendEachForMulticast({
    tokens: destinos.map((d) => d.token),
    notification: { title: aviso.deNombre || "Casa", body: aviso.texto || "" },
    webpush: {
      notification: { icon: "/icono-192.png", badge: "/icono-192.png", tag: `aviso-${event.params.aviso}`, renotify: true },
      fcmOptions: { link: "/" }
    },
    data: { avisoId: event.params.aviso, tipo: aviso.tipo || "texto" }
  });

  // Limpia tokens caducados (móviles donde se desinstaló la app, etc.)
  const caducados = [];
  respuesta.responses.forEach((r, i) => {
    const codigo = r.error?.code;
    if (codigo === "messaging/registration-token-not-registered" || codigo === "messaging/invalid-registration-token") caducados.push(destinos[i]);
  });
  await Promise.all(caducados.map((d) =>
    db.doc(`hogares/${hogar}/miembros/${d.uid}`).update({ tokens: FieldValue.arrayRemove(d.token) })
  ));
});
