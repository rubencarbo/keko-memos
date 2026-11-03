// =========================================================
// Menú Familiar · funciones/index.js
// Único código en servidor: envía los avisos como notificaciones push
// =========================================================
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
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

// =========================================================
// Búsqueda web: leer páginas de recetas (foto y receta) y guardar fotos
// =========================================================
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getStorage, getDownloadURL } = require("firebase-admin/storage");
const { getAuth } = require("firebase-admin/auth");
const dns = require("node:dns/promises");
const net = require("node:net");
const crypto = require("node:crypto");

const AGENTE = "Mozilla/5.0 (compatible; KeKoMeMos/1.0; recetas familiares)";

function ipPrivada(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("::ffff:");
}
async function urlSegura(u) {
  let url;
  try { url = new URL(u); } catch { return false; }
  if (!["http:", "https:"].includes(url.protocol)) return false;
  const host = url.hostname;
  if (/^(localhost|.*\.internal|.*\.local|metadata)$/i.test(host)) return false;
  if (net.isIP(host)) return !ipPrivada(host);
  try {
    const ips = await dns.lookup(host, { all: true });
    return ips.length > 0 && ips.every((i) => !ipPrivada(i.address));
  } catch { return false; }
}
// fetch siguiendo redirecciones a mano y comprobando cada salto
async function traer(u, { maxBytes = 1_500_000, tiempo = 8000 } = {}) {
  let actual = u;
  for (let i = 0; i < 6; i++) {
    if (!(await urlSegura(actual))) throw new Error("URL no permitida");
    const ctrl = AbortSignal.timeout(tiempo);
    const r = await fetch(actual, { redirect: "manual", signal: ctrl, headers: { "user-agent": AGENTE, "accept-language": "es-ES,es;q=0.9" } });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { actual = new URL(r.headers.get("location"), actual).href; continue; }
    if (!r.ok) throw new Error("HTTP " + r.status);
    const lector = r.body.getReader();
    const trozos = []; let total = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) { lector.cancel(); break; }
      trozos.push(value);
    }
    return { url: actual, tipo: r.headers.get("content-type") || "", cuerpo: Buffer.concat(trozos) };
  }
  throw new Error("Demasiadas redirecciones");
}

const ENT = { ntilde: "ñ", Ntilde: "Ñ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", uuml: "ü", iexcl: "¡", iquest: "¿", deg: "º", ordm: "º", ordf: "ª", frac12: "½", frac14: "¼", frac34: "¾", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", middot: "·" };
const deco = (t) => String(t || "").replace(/&([a-zA-Z]+\d*);/g, (m, n) => (n in ENT ? ENT[n] : m)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).trim();
const meta = (html, prop) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, "i");
  const m = html.match(re);
  return m ? deco((m[0].match(/content=["']([^"']*)["']/i) || [])[1]) : "";
};
function minutosISO(d) {
  const m = String(d || "").match(/P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  const t = (Number(m[1]) || 0) * 60 + (Number(m[2]) || 0);
  return t || null;
}
function texto(x) { return deco(String(x || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")); }
function imagenDe(img) {
  if (!img) return [];
  if (typeof img === "string") return [img];
  if (Array.isArray(img)) return img.flatMap(imagenDe);
  return img.url ? [img.url] : [];
}
function pasosDe(ins) {
  if (!ins) return [];
  if (typeof ins === "string") return ins.split(/\n+|(?<=\.)\s+(?=[A-ZÁÉÍÓÚ])/).map(texto).filter(Boolean);
  if (Array.isArray(ins)) return ins.flatMap(pasosDe);
  if (ins.itemListElement) return pasosDe(ins.itemListElement);
  if (ins.text) return [texto(ins.text)];
  if (ins.name) return [texto(ins.name)];
  return [];
}
function buscarReceta(nodo) {
  if (!nodo || typeof nodo !== "object") return null;
  if (Array.isArray(nodo)) { for (const n of nodo) { const r = buscarReceta(n); if (r) return r; } return null; }
  const tipo = [].concat(nodo["@type"] || []);
  if (tipo.some((t) => String(t).toLowerCase() === "recipe")) return nodo;
  return buscarReceta(nodo["@graph"]) || buscarReceta(nodo.mainEntity);
}
function analizar(html, url) {
  let receta = null;
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { receta = buscarReceta(JSON.parse(m[1].trim())); } catch { /* JSON roto */ }
    if (receta) break;
  }
  const titulo = meta(html, "og:title") || texto((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const imagenes = [...imagenDe(receta?.image), meta(html, "og:image"), meta(html, "twitter:image")]
    .filter(Boolean).map((i) => { try { return new URL(i, url).href; } catch { return ""; } }).filter((i) => i.startsWith("http"));
  const salida = { url, sitio: new URL(url).hostname.replace(/^www\./, ""), titulo, imagenes: [...new Set(imagenes)].slice(0, 4) };
  if (receta) {
    salida.receta = {
      titulo: texto(receta.name) || titulo,
      ingredientes: [].concat(receta.recipeIngredient || receta.ingredients || []).map(texto).filter(Boolean),
      pasos: pasosDe(receta.recipeInstructions),
      minutos: minutosISO(receta.totalTime) || minutosISO(receta.cookTime),
      raciones: parseInt(String([].concat(receta.recipeYield || [])[0] || ""), 10) || null
    };
  } else {
    const cuerpo = html.replace(/<(script|style|nav|header|footer|aside)[\s\S]*?<\/\1>/gi, " ");
    salida.texto = texto(cuerpo).slice(0, 12000);
  }
  return salida;
}

async function miembroDe(uid, hogarId) {
  const m = await db.doc(`hogares/${hogarId}/miembros/${uid}`).get();
  return m.exists;
}

// Lee hasta 8 páginas (encontradas con Google por Gemini) y devuelve foto, título y receta
exports.leerWebs = onCall({ enforceAppCheck: true, timeoutSeconds: 60, memory: "512MiB" }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Inicia sesión");
  const urls = [].concat(req.data?.urls || []).filter((u) => typeof u === "string").slice(0, 8);
  const res = await Promise.allSettled(urls.map(async (u) => {
    const r = await traer(u);
    if (!/html/i.test(r.tipo)) throw new Error("no es HTML");
    return analizar(r.cuerpo.toString("utf8"), r.url);
  }));
  return { paginas: res.filter((x) => x.status === "fulfilled").map((x) => x.value) };
});

// Descarga una foto de internet y la guarda en el hogar (así no depende de la web original)
exports.guardarFotoWeb = onCall({ enforceAppCheck: true, timeoutSeconds: 60 }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Inicia sesión");
  const { url, hogarId } = req.data || {};
  if (typeof url !== "string" || typeof hogarId !== "string") throw new HttpsError("invalid-argument", "Faltan datos");
  if (!(await miembroDe(req.auth.uid, hogarId))) throw new HttpsError("permission-denied", "No perteneces a este hogar");
  let r;
  try { r = await traer(url, { maxBytes: 6_000_000, tiempo: 12000 }); } catch (e) { throw new HttpsError("unavailable", "No se pudo descargar la foto: " + e.message); }
  const tipo = r.tipo.split(";")[0].trim();
  if (!/^image\/(jpeg|png|webp|gif|avif)$/i.test(tipo)) throw new HttpsError("invalid-argument", "El enlace no es una imagen");
  const ext = tipo.split("/")[1].replace("jpeg", "jpg");
  const ruta = `hogares/${hogarId}/recetas/web-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  const archivo = getStorage().bucket().file(ruta);
  await archivo.save(r.cuerpo, { contentType: tipo, resumable: false, metadata: { cacheControl: "public, max-age=31536000" } });
  return { url: await getDownloadURL(archivo) };
});

// =========================================================
// IA gratuita con Cloudflare Workers AI (10.000 «neuronas» al día sin coste)
// La clave de Cloudflare vive solo aquí (variables CF_CUENTA y CF_TOKEN), nunca en la app.
// =========================================================
const CF_MODELOS = {
  texto: "@cf/mistralai/mistral-small-3.1-24b-instruct",
  vision: "@cf/mistralai/mistral-small-3.1-24b-instruct",
  imagen: "@cf/black-forest-labs/flux-1-schnell"
};
const LIMITE_DIARIO = 400; // llamadas por hogar y día, para no pasar nunca del plan gratuito

async function cloudflare(modelo, cuerpo) {
  const cuenta = process.env.CF_CUENTA, token = process.env.CF_TOKEN;
  if (!cuenta || !token) throw new HttpsError("failed-precondition", "Falta configurar Cloudflare (CF_CUENTA y CF_TOKEN)");
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cuenta}/ai/run/${modelo}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(110000)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) {
    const msg = (j.errors || []).map((e) => e.message).join("; ") || `HTTP ${r.status}`;
    if (r.status === 429 || /neuron|limit|quota/i.test(msg)) throw new HttpsError("resource-exhausted", "Se ha agotado la IA gratuita de hoy (se renueva a las 2:00). " + msg);
    throw new HttpsError("internal", "Cloudflare: " + msg);
  }
  return j.result;
}

exports.ia = onCall({ enforceAppCheck: true, timeoutSeconds: 120, memory: "256MiB" }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Inicia sesión");
  const u = await db.doc(`usuarios/${req.auth.uid}`).get();
  const hogarId = u.data()?.hogarId;
  if (!hogarId || !(await miembroDe(req.auth.uid, hogarId))) throw new HttpsError("permission-denied", "No perteneces a ningún hogar");

  const dia = new Date().toISOString().slice(0, 10);
  const uso = db.doc(`hogares/${hogarId}/uso/${dia}`);
  const n = await db.runTransaction(async (t) => {
    const v = ((await t.get(uso)).data()?.llamadas || 0) + 1;
    t.set(uso, { llamadas: v }, { merge: true });
    return v;
  });
  if (n > LIMITE_DIARIO) throw new HttpsError("resource-exhausted", "Hoy ya se ha usado mucho la IA. Mañana más.");

  const { tipo, sistema = "", prompt = "", imagen = "", json = false } = req.data || {};
  if (typeof prompt !== "string" || prompt.length > 40000) throw new HttpsError("invalid-argument", "Petición no válida");

  if (tipo === "imagen") {
    const res = await cloudflare(CF_MODELOS.imagen, { prompt: prompt.slice(0, 2000), steps: 6 });
    return { imagen: res.image };
  }
  const mensajes = [];
  if (sistema) mensajes.push({ role: "system", content: String(sistema).slice(0, 8000) });
  if (tipo === "vision" && imagen) {
    if (imagen.length > 6_000_000) throw new HttpsError("invalid-argument", "Imagen demasiado grande");
    mensajes.push({ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imagen}` } }] });
  } else {
    mensajes.push({ role: "user", content: prompt });
  }
  const cuerpo = { messages: mensajes, max_tokens: 2500, temperature: json ? 0.3 : 0.7 };
  if (json) cuerpo.response_format = { type: "json_object" };
  let res;
  try { res = await cloudflare(tipo === "vision" ? CF_MODELOS.vision : CF_MODELOS.texto, cuerpo); }
  catch (e) {
    if (!json || e.code === "resource-exhausted") throw e;
    delete cuerpo.response_format; // algunos modelos no aceptan el modo JSON: se pide en el texto
    res = await cloudflare(tipo === "vision" ? CF_MODELOS.vision : CF_MODELOS.texto, cuerpo);
  }
  const texto = typeof res.response === "string" ? res.response : JSON.stringify(res.response ?? res);
  return { texto };
});

// =========================================================
// Unirse al hogar sin duplicar personas
//  · «listar»: con el código, devuelve los perfiles de menores para que cada uno elija el suyo
//  · «soy»: entrar en un perfil que ya existe (se comprueba la fecha de nacimiento) → misma cuenta de siempre
//  · «nuevo»: crear un perfil, comprobando antes que no exista ya alguien con ese nombre y fecha
// Los adultos entran siempre con Google (misma cuenta en todos sus dispositivos).
// =========================================================
const EMULADOR = !!process.env.FUNCTIONS_EMULATOR;
const EDAD_ADULTO = 21;
const normal = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
function edadDe(fn) {
  const [y, m, d] = String(fn || "").split("-").map(Number);
  if (!y) return null;
  const h = new Date();
  let e = h.getFullYear() - y;
  if (h.getMonth() + 1 < m || (h.getMonth() + 1 === m && h.getDate() < d)) e--;
  return e;
}

exports.unirse = onCall({ enforceAppCheck: !EMULADOR, timeoutSeconds: 30 }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Inicia sesión");
  const uid = req.auth.uid;
  const anonimo = req.auth.token?.firebase?.sign_in_provider === "anonymous";
  const { accion, miembroId } = req.data || {};
  const codigo = String(req.data?.codigo || "").trim().toUpperCase();
  const c = await db.doc(`codigos/${codigo}`).get();
  if (!codigo || !c.exists) throw new HttpsError("not-found", "Ese código familiar no existe. Pídeselo al administrador.");
  const hogarId = c.data().hogarId;
  const hogar = (await db.doc(`hogares/${hogarId}`).get()).data() || {};
  const miembros = (await db.collection(`hogares/${hogarId}/miembros`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));

  if (accion === "listar") {
    return {
      hogar: hogar.nombre || "",
      perfiles: miembros.filter((m) => m.rol === "menor").map((m) => ({ id: m.id, nombre: m.nombre, foto: m.foto || null }))
    };
  }

  const entrarComo = async (m) => {
    await db.doc(`usuarios/${m.id}`).set({ hogarId }, { merge: true });
    if (m.id === uid) return { ok: true };
    return { token: await getAuth().createCustomToken(m.id) };
  };

  if (accion === "soy") {
    const m = miembros.find((x) => x.id === miembroId);
    if (!m) throw new HttpsError("not-found", "Ese perfil ya no existe");
    if (m.rol !== "menor" && m.id !== uid) throw new HttpsError("permission-denied", "Los adultos entran con su cuenta de Google");
    if (m.nacimiento && m.nacimiento !== req.data?.nacimiento) throw new HttpsError("permission-denied", "La fecha de nacimiento no coincide con ese perfil");
    return entrarComo(m);
  }

  if (accion === "nuevo") {
    const nombre = String(req.data?.nombre || "").trim().slice(0, 24);
    const nacimiento = String(req.data?.nacimiento || "");
    if (!nombre || !/^\d{4}-\d{2}-\d{2}$/.test(nacimiento)) throw new HttpsError("invalid-argument", "Faltan el nombre o la fecha de nacimiento");
    const e = edadDe(nacimiento);
    const rol = e !== null && e < EDAD_ADULTO ? "menor" : "adulto";
    // ¿Ya existe esta persona (mismo nombre y fecha, o misma cuenta)?
    const igual = miembros.find((m) => m.id === uid || (normal(m.nombre) === normal(nombre) && m.nacimiento === nacimiento));
    if (igual) {
      if (igual.rol === "menor" || igual.id === uid) return { ...(await entrarComo(igual)), existente: true };
      throw new HttpsError("already-exists", `${igual.nombre} ya está en este hogar: entra con tu cuenta de Google`);
    }
    if (rol === "adulto" && anonimo && !EMULADOR) throw new HttpsError("failed-precondition", "Los adultos tienen que entrar con su cuenta de Google");
    const b = db.batch();
    b.set(db.doc(`hogares/${hogarId}/miembros/${uid}`), {
      nombre, nacimiento, rol, codigo, tema: "pizarra", puntos: {}, tokens: [],
      foto: req.auth.token?.picture || null, creado: FieldValue.serverTimestamp()
    });
    b.set(db.doc(`usuarios/${uid}`), { hogarId });
    await b.commit();
    return { ok: true };
  }
  throw new HttpsError("invalid-argument", "Acción desconocida");
});

// =========================================================
// Aviso a Rubén cuando alguien crea una familia con su invitación
// (crea un aviso en su hogar; «enviarAviso» lo manda como notificación a su móvil)
// =========================================================
exports.familiaCreada = onDocumentUpdated("invitaciones/{inv}", async (event) => {
  const antes = event.data?.before?.data(), despues = event.data?.after?.data();
  if (!antes || !despues || antes.usada || !despues.usada) return;
  const destino = despues.creadaPor;
  const u = await db.doc(`usuarios/${destino}`).get();
  const hogarRuben = u.data()?.hogarId;
  if (!hogarRuben) return;
  await db.collection(`hogares/${hogarRuben}/avisos`).add({
    texto: `🎉 Nueva familia en KeKoMeMos: «${despues.familia || "sin nombre"}»${despues.usadaEmail ? ` (${despues.usadaEmail})` : ""}${despues.nota ? ` · invitación «${despues.nota}»` : ""}`,
    tipo: "texto", para: destino, de: "kekomemos", quien: "kekomemos", deNombre: "KeKoMeMos",
    creadoMs: Date.now(), ts: FieldValue.serverTimestamp()
  });
});
