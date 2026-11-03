// =========================================================
// KeKoMeMos · app.js
// Firebase (login, datos, fotos, notificaciones) + pantallas
// =========================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app-check.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  signInAnonymously, signOut, connectAuthEmulator, signInWithCustomToken
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, query, where, orderBy, limit,
  serverTimestamp, increment, writeBatch, arrayUnion, deleteField, connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-storage.js";
import { getMessaging, getToken, isSupported } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging.js";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-functions.js";
import * as IA from "./asistente.js";

// ---------- CONFIGURACIÓN ----------
const firebaseConfig = {
  apiKey: "AIzaSyAul0xjLe8F2tD8boTQYIWCOAXWsaVOd6A",
  authDomain: "keko-memos.firebaseapp.com",
  projectId: "keko-memos",
  storageBucket: "keko-memos.firebasestorage.app",
  messagingSenderId: "1082679945282",
  appId: "1:1082679945282:web:64c437b653333b19b6e5db"
};
// Consola de Firebase › Configuración del proyecto › Cloud Messaging › Certificados push web › "Par de claves"
const CLAVE_VAPID = "BMIZCcREnUXqGb2ZumEEUwOgokrDupBlxa3sId5xdgb3NLI8zzuSD3e_M6iDRi0QObzpp9a46aFnZvs0310ytPA";
// Google Cloud › Seguridad › reCAPTCHA › clave de tipo "Web" (protege la cuota de Gemini con App Check)
const CLAVE_RECAPTCHA = "6LekgfYtAAAAAOUybA3BxYe5LinYo8r51g2eVw_f";

const TEMAS = [
  { id: "pizarra", nombre: "Pizarra clara", colores: ["#EAF1EC", "#2E6B4F", "#F2C94C"] },
  { id: "azulejo", nombre: "Azulejo de Lisboa", colores: ["#F4F7FC", "#1D4DA0", "#E8B33B"] },
  { id: "nordico", nombre: "Nórdico metro", colores: ["#EDEFEA", "#3F5E4D", "#B98B5E"] },
  { id: "diner", nombre: "Diner retro", colores: ["#FFF6E9", "#D7263D", "#0E7C7B"] },
  { id: "cielo", nombre: "Zellige azul", colores: ["#EEF3FB", "#2A5BC4", "#F2A531"] }
];
const TIPOS_PLATO = [["comida", "Comida"], ["cena", "Cena"], ["postre", "Postre"], ["merienda", "Merienda"], ["desayuno", "Desayuno"], ["entrante", "Entrante"]];
const MINUTOS_INACTIVIDAD = 20; // en la tablet, tras este tiempo sin uso vuelve a preguntar «¿Quién eres?»
const CATEGORIAS = { favoritos: "Favoritos", quiero_probar: "Quiero probar", especiales: "Especiales" };
const SUBCATEGORIAS = ["Fin de semana", "Navidad", "Cumpleaños", "Verano", "Otra ocasión"];
// ---------- MISIONES: tareas de casa, niveles, rachas, logros, tienda y objetivo familiar ----------
const ZONAS = [
  { id: "cocina", nombre: "Cocina", emoji: "🍽️" },
  { id: "habitacion", nombre: "Habitación", emoji: "🛏️" },
  { id: "bano", nombre: "Baño", emoji: "🛁" },
  { id: "ropa", nombre: "Colada", emoji: "🧺" },
  { id: "casa", nombre: "Casa", emoji: "🏠" },
  { id: "fuera", nombre: "Recados y más", emoji: "🛒" }
];
// Puntos según el esfuerzo: 5 rápida · 10 corta · 15 media · 20-30 larga · 40 grande. «max» = veces que cuenta al día
const T = (id, zona, emoji, nombre, hecho, puntos, min, max = 1) => ({ id, zona, emoji, nombre, hecho, puntos, min, max });
const TAREAS = [
  T("poner_mesa", "cocina", "🍽️", "Poner la mesa", "ha puesto la mesa", 10, 5, 2),
  T("quitar_mesa", "cocina", "🧹", "Quitar la mesa", "ha quitado la mesa", 10, 5, 2),
  T("llenar_lavavajillas", "cocina", "🫧", "Llenar el lavavajillas", "ha llenado el lavavajillas", 10, 10, 2),
  T("vaciar_lavavajillas", "cocina", "🥣", "Vaciar el lavavajillas", "ha vaciado el lavavajillas", 10, 10, 2),
  T("fregar", "cocina", "🧽", "Fregar los cacharros", "ha fregado los cacharros", 15, 15, 2),
  T("encimera", "cocina", "✨", "Limpiar encimera y vitro", "ha dejado la cocina reluciente", 10, 10),
  T("ayudar_cocinar", "cocina", "🥕", "Ayudar a cocinar", "ha ayudado a cocinar", 20, 30),
  T("cocinar", "cocina", "🧑‍🍳", "Cocinar una comida o cena", "ha cocinado para la familia", 40, 60),
  T("hacer_cama", "habitacion", "🛏️", "Hacer la cama", "ha hecho la cama", 5, 3),
  T("ordenar_habitacion", "habitacion", "🧸", "Ordenar la habitación", "ha ordenado su habitación", 15, 15),
  T("habitacion_fondo", "habitacion", "🧼", "Habitación a fondo", "ha limpiado a fondo su habitación", 30, 45),
  T("sabanas", "habitacion", "🛌", "Cambiar las sábanas", "ha cambiado las sábanas", 15, 15),
  T("lavabo", "bano", "🚰", "Limpiar el lavabo", "ha limpiado el lavabo", 10, 10),
  T("bano_completo", "bano", "🛁", "Limpiar el baño entero", "ha limpiado el baño", 30, 40),
  T("reponer_bano", "bano", "🧻", "Reponer papel y toallas", "ha repuesto el baño", 5, 5),
  T("poner_lavadora", "ropa", "🌀", "Poner la lavadora", "ha puesto la lavadora", 10, 10),
  T("tender", "ropa", "👕", "Tender la lavadora", "ha tendido la ropa", 15, 15),
  T("recoger_ropa", "ropa", "🧺", "Recoger la ropa tendida", "ha recogido la ropa", 10, 10),
  T("doblar_ropa", "ropa", "👚", "Doblar y guardar la ropa", "ha doblado y guardado la ropa", 15, 20),
  T("planchar", "ropa", "♨️", "Planchar", "ha planchado", 25, 30),
  T("basura", "casa", "🗑️", "Sacar la basura", "ha sacado la basura", 5, 5, 2),
  T("reciclaje", "casa", "♻️", "Bajar el reciclaje", "ha bajado el reciclaje", 10, 10),
  T("aspirar", "casa", "🌪️", "Aspirar o barrer", "ha aspirado la casa", 20, 25),
  T("fregar_suelo", "casa", "🪣", "Fregar el suelo", "ha fregado el suelo", 25, 30),
  T("polvo", "casa", "🪶", "Quitar el polvo", "ha quitado el polvo", 15, 20),
  T("plantas", "casa", "🪴", "Regar las plantas", "ha regado las plantas", 5, 5),
  T("compra", "fuera", "🛒", "Hacer la compra", "ha hecho la compra", 20, 45),
  T("colocar_compra", "fuera", "📦", "Colocar la compra", "ha colocado la compra", 10, 10),
  T("mascota", "fuera", "🐾", "Cuidar a la mascota", "ha cuidado a la mascota", 10, 20, 3),
  T("ayudar_hermano", "fuera", "🤝", "Echar una mano a un hermano", "ha echado una mano a un hermano", 10, 15, 2)
];
const RAPIDAS = ["poner_mesa", "quitar_mesa", "llenar_lavavajillas", "vaciar_lavavajillas", "basura", "compra"];
// Niveles de la brigada de cocina (XP = todos los puntos ganados; gastar en la tienda no baja de nivel)
const NIVELES = [
  [0, "Pinche", "🥄"], [100, "Ayudante", "🧽"], [250, "Commis", "🔪"], [500, "Chef de partida", "🍳"], [900, "Sous-chef", "🥘"],
  [1400, "Chef", "🧑‍🍳"], [2000, "Chef ejecutivo", "⭐"], [3000, "Una estrella", "🌟"], [4500, "Dos estrellas", "✨"], [6500, "Leyenda KeKo", "👑"]
];
const BONUS_RACHA = { 3: 5, 7: 15, 14: 30, 30: 60, 60: 100, 100: 150 };
const PUNTOS_PERFECTO = 10;
const LOGROS = [
  { id: "primera", emoji: "🚀", nombre: "Despegue", texto: "Primera tarea verificada", meta: 1, valor: (x) => x.total },
  { id: "veinticinco", emoji: "💪", nombre: "Manos a la obra", texto: "25 tareas", meta: 25, valor: (x) => x.total },
  { id: "cien", emoji: "💯", nombre: "Centenario", texto: "100 tareas", meta: 100, valor: (x) => x.total },
  { id: "cama", emoji: "🛏️", nombre: "Cama de hotel", texto: "Hacer la cama 20 veces", meta: 20, valor: (x) => x.c.hacer_cama || 0 },
  { id: "habitacion", emoji: "🧸", nombre: "Habitación de revista", texto: "10 tareas de habitación", meta: 10, valor: (x) => x.z.habitacion || 0 },
  { id: "lavavajillas", emoji: "🫧", nombre: "Máster lavavajillas", texto: "15 veces el lavavajillas", meta: 15, valor: (x) => (x.c.llenar_lavavajillas || 0) + (x.c.vaciar_lavavajillas || 0) },
  { id: "colada", emoji: "🧺", nombre: "Colada perfecta", texto: "15 tareas de colada", meta: 15, valor: (x) => x.z.ropa || 0 },
  { id: "bano", emoji: "✨", nombre: "Brillo total", texto: "10 tareas del baño", meta: 10, valor: (x) => x.z.bano || 0 },
  { id: "cocina", emoji: "🧑‍🍳", nombre: "Pinche de oro", texto: "Ayudar a cocinar o cocinar 10 veces", meta: 10, valor: (x) => (x.c.ayudar_cocinar || 0) + (x.c.cocinar || 0) },
  { id: "racha7", emoji: "🔥", nombre: "Semana en llamas", texto: "Racha de 7 días", meta: 7, valor: (x) => x.mejor },
  { id: "racha30", emoji: "☄️", nombre: "Imparable", texto: "Racha de 30 días", meta: 30, valor: (x) => x.mejor },
  { id: "perfecto", emoji: "🎯", nombre: "Francotirador", texto: "5 días perfectos", meta: 5, valor: (x) => x.perfectos },
  { id: "todoterreno", emoji: "🧭", nombre: "Todoterreno", texto: "Tareas de las 6 zonas de la casa", meta: ZONAS.length, valor: (x) => x.zonas },
  { id: "excelencia", emoji: "🌟", nombre: "Excelencia", texto: "10 tareas valoradas «¡Perfecto!»", meta: 10, valor: (x) => x.estrellas }
];
const PREMIOS = [
  { id: "postre", emoji: "🍨", nombre: "Elegir el postre", coste: 30 },
  { id: "pantalla", emoji: "🎮", nombre: "30 min extra de pantalla", coste: 40 },
  { id: "libre", emoji: "🎟️", nombre: "Librarte de una tarea", coste: 50 },
  { id: "cena", emoji: "🍕", nombre: "Elegir la cena del sábado", coste: 60 },
  { id: "peli", emoji: "🎬", nombre: "Elegir la peli familiar", coste: 80 },
  { id: "hora", emoji: "🌙", nombre: "Volver 30 min más tarde", coste: 120 },
  { id: "plan", emoji: "🎁", nombre: "Plan a solas con papá o mamá", coste: 200 }
];
const OBJETIVO = { puntos: 400, premio: "Noche de pizza y peli en familia" };
const PUNTOS_RETO = 2;
const EDAD_ADULTO = 21;

// ---------- FIREBASE ----------
// En local (pruebas automáticas) la app usa los emuladores de Firebase, no los datos reales
const EMULADORES = ["localhost", "127.0.0.1"].includes(location.hostname);
const app = initializeApp(firebaseConfig);
if (EMULADORES) {
  // sin App Check en local
} else if (CLAVE_RECAPTCHA) {
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(CLAVE_RECAPTCHA), isTokenAutoRefreshEnabled: true });
} else {
  console.warn("Falta CLAVE_RECAPTCHA: las funciones de Gemini no funcionarán con App Check activado.");
}
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
const storage = getStorage(app);
if (EMULADORES) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}
IA.iniciarIA(app);
const nube = getFunctions(app, "europe-west1");
if (EMULADORES) connectFunctionsEmulator(nube, "127.0.0.1", 5001);
const unirseFn = httpsCallable(nube, "unirse");
const leerWebs = httpsCallable(nube, "leerWebs", { timeout: 70000 });
const guardarFotoWeb = httpsCallable(nube, "guardarFotoWeb", { timeout: 70000 });

// ---------- ESTADO ----------
const S = {
  user: null, hogarId: null, hogar: null, yo: null,
  miembros: [], recetas: [], menus: {}, despensa: [], avisos: [], tareasHoy: [], tareasPendientes: [], pendientesVistos: 0,
  canjes: [], canjesVistos: 0, celebrados: new Set(), zonaBolsa: "cocina", verLogrosDe: null,
  activoId: null, ultimoUso: Date.now(), retoInline: null,
  vista: "hoy", param: null, semana: 0, mesOffset: 0, modoCal: "semana", asignarA: null, filtro: "todas", busqueda: "",
  intercambio: null, borrador: null, editorFoto: null,
  inicio: Date.now(), vistos: new Set(), cargado: new Set(), pendiente: false,
  desuscribir: []
};
if (EMULADORES) window.__S = S; // solo para las pruebas automáticas en local
const esTablet = () => localStorage.getItem("modoTablet") === "1";
// Persona que usa la app ahora: en el móvil, la de la cuenta; en la tablet, la que elige «¿Quién eres?»
const yoActivo = () => (esTablet() && miembro(S.activoId)) || S.yo;
const esAdulto = () => yoActivo()?.rol === "adulto";
const esMenor = () => yoActivo()?.rol === "menor";
const esAdmin = () => S.hogar?.admin === S.user?.uid;
const SUPERADMIN = "rubencarbo@gmail.com";
const esSuper = () => S.user?.email === SUPERADMIN && S.user?.emailVerified !== false;
const puedeOrdenarFamilia = () => esAdulto();
// «Jefe» de la familia: el titular del hogar (o Rubén) cuando es él quien usa la app
const esJefe = () => esAdulto() && (esAdmin() || esSuper() || normal(yoActivo()?.nombre) === "ruben");
const puedeReiniciar = esJefe;

// ---------- UTILIDADES ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const hoy = () => iso(new Date());
const mes = () => hoy().slice(0, 7);
const masDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const lunesDe = (d) => masDias(d, -((d.getDay() + 6) % 7));
const comidaActual = () => (new Date().getHours() < 16 ? "comida" : "cena");
const fechaLarga = (d) => d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
const diaCorto = (d) => d.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "");
const normal = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const edad = (fn) => {
  if (!fn) return null;
  const n = deIso(fn), h = new Date();
  let e = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--;
  return e;
};
const iniciales = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const miembro = (uid) => S.miembros.find((m) => m.id === uid);
const nombreDe = (uid) => miembro(uid)?.nombre || "Alguien";
const receta = (id) => S.recetas.find((r) => r.id === id);
const puntosMes = (m) => m?.puntos?.[mes()] || 0;
const cocineraHoy = () => (S.hogar?.cocinaHoy?.fecha === hoy() ? S.hogar.cocinaHoy.uid : S.hogar?.cocineraHabitual) || null;
const ref$ = (...p) => doc(db, "hogares", S.hogarId, ...p);
const col$ = (...p) => collection(db, "hogares", S.hogarId, ...p);

function avatar(m, t = 44) {
  const estilo = `--t:${t}px`;
  if (!m) return `<span class="avatar" style="${estilo}">?</span>`;
  return m.foto
    ? `<span class="avatar" style="${estilo}"><img src="${esc(m.foto)}" alt=""></span>`
    : `<span class="avatar" style="${estilo}">${esc(iniciales(m.nombre))}</span>`;
}
function fotoHTML(r, texto = "") {
  return r?.foto ? `<img src="${esc(r.foto)}" alt="" loading="lazy">` : `<span>${esc(texto)}</span>`;
}

const ICONOS = {
  hoy: '<path d="M4 11h16M6 11V8a6 6 0 0 1 12 0v3M5 11l1 9h12l1-9"/>',
  semana: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  recetas: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  compra: '<path d="M3 4h2l2.4 11h11L21 7H6.2"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="18" cy="19.5" r="1.5"/>',
  yo: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  campana: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  misiones: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  chispa: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>'
};
const icono = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n]}</svg>`;

// ---------- MENSAJES, MODAL ----------
// Traduce los errores de Gemini a algo comprensible
function errorIA(e, que = "KeKoMeMos no ha podido responder") {
  const t = String(e?.message || e || "");
  if (e?.code === "functions/resource-exhausted") return `${que}: ${t}`;
  if (e?.code === "functions/failed-precondition") return `${que}: falta configurar la IA gratuita (Cloudflare).`;
  if (e?.code === "functions/not-found" || e?.code === "functions/internal" && /not found|404/i.test(t)) return `${que}: el servicio de IA aún no está activo.`;
  if (/prepayment|credits are depleted|402|billing/i.test(t)) return `${que}: no queda saldo de Gemini. El administrador debe recargar créditos en AI Studio (aistudio.google.com › Billing).`;
  if (/\b429\b|quota|rate.?limit|too many requests|resource.?exhausted/i.test(t)) return `${que}: demasiadas peticiones seguidas. Prueba en un minuto.`;
  if (/app.?check|attestation|\b403\b/i.test(t)) return `${que}: la protección App Check ha rechazado la petición. Recarga la app.`;
  if (!navigator.onLine) return `${que}: no hay conexión a internet.`;
  return `${que}. (${(e?.code || "") + " " + t.slice(0, 120)})`;
}
function notificar(texto) {
  const d = document.createElement("div");
  d.className = "aviso";
  d.setAttribute("role", "status");
  d.textContent = texto;
  $("#avisos-flotantes").appendChild(d);
  setTimeout(() => d.remove(), texto.length > 80 ? 9000 : 3200);
}
function abrirModal(html, ancho = false, clase = "") {
  const m = $("#modal");
  m.className = "modal-fondo " + (clase ? clase + "-fondo" : "");
  m.innerHTML = `<div class="modal ${ancho ? "ancho" : ""} ${clase}" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false;
  m.querySelector("input:not([type=file]):not([type=hidden]), textarea")?.focus?.();
}
function cerrarModal() {
  const m = $("#modal");
  m.hidden = true; m.innerHTML = ""; m.className = "modal-fondo";
  clearInterval(S.relojBomba);
  if (S.retoAbierto) { S.retoAbierto = false; render(); }
}
const cabeceraModal = (t) => `<div class="modal-cabecera"><h2 class="titulo">${esc(t)}</h2><button class="btn-x" data-accion="cerrar-modal" aria-label="Cerrar">×</button></div>`;
function confirmar(texto) { return window.confirm(texto); }

// ---------- IMÁGENES ----------
async function comprimir(archivo, max = 1280, calidad = 0.82) {
  const bmp = await createImageBitmap(archivo);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bmp.width * k);
  lienzo.height = Math.round(bmp.height * k);
  lienzo.getContext("2d").drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  return new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", calidad));
}
async function subirImagen(ruta, blob) {
  const r = ref(storage, ruta);
  await uploadBytes(r, blob, { contentType: "image/jpeg" });
  return getDownloadURL(r);
}

// =========================================================
// ENTRADA: login, crear hogar, unirse con código
// =========================================================
const paramUnir = new URLSearchParams(location.search).get("unir");
if (paramUnir) sessionStorage.setItem("unir", paramUnir.toUpperCase());
// Enlace de invitación para crear una familia nueva (lo genera Rubén)
const paramInvitacion = new URLSearchParams(location.search).get("invitacion");
if (paramInvitacion) localStorage.setItem("invitacion", paramInvitacion);
const invitacionGuardada = () => localStorage.getItem("invitacion") || "";

function mostrarEntrada(modo) {
  $("#cargando").hidden = true;
  $("#app").hidden = true;
  const p = $("#pantalla-entrada");
  p.hidden = false;
  const codigo = sessionStorage.getItem("unir") || "";
  if (modo === "login") {
    p.innerHTML = `
      <div class="entrada-caja">
        <div class="etiqueta">Bienvenidos</div>
        <h1 class="titulo">KeKoMeMos</h1>
        <p class="suave">Menús, recetas, lista de la compra y avisos para toda la casa.</p>
        ${invitacionGuardada() ? `<div class="aviso-invitacion">🎉 <b>¡Te han invitado a crear tu familia en KeKoMeMos!</b><br>Entra con tu cuenta de Google para empezar.</div>` : ""}
        <button class="btn btn-primario btn-grande" data-accion="login-google">Entrar con Google</button>
        <button class="btn btn-grande" data-accion="login-anonimo">Entrar con el código familiar</button>
        <p class="suave" style="font-size:14px">Los adultos entran con su cuenta de Google. Los chicos pueden entrar solo con el código o el QR que tiene el administrador.</p>
      </div>`;
    return;
  }
  const anonimo = S.user?.isAnonymous;
  const u = S.union || {};
  let cuerpo;
  if (u.paso === "elegir") {
    cuerpo = `
      <div class="tarjeta seccion pila">
        <div class="etiqueta">${esc(u.hogar)}</div>
        <h2 class="titulo">¿Quién eres?</h2>
        <p class="suave" style="margin:0">Si ya habías entrado antes (en este u otro móvil), elige tu perfil: así no se duplica.</p>
        ${u.perfiles.length ? `<div class="selector-cocinero">${u.perfiles.map((m) => `<button data-accion="union-soy" data-id="${m.id}">${avatar(m, 80)}<span>${esc(m.nombre)}</span></button>`).join("")}</div>` : ""}
        <button class="btn btn-grande" data-accion="union-nuevo">Soy nuevo/a en la familia</button>
        <p class="suave" style="margin:0;font-size:14px">¿Eres adulto? Los adultos entran siempre con su cuenta de Google.</p>
        <button class="btn-enlace" data-accion="union-atras">‹ Cambiar código</button>
      </div>`;
  } else if (u.paso === "soy") {
    const m = u.perfiles.find((x) => x.id === u.miembroId);
    cuerpo = `
      <form class="tarjeta seccion pila" data-form="union-soy">
        <div class="fila">${avatar(m, 64)}<h2 class="titulo">Hola, ${esc(m?.nombre)}</h2></div>
        ${campoFecha("Para comprobar que eres tú, ¿cuál es tu fecha de nacimiento?")}
        <button class="btn btn-primario btn-grande">Entrar</button>
        <button type="button" class="btn-enlace" data-accion="union-elegir">‹ No soy yo</button>
      </form>`;
  } else if (u.paso === "nuevo") {
    cuerpo = `
      <form class="tarjeta seccion pila" data-form="union-nuevo">
        <div class="etiqueta">${esc(u.hogar)}</div>
        <h2 class="titulo">Bienvenido/a</h2>
        ${camposPerfil()}
        <button class="btn btn-primario btn-grande">Unirme</button>
        <button type="button" class="btn-enlace" data-accion="union-elegir">‹ Volver</button>
      </form>`;
  } else {
    cuerpo = `
      <form class="tarjeta seccion pila" data-form="union-codigo">
        <h2 class="h2">Unirme con código</h2>
        <label class="campo">Código familiar
          <input name="codigo" required maxlength="6" value="${esc(codigo)}" autocapitalize="characters" autocomplete="off" style="text-transform:uppercase;letter-spacing:.2em;font-size:22px">
        </label>
        <button class="btn btn-primario btn-grande">Continuar</button>
      </form>
      ${anonimo || !(invitacionGuardada() || esSuper()) ? "" : `
      <form class="tarjeta seccion pila" data-form="crear-hogar">
        <h2 class="h2">${invitacionGuardada() ? "🎉 Crea tu familia" : "…o crear un hogar nuevo"}</h2>
        ${invitacionGuardada() ? `<p class="suave" style="margin:0">Tienes una invitación para crear tu propia familia. Tú serás quien la administre.</p>` : ""}
        <label class="campo">Nombre del hogar <input name="hogar" required placeholder="Casa de los García"></label>
        ${camposPerfil()}
        <button class="btn btn-grande">Crear hogar</button>
      </form>`}`;
  }
  p.innerHTML = `
    <div class="entrada-caja">
      <h1 class="titulo">${anonimo ? "Únete a tu familia" : "Tu hogar"}</h1>
      ${cuerpo}
      <button class="btn btn-linea" data-accion="salir">Cerrar sesión</button>
    </div>`;
}
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function campoFecha(etiqueta, ayuda = "") {
  const anio = new Date().getFullYear();
  return `<div class="campo campo-fecha">
    <label for="fecha-texto">${etiqueta}</label>
    <input id="fecha-texto" name="nacimientoTexto" class="entrada-texto" inputmode="numeric" autocomplete="bday" placeholder="dd/mm/aaaa" maxlength="10" data-input="fecha-texto">
    <span class="fecha-o">o elige:</span>
    <div class="fecha-selects">
      <select data-input="fecha-sel" data-parte="d" aria-label="Día"><option value="">Día</option>${Array.from({ length: 31 }, (_, i) => `<option>${i + 1}</option>`).join("")}</select>
      <select data-input="fecha-sel" data-parte="m" aria-label="Mes"><option value="">Mes</option>${MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("")}</select>
      <select data-input="fecha-sel" data-parte="y" aria-label="Año"><option value="">Año</option>${Array.from({ length: 100 }, (_, i) => `<option>${anio - i}</option>`).join("")}</select>
    </div>
    <input type="hidden" name="nacimiento">
    ${ayuda ? `<small>${ayuda}</small>` : ""}
  </div>`;
}
// sincroniza el texto, los desplegables y el valor real (aaaa-mm-dd)
function sincronizarFecha(caja, origen) {
  const txt = caja.querySelector('[data-input="fecha-texto"]');
  const sel = (p) => caja.querySelector(`[data-parte="${p}"]`);
  const oculto = caja.querySelector('input[name="nacimiento"]');
  let d, m, y;
  if (origen === "texto") {
    const dig = txt.value.replace(/\D/g, "").slice(0, 8);
    txt.value = dig.length > 4 ? `${dig.slice(0, 2)}/${dig.slice(2, 4)}/${dig.slice(4)}` : dig.length > 2 ? `${dig.slice(0, 2)}/${dig.slice(2)}` : dig;
    if (dig.length === 8) { d = +dig.slice(0, 2); m = +dig.slice(2, 4); y = +dig.slice(4); }
  } else {
    d = +sel("d").value; m = +sel("m").value; y = +sel("y").value;
  }
  const valida = d && m && y && y > 1900 && new Date(y, m - 1, d).getDate() === d && new Date(y, m - 1, d) <= new Date();
  if (valida) {
    oculto.value = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (origen === "texto") { sel("d").value = String(d); sel("m").value = String(m); sel("y").value = String(y); }
    else txt.value = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  } else oculto.value = "";
  caja.classList.toggle("fecha-mal", !valida && (txt.value.length === 10 || origen === "sel" && d && m && y));
}
const fechaDe = (f) => {
  const v = f.get("nacimiento");
  if (!v) notificar("Escribe la fecha de nacimiento (dd/mm/aaaa) o elígela.");
  return v;
};

function camposPerfil() {
  return `
    <label class="campo">Tu nombre <input name="nombre" required maxlength="24" value="${esc(S.user?.displayName?.split(" ")[0] || "")}"></label>
    ${campoFecha("Fecha de nacimiento", `Sirve para adaptar el reto del menú. Hasta los ${EDAD_ADULTO} años el perfil es de menor.`)}`;
}
function generarCodigo() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => letras[n % letras.length]).join("");
}
function datosMiembro(f, codigo) {
  const e = edad(f.get("nacimiento"));
  return {
    nombre: f.get("nombre").trim(), nacimiento: f.get("nacimiento"),
    rol: e !== null && e < EDAD_ADULTO ? "menor" : "adulto",
    codigo, tema: "pizarra", puntos: {}, tokens: [], foto: S.user.photoURL || null, creado: serverTimestamp()
  };
}

const FORMULARIOS = {
  async reparto(f) {
    const r = { diarias: f.getAll("diarias"), turnos: f.getAll("turnos"), personas: f.getAll("personas"), inicio: reparto().inicio };
    await updateDoc(doc(db, "hogares", S.hogarId), { reparto: r });
    cerrarModal(); notificar("Reparto guardado: las misiones de hoy ya están actualizadas"); render();
  },
  async objetivo(f) {
    const puntos = Math.max(50, Math.min(5000, Number(f.get("puntos")) || OBJETIVO.puntos));
    await updateDoc(doc(db, "hogares", S.hogarId), { objetivo: { puntos, premio: String(f.get("premio") || "").trim() || OBJETIVO.premio } });
    notificar("Objetivo familiar guardado");
  },
  async premio(f) {
    const nombre = String(f.get("nombre") || "").trim();
    if (!nombre) return;
    const nuevo = { id: "p" + Date.now().toString(36), emoji: String(f.get("emoji") || "").trim() || "🎁", nombre, coste: Math.max(5, Number(f.get("coste")) || 50) };
    await updateDoc(doc(db, "hogares", S.hogarId), { premios: [...premios(), nuevo].sort((a, b) => a.coste - b.coste) });
    modalConfigMisiones();
  },
  async "tarea-propia"(f) {
    const nombre = String(f.get("nombre") || "").trim();
    if (!nombre) return;
    const nueva = { id: "x" + Date.now().toString(36), zona: f.get("zona") || "casa", emoji: String(f.get("emoji") || "").trim() || "⭐", nombre,
      hecho: `ha hecho «${nombre.toLowerCase()}»`, puntos: Number(f.get("puntos")) || 15, min: 15, max: 1 };
    await updateDoc(doc(db, "hogares", S.hogarId), { tareasPropias: [...(S.hogar?.tareasPropias || []), nueva] });
    modalConfigMisiones();
  },
  async encargar(f) {
    const uid = f.get("uid"), t = tareaDef(f.get("tarea"));
    if (!uid || !t) return;
    await addDoc(col$("tareas"), { tarea: t.id, uid, puntos: t.puntos, por: S.user.uid, quien: yoActivo().id, fecha: hoy(), estado: "asignada", encargo: true, creadoMs: Date.now(), ts: serverTimestamp() });
    enviarAviso(`📋 ${nombreDe(uid)}, tienes una misión nueva: ${t.nombre} (+${t.puntos} ★)`, "texto", uid).catch(() => {});
    cerrarModal(); notificar(`Misión encargada a ${nombreDe(uid)}`);
  },
  async invitacion(f, form) {
    const nota = String(f.get("nota") || "").trim();
    const ref = await addDoc(collection(db, "invitaciones"), { creadaPor: S.user.uid, creadaMs: Date.now(), nota, usada: false });
    form.reset();
    S.invitaciones = null; render();
    await compartirInvitacion(ref.id, nota);
  },
  async restar(f) {
    const uid = f.get("uid"), n = Number(f.get("n")), motivo = f.get("motivo");
    await addDoc(col$("tareas"), { tarea: "penalizacion", motivo, uid, puntos: -n, por: S.user.uid, quien: yoActivo().id, fecha: hoy(), estado: "ok", creadoMs: Date.now(), ts: serverTimestamp() });
    await sumarPuntos(uid, -n);
    cerrarModal();
    notificar(`−${n} puntos para ${nombreDe(uid)} · ${motivo}`);
  },
  async renombrar(f, form) {
    const nombre = String(f.get("nombre") || "").trim();
    if (!nombre) return;
    await updateDoc(ref$("miembros", form.dataset.id), { nombre });
    cerrarModal();
    notificar("Nombre cambiado");
  },
  async reiniciar(f, form) {
    if (String(f.get("confirmar") || "").trim().toUpperCase() !== "BORRAR") return notificar("Escribe BORRAR para confirmar.");
    const b = form.querySelector("button"); b.disabled = true; b.textContent = "Reiniciando…";
    try {
      const msg = await reiniciar(form.dataset.que);
      cerrarModal();
      notificar(msg);
    } catch (e) { console.error(e); notificar("No se ha podido reiniciar: " + (e.code || e.message)); b.disabled = false; b.textContent = "Reiniciar"; }
  },
  async "union-codigo"(f, form) {
    const codigo = String(f.get("codigo") || "").trim().toUpperCase();
    const b = form.querySelector("button"); b.disabled = true; b.textContent = "Comprobando…";
    try {
      const r = await unirseFn({ accion: "listar", codigo });
      S.union = { codigo, hogar: r.data.hogar, perfiles: r.data.perfiles || [], paso: "elegir" };
      mostrarEntrada("unirse");
    } catch (e) { notificar(e.message || "Código no válido"); b.disabled = false; b.textContent = "Continuar"; }
  },
  async "union-soy"(f, form) {
    const b = form.querySelector("button.btn-primario"); b.disabled = true; b.textContent = "Entrando…";
    try {
      const nacimiento = fechaDe(f);
      if (!nacimiento) { b.disabled = false; b.textContent = "Entrar"; return; }
      const r = await unirseFn({ accion: "soy", codigo: S.union.codigo, miembroId: S.union.miembroId, nacimiento });
      await terminarUnion(r.data);
    } catch (e) { notificar(e.message || "No se ha podido entrar"); b.disabled = false; b.textContent = "Entrar"; }
  },
  async "union-nuevo"(f, form) {
    const b = form.querySelector("button.btn-primario"); b.disabled = true; b.textContent = "Uniéndote…";
    try {
      const nacimiento = fechaDe(f);
      if (!nacimiento) { b.disabled = false; b.textContent = "Unirme"; return; }
      const r = await unirseFn({ accion: "nuevo", codigo: S.union.codigo, nombre: f.get("nombre"), nacimiento });
      if (r.data.existente) notificar("¡Ya estabas en la familia! Entrando en tu perfil.");
      await terminarUnion(r.data);
    } catch (e) { notificar(e.message || "No se ha podido crear el perfil"); b.disabled = false; b.textContent = "Unirme"; }
  },
  async "crear-hogar"(f) {
    if (!fechaDe(f)) return;
    const inv = invitacionGuardada();
    if (inv && !esSuper()) {
      const d = await getDoc(doc(db, "invitaciones", inv)).catch(() => null);
      if (!d?.exists() || d.data().usada) { localStorage.removeItem("invitacion"); mostrarEntrada("unirse"); return notificar("Esta invitación ya se ha usado o no existe. Pide otra a Rubén."); }
    }
    const hogarRef = doc(collection(db, "hogares"));
    const codigo = generarCodigo();
    const nombre = f.get("hogar").trim();
    const b = writeBatch(db);
    b.set(hogarRef, { nombre, codigo, admin: S.user.uid, cocineraHabitual: S.user.uid, creado: serverTimestamp(), ...(inv ? { invitacion: inv } : {}) });
    if (inv) b.update(doc(db, "invitaciones", inv), { usada: true, hogarId: hogarRef.id, familia: nombre, usadaPor: S.user.uid, usadaEmail: S.user.email || "", usadaMs: Date.now() });
    b.set(doc(db, "codigos", codigo), { hogarId: hogarRef.id });
    const m = datosMiembro(f, codigo);
    m.rol = "adulto";
    b.set(doc(db, "hogares", hogarRef.id, "miembros", S.user.uid), m);
    b.set(doc(db, "usuarios", S.user.uid), { hogarId: hogarRef.id });
    await b.commit();
    localStorage.removeItem("invitacion");
    conectarHogar(hogarRef.id);
    notificar(`¡Bienvenidos a KeKoMeMos, ${nombre}! Comparte el código ${codigo} con tu familia (Yo › Hogar).`);
  }
};

// Tras unirse: si es un perfil que ya existía, el servidor devuelve un pase para entrar en esa misma cuenta
async function terminarUnion(datos) {
  sessionStorage.removeItem("unir");
  S.union = null;
  if (datos?.token) { await signInWithCustomToken(auth, datos.token); return; }
  const u = await getDoc(doc(db, "usuarios", auth.currentUser.uid));
  conectarHogar(u.data().hogarId);
}

// =========================================================
// CONEXIÓN CON EL HOGAR
// =========================================================
onAuthStateChanged(auth, async (user) => {
  S.user = user;
  S.desuscribir.forEach((f) => f());
  S.desuscribir = [];
  if (!user) return mostrarEntrada("login");
  try {
    const u = await getDoc(doc(db, "usuarios", user.uid));
    if (!u.exists() || !u.data().hogarId) return mostrarEntrada("unirse");
    conectarHogar(u.data().hogarId);
  } catch (e) {
    console.error(e);
    mostrarEntrada("unirse");
  }
});

function conectarHogar(hid) {
  S.hogarId = hid;
  S.cargado.clear();
  const listo = (clave) => {
    S.cargado.add(clave);
    if (S.cargado.size >= 5 && $("#app").hidden && S.yo) arrancarApp();
    else if (!$("#app").hidden) refrescar();
  };
  const err = (e) => { console.error(e); if (e.code === "permission-denied") mostrarEntrada("unirse"); };
  S.desuscribir.push(
    onSnapshot(doc(db, "hogares", hid), (d) => { S.hogar = { id: d.id, ...d.data() }; listo("hogar"); }, err),
    onSnapshot(col$("miembros"), (qs) => {
      S.miembros = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
      S.yo = miembro(S.user.uid);
      if (!S.yo) return mostrarEntrada("unirse");
      aplicarTema();
      if (!$("#app").hidden) vigilarNivel();
      listo("miembros");
    }, err),
    onSnapshot(query(col$("recetas"), orderBy("titulo")), (qs) => { S.recetas = qs.docs.map((d) => ({ id: d.id, ...d.data() })); listo("recetas"); }, err),
    onSnapshot(query(col$("menus"), where("fecha", ">=", iso(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)))), (qs) => {
      S.menus = {};
      qs.docs.forEach((d) => { S.menus[d.id] = d.data(); });
      listo("menus");
    }, err),
    onSnapshot(col$("despensa"), (qs) => { S.despensa = qs.docs.map((d) => ({ id: d.id, ...d.data() })); listo("despensa"); }, err),
    onSnapshot(query(col$("avisos"), orderBy("ts", "desc"), limit(30)), (qs) => {
      S.avisos = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
      qs.docChanges().forEach((c) => { if (c.type === "added") recibirAviso({ id: c.doc.id, ...c.doc.data() }); });
    }, err),
    onSnapshot(query(col$("tareas"), where("estado", "==", "pendiente")), (qs) => {
      S.tareasPendientes = qs.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.creadoMs || 0) - (b.creadoMs || 0));
      if ($("#app").hidden) return;
      // al jefe le salta la verificación cuando hay tareas nuevas por revisar
      if (esJefe() && S.tareasPendientes.length > S.pendientesVistos && $("#modal").hidden) modalVerificar();
      S.pendientesVistos = S.tareasPendientes.length;
      refrescar();
    }, err),
    onSnapshot(query(col$("canjes"), orderBy("creadoMs", "desc"), limit(40)), (qs) => {
      S.canjes = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
      if ($("#app").hidden) return;
      qs.docChanges().forEach((c) => {
        const x = c.doc.data();
        if (c.type === "modified" && x.estado === "entregado" && x.uid === yoActivo()?.id && !qs.metadata.hasPendingWrites) celebrar("¡Premio conseguido!", `${x.emoji || "🎁"} ${x.nombre}`, `−${x.coste} ★`);
      });
      const n = S.canjes.filter((c) => c.estado === "pendiente").length;
      if (esJefe() && n > S.canjesVistos && $("#modal").hidden) modalVerificar();
      S.canjesVistos = n;
      refrescar();
    }, err),
    onSnapshot(query(col$("tareas"), where("fecha", "==", hoy())), (qs) => {
      S.tareasHoy = qs.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.creadoMs || 0) - (b.creadoMs || 0));
      qs.docChanges().forEach((c) => {
        const x = c.doc.data();
        if (c.type !== "modified" || !x.premio || x.uid !== yoActivo()?.id || S.celebrados.has(c.doc.id) || qs.metadata.hasPendingWrites) return;
        S.celebrados.add(c.doc.id);
        if (!$("#app").hidden) celebrar(x.top ? "¡Perfecto!" : "¡Misión verificada!", `+${x.premio} ★`, tareaDef(x.tarea).nombre);
      });
      if (!$("#app").hidden) refrescar();
    }, err)
  );
}

function aplicarTema() {
  const tema = (esTablet() && localStorage.getItem("temaTablet")) || S.yo?.tema || "pizarra";
  document.body.dataset.tema = tema;
  const color = getComputedStyle(document.body).getPropertyValue("--primario").trim();
  $('meta[name="theme-color"]').setAttribute("content", color || "#2E6B4F");
}

// Genera con Gemini la foto de las recetas que no tienen (máx. 3 por sesión, sin repetir intentos el mismo día)
let fotosEnCurso = false;
async function rellenarFotos(max = 3) {
  if (fotosEnCurso) return;
  fotosEnCurso = true;
  try {
    const pendientes = S.recetas.filter((r) => !r.foto && (Date.now() - (r.fotoIntento || 0)) > 86400000).slice(0, max);
    for (const r of pendientes) { if (await fotoParaReceta(r.id, false) === "sin-saldo") break; }
  } finally { fotosEnCurso = false; }
}
async function fotoParaReceta(id, avisar = true) {
  const r = receta(id);
  if (!r) return;
  await updateDoc(ref$("recetas", id), { fotoIntento: Date.now() });
  try {
    if (avisar) notificar(`KeKoMeMos está preparando la foto de ${r.titulo}…`);
    const blob = await comprimir(await IA.generarFotoPlato(r.titulo, r.ingredientes || []));
    const url = await subirImagen(`hogares/${S.hogarId}/recetas/${id}-${Date.now()}.jpg`, blob);
    const actual = receta(id);
    if (actual?.foto && !actual.fotoGenerada) return; // alguien subió una foto mientras tanto: la suya manda
    await updateDoc(ref$("recetas", id), { foto: url, fotoGenerada: true });
    if (avisar) notificar("Foto lista");
  } catch (e) {
    console.error("Foto con Gemini:", e);
    if (/prepayment|credits|402/i.test(String(e?.message))) { if (avisar) notificar(errorIA(e, "No se ha podido crear la foto")); return "sin-saldo"; }
    if (avisar) notificar(errorIA(e, "No se ha podido crear la foto"));
  }
}

function recuperarActivo() {
  try {
    const a = JSON.parse(sessionStorage.getItem("activo") || "null");
    if (a && miembro(a.id) && Date.now() - a.ts < MINUTOS_INACTIVIDAD * 60000) { S.activoId = a.id; return true; }
  } catch { /* nada */ }
  return false;
}
function fijarActivo(id) {
  S.activoId = id;
  S.ultimoUso = Date.now();
  S.retoInline = null;
  try { sessionStorage.setItem("activo", JSON.stringify({ id, ts: Date.now() })); } catch { /* nada */ }
}
function preguntarQuienEres() {
  S.activoId = null;
  try { sessionStorage.removeItem("activo"); } catch { /* nada */ }
  const orden = [...S.miembros].sort((a, b) => (a.rol === b.rol ? a.nombre.localeCompare(b.nombre) : a.rol === "adulto" ? -1 : 1));
  abrirModal(`<div class="modal-cabecera"><h2 class="titulo">¿Quién eres?</h2></div>
    <p class="suave" style="margin:0">Toca tu foto para entrar.</p>
    <div class="selector-cocinero quien-eres">${orden.map((m) => `<button data-soy="${m.id}">${avatar(m, 96)}<span>${esc(m.nombre)}</span></button>`).join("")}</div>`, true);
  $("#modal").dataset.fijo = "1";
  $(".quien-eres").addEventListener("click", (e) => {
    const b = e.target.closest("[data-soy]");
    if (!b) return;
    delete $("#modal").dataset.fijo;
    cerrarModal();
    fijarActivo(b.dataset.soy);
    S.vista = "hoy";
    render();
    notificar(`¡Hola, ${nombreDe(b.dataset.soy)}!`);
  });
}

function arrancarApp() {
  $("#cargando").hidden = true;
  $("#pantalla-entrada").hidden = true;
  $("#app").hidden = false;
  if (esTablet() && !recuperarActivo()) preguntarQuienEres();
  render();
  if (esAdulto() && !EMULADORES) setTimeout(rellenarFotos, 4000);
  if (!EMULADORES && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(console.error);
}

// Vuelve a pintar tras cambios de datos sin pisar lo que se está escribiendo
function refrescar() {
  const activo = document.activeElement;
  if (["editor"].includes(S.vista)) return;
  if (activo && $("#vista").contains(activo) && /INPUT|TEXTAREA|SELECT/.test(activo.tagName)) { S.pendiente = true; return; }
  render();
}
document.addEventListener("focusout", () => setTimeout(() => {
  if (S.pendiente && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) { S.pendiente = false; render(); }
}, 50));

// =========================================================
// RENDER
// =========================================================
function navItems() {
  const items = [["hoy", "Hoy"], ["misiones", "Misiones"], ["semana", "Menús"], ["recetas", "Recetas"], ["compra", "Compra"], ["yo", "Yo"]];
  return esMenor() ? items.filter(([v]) => v !== "semana" && v !== "recetas") : items;
}
function render() {
  const vistaBase = { receta: "recetas", editor: "recetas" }[S.vista] || S.vista;
  const items = navItems();
  $("#nav").innerHTML = items.map(([v, t], i) =>
    `${i === items.length - 1 ? '<span class="nav-hueco"></span>' : ""}<button data-accion="ir" data-vista="${v}" ${vistaBase === v ? 'aria-current="page"' : ""}>${icono(v)}${t}</button>`
  ).join("");
  const sinLeer = S.avisos.filter((a) => a.de !== S.user.uid && (a.para === "todos" || a.para === S.user.uid) && (a.creadoMs || 0) > Number(localStorage.getItem("avisosLeidos") || 0)).length;
  const titulos = { hoy: S.hogar?.nombre || "Hoy en casa", semana: "Planificador de menús", recetas: "Recetas", receta: "Receta", editor: S.param ? "Editar receta" : "Nueva receta", compra: "Lista de la compra", yo: "Mi perfil", misiones: esMenor() ? "Tus misiones" : "Misiones de casa" };
  const yo = yoActivo();
  titulos.hoy = esMenor() ? `¡Hola, ${yo?.nombre || ""}!` : (comidaActual() === "comida" ? "¿Qué comemos hoy?" : "¿Qué cenamos hoy?");
  $("#cabecera").innerHTML = `
    <div class="cab-fila">
      <div class="cab-familia">${esc(S.hogar?.nombre || "KeKoMeMos")}</div>
      <div class="cabecera-acciones">
        ${yo ? `<button class="cab-persona" data-accion="quien-soy" aria-label="${esTablet() ? "Cambiar de persona" : "Mi perfil"}: ${esc(yo.nombre)}">${avatar(yo, 30)}<span class="cab-nombre">${esTablet() ? "Soy " : ""}${esc(yo.nombre)}</span></button>` : ""}
        <button class="cab-campana" data-accion="bandeja" aria-label="Avisos${sinLeer ? `: ${sinLeer} sin leer` : ""}">${icono("campana")}${sinLeer ? `<span class="contador">${sinLeer}</span>` : ""}</button>
      </div>
    </div>
    <div class="cab-sub">
      <div class="fecha">${esc(fechaLarga(new Date()))}</div>
      <h1>${esc(titulos[S.vista] || "")}</h1>
    </div>`;
  pintarBloqueo();
  const vistas = { hoy: vistaHoy, semana: vistaSemana, recetas: vistaRecetas, receta: vistaReceta, editor: vistaEditor, compra: vistaCompra, yo: vistaYo, misiones: vistaMisiones };
  $("#vista").innerHTML = (vistas[S.vista] || vistaHoy)();
}

// ---------- HOY ----------
// El estado del reto se guarda en la ficha del menor (Firestore): salir, recargar o cambiar de móvil no lo salta
const claveDia = (tipo) => `${hoy()}-${tipo}`;
const claveReto = (tipo, persona = yoActivo()) => `reto-${persona?.id}-${hoy()}-${tipo}`;
const retoResuelto = (tipo, persona = yoActivo()) => !!persona?.resueltos?.[claveDia(tipo)] || localStorage.getItem(claveReto(tipo, persona)) === "1";
const tieneTipo = (r, tipo) => !r.tipos?.length || r.tipos.includes(tipo);

// Recetas más habituales para comida o cena (las más planificadas, luego favoritas)
function habituales(tipo, n = 4) {
  const cuenta = {};
  Object.values(S.menus).forEach((m) => { if (m.recetaId) cuenta[m.recetaId] = (cuenta[m.recetaId] || 0) + (m.tipo === tipo ? 2 : 1); });
  return S.recetas
    .filter((r) => tieneTipo(r, tipo) && !(r.tipos?.length && r.tipos.every((t) => ["postre", "merienda", "desayuno"].includes(t))))
    .filter((r) => !repetidaCercaSin(r.id, hoy(), `${hoy()}_${tipo}`, {}))
    .map((r) => ({ r, p: (cuenta[r.id] || 0) + (r.veces || 0) + (r.categoria === "favoritos" ? 1.5 : 0) + Math.random() * 0.5 }))
    .sort((a, b) => b.p - a.p).slice(0, n).map((x) => x.r);
}
function sugerenciasHTML(tipo) {
  const lista = habituales(tipo);
  if (!lista.length) return esAdulto() ? `<p class="suave" style="margin:0">Aún no hay recetas. Añade la primera desde Recetas.</p>` : "";
  return `<div class="sugerencias">
    <div class="etiqueta">${esAdulto() ? "Opciones habituales · toca para elegir" : "Opciones habituales"}</div>
    <div class="sugerencias-lista">${lista.map((r) => `<button class="sugerencia" ${esAdulto() ? `data-accion="asignar-sugerencia" data-hueco="${hoy()}_${tipo}" data-id="${r.id}"` : `data-accion="ver-receta" data-id="${r.id}"`}>
      <span class="foto">${fotoHTML(r)}</span><span>${esc(r.titulo)}</span></button>`).join("")}</div>
  </div>`;
}
function lineaCocina() {
  const c = miembro(cocineraHoy());
  if (!c) return "";
  return esAdulto()
    ? `<button class="linea-cocina" data-accion="cambiar-cocinera">${avatar(c, 28)}<span>Hoy cocina ${esc(c.nombre)}</span><span class="suave">· cambiar</span></button>`
    : `<div class="linea-cocina">${avatar(c, 28)}<span>Hoy cocina ${esc(c.nombre)}</span></div>`;
}

function tarjetaPlato(tipo, grande) {
  const m = S.menus[`${hoy()}_${tipo}`];
  const r = m && receta(m.recetaId);
  const titulo = r?.titulo || m?.titulo;
  const oculto = esMenor() && !retoResuelto(tipo);
  const etiqueta = tipo === "comida" ? "Comida" : "Cena";
  if (!titulo) {
    return `<article class="tarjeta plato ${grande ? "" : "compacto"}">
      ${grande ? `<div class="plato-cuerpo"><span class="etiqueta">${etiqueta} · sin planificar</span>` : `<div class="plato-cuerpo"><div class="etiqueta">${etiqueta}</div>`}
        <div class="plato-titulo">${esMenor() ? "Aún no está decidido" : "¿Qué hacemos?"}</div>
        ${grande ? sugerenciasHTML(tipo) : ""}
        ${esAdulto() ? `<div class="fila"><button class="btn btn-primario" data-accion="elegir-hueco" data-hueco="${hoy()}_${tipo}">${grande ? "Ver todas las recetas" : "Elegir plato"}</button>
        <button class="btn btn-acento" data-accion="dame-ideas" data-tipo="${tipo}">${icono("chispa")}Dame ideas</button></div>` : ""}
        ${grande ? lineaCocina() : ""}
      </div></article>`;
  }
  const meta = [r?.minutos ? `${r.minutos} min` : "", CATEGORIAS[r?.categoria] || "", r?.subcategoria || ""].filter(Boolean).join(" · ");
  return `<article class="tarjeta plato ${grande ? "" : "compacto"}" style="position:relative">
    <div class="foto ${oculto ? "oculto-reto" : ""}">${fotoHTML(r, "Sin foto")}${grande ? `<span class="etiqueta-flotante">${etiqueta.toUpperCase()}</span>` : ""}</div>
    <div class="plato-cuerpo">
      ${grande ? "" : `<div class="etiqueta">${etiqueta}</div>`}
      <div class="${oculto ? "oculto-reto" : ""}"><div class="plato-titulo">${esc(titulo)}</div><div class="suave">${esc(meta)}</div></div>
      ${oculto ? "" : `
      <div class="fila">
        ${r ? `<button class="btn" data-accion="ver-receta" data-id="${r.id}">Ver receta</button>` : ""}
        ${esAdulto() ? `<button class="btn" data-accion="elegir-hueco" data-hueco="${hoy()}_${tipo}">Cambiar</button>` : ""}
        ${r && esAdulto() && grande ? `<button class="btn btn-primario" data-accion="cocinar" data-id="${r.id}">${icono("mic")}Cocinar</button>` : ""}
      </div>`}
      ${grande ? lineaCocina() : ""}
    </div></article>`;
}

// Capa a pantalla completa: un menor no ve nada de la app hasta acertar el reto de la comida o cena actual
function pintarBloqueo() {
  let capa = $("#bloqueo-reto");
  if (!capa) { capa = document.createElement("div"); capa.id = "bloqueo-reto"; capa.className = "bloqueo-reto"; document.body.appendChild(capa); }
  const html = heroReto();
  capa.hidden = !html;
  capa.innerHTML = html ? `<div class="bloqueo-cab"><span class="cab-familia">${esc(S.hogar?.nombre || "KeKoMeMos")}</span>
      ${esTablet() ? `<button class="btn" data-accion="cambiar-persona">No soy ${esc(yoActivo().nombre)}</button>` : ""}</div>${html}` : "";
}

// Pantalla grande para los menores: ¿KEKOmemos? / ¿KECEnamos? con un botón gigante
const SEGUNDOS_BOMBA = EMULADORES ? 3 : 10;
function heroReto() {
  const tipo = comidaActual();
  const persona = yoActivo();
  if (!esMenor() || retoResuelto(tipo)) return "";
  const empezado = persona.reto?.clave === claveDia(tipo);
  // si ya había empezado el reto (y salió de la app), se le vuelve a poner delante: no se puede saltar
  if (empezado && !S.retoAbierto) setTimeout(() => { if (!S.retoAbierto && $("#modal").hidden) abrirReto(persona, tipo); }, 300);
  else setTimeout(() => prepararReto(persona, tipo), 0);
  return `<section class="hero-keko">
    <h2 class="hero-titulo">${tipo === "comida" ? "¿KEKO<span>memos</span>?" : "¿KECE<span>namos</span>?"}</h2>
    <p>${esc(persona.nombre)}, pulsa el botón y supera el reto para descubrir ${tipo === "comida" ? "la comida" : "la cena"}</p>
    <button class="boton-fisico" data-accion="abrir-reto" aria-label="Abrir el reto">
      <span class="boton-onda" aria-hidden="true"></span><span class="boton-onda dos" aria-hidden="true"></span>
      <span class="boton-anillo"><span class="boton-bisel"><span class="boton-cara"><span class="boton-brillo" aria-hidden="true"></span>¡PULSA!</span></span></span>
    </button>
  </section>`;
}
const limpiarParaGuardar = (o) => JSON.parse(JSON.stringify(o || {}));
function prepararReto(persona, tipo) {
  const clave = claveDia(tipo);
  const st = S.retoInline;
  if (st && st.personaId === persona.id && st.clave === clave) return st.promesa;
  const guardado = persona.reto?.clave === clave ? persona.reto : null;
  const nuevo = { personaId: persona.id, tipo, clave, fallos: guardado?.fallos || [], bloqueoHasta: guardado?.bloqueoHasta || 0, pistaVista: !!guardado?.pistaVista,
    progreso: guardado?.progreso || { hechas: [], secuencia: [] }, sel: null };
  S.retoInline = nuevo;
  nuevo.promesa = guardado?.datos
    ? Promise.resolve((nuevo.reto = guardado.datos))
    : IA.generarAcertijo(edad(persona.nacimiento) ?? 16).then((r) => (nuevo.reto = limpiarParaGuardar(r)));
  return nuevo.promesa;
}
function guardarReto() {
  const st = S.retoInline;
  if (!st?.reto) return;
  updateDoc(ref$("miembros", st.personaId), {
    reto: { clave: st.clave, datos: st.reto, fallos: st.fallos, bloqueoHasta: st.bloqueoHasta, pistaVista: st.pistaVista, progreso: st.progreso }
  }).catch(console.error);
}
async function abrirReto(persona = yoActivo(), tipo = comidaActual()) {
  if (retoResuelto(tipo, persona)) return render();
  S.retoAbierto = true;
  abrirModal(`<div class="reto-fx" aria-hidden="true"></div><div class="reto-cargando"><div class="cargando-plato"></div><p>KeKoMeMos está preparando tu reto…</p></div>`, true, "modal-reto");
  $("#modal").dataset.fijo = "1"; // no se cierra hasta acertar
  await prepararReto(persona, tipo);
  if ($("#modal").hidden) return;
  guardarReto();
  pintarReto(persona);
}
function pintarReto(persona) {
  const st = S.retoInline, r = st.reto;
  const bloqueado = st.bloqueoHasta > Date.now();
  const cuerpo = $("#modal .modal");
  if (!cuerpo) return;
  cuerpo.innerHTML = `<div class="reto-fx" aria-hidden="true"></div>
    <div class="modal-cabecera"><span class="reto-categoria">${esc(r.categoria || "Reto")}</span><span class="suave" style="font-size:13px">Acierta para salir 😉</span></div>
    <div class="reto-pregunta">${esc(r.pregunta)}</div>
    ${bloqueado ? `<div class="bomba" role="timer" aria-live="polite">
        <svg class="bomba-svg" viewBox="0 0 64 64" aria-hidden="true"><circle cx="28" cy="38" r="20" fill="#1d1d1f"/><rect x="34" y="14" width="10" height="9" rx="2" transform="rotate(35 39 18)" fill="#444"/><path d="M44 12 q6 -8 12 -4" stroke="#8a6d3b" stroke-width="3" fill="none"/><circle class="chispa-mecha" cx="56" cy="8" r="4" fill="#ffb300"/><circle cx="21" cy="31" r="5" fill="#fff" opacity=".25"/></svg>
        <div><div class="bomba-cuenta" id="cuenta-bomba">00:${String(Math.ceil((st.bloqueoHasta - Date.now()) / 1000)).padStart(2, "0")}</div>
        <div class="bomba-texto">¡Fallaste! Espera a que la mecha se apague para volver a intentarlo…</div></div>
      </div>` : ""}
    ${zonaRespuesta(st, bloqueado)}
    ${r.pista ? (st.pistaVista ? `<p class="reto-pista">💡 ${esc(r.pista)}</p>` : `<button class="btn-enlace" data-accion="ver-pista">💡 Ver una pista</button>`) : ""}`;
  clearInterval(S.relojBomba);
  if (bloqueado) {
    S.relojBomba = setInterval(() => {
      const quedan = Math.ceil((st.bloqueoHasta - Date.now()) / 1000);
      const c = $("#cuenta-bomba");
      if (quedan <= 0 || !c) { clearInterval(S.relojBomba); if (c) pintarReto(persona); return; }
      c.textContent = `00:${String(quedan).padStart(2, "0")}`;
      c.classList.toggle("urgente", quedan <= 5);
    }, 250);
  }
}
// Zona para responder según el tipo de reto
function zonaRespuesta(st, bloqueado) {
  const r = st.reto, dis = bloqueado ? "disabled" : "";
  if (r.tipo === "parejas") {
    const hechas = st.progreso.hechas || [];
    const parDe = (a) => r.pares.find((p) => p.a === a)?.b;
    const bHechas = hechas.map(parDe);
    const btn = (lado, v) => {
      const hecha = lado === "a" ? hechas.includes(v) : bHechas.includes(v);
      const sel = st.sel?.lado === lado && st.sel.v === v;
      return `<button class="btn pareja ${hecha ? "hecha" : ""} ${sel ? "elegida" : ""}" data-accion="pareja" data-lado="${lado}" data-v="${esc(v)}" ${hecha || bloqueado ? "disabled" : ""}>${esc(v)}</button>`;
    };
    return `<p class="suave reto-instruccion">Toca uno de la izquierda y luego su pareja de la derecha (${hechas.length}/${r.pares.length}).</p>
      <div class="parejas"><div class="pila">${r.izquierda.map((v) => btn("a", v)).join("")}</div><div class="pila">${r.derecha.map((v) => btn("b", v)).join("")}</div></div>`;
  }
  if (r.tipo === "orden") {
    const sec = st.progreso.secuencia || [];
    return `<p class="suave reto-instruccion">Toca en el orden correcto (${sec.length}/${r.elementos.length}).</p>
      <div class="orden-hecho">${r.elementos.map((_, i) => `<span class="${sec[i] !== undefined ? "lleno" : ""}">${sec[i] !== undefined ? esc(r.mezclados[sec[i]]) : i + 1}</span>`).join("")}</div>
      <div class="reto-opciones orden">${r.mezclados.map((v, i) => `<button class="btn" data-accion="orden" data-i="${i}" ${sec.includes(i) || bloqueado ? "disabled" : ""}>${esc(v)}</button>`).join("")}</div>`;
  }
  return `<div class="reto-opciones">${r.opciones.map((o, i) => `<button class="btn ${st.fallos.includes(i) ? "mal" : ""}" data-accion="responder-reto" data-i="${i}" ${dis} ${st.fallos.includes(i) ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div>`;
}
function falloReto(st, persona) {
  st.bloqueoHasta = Date.now() + SEGUNDOS_BOMBA * 1000;
  st.sel = null;
  guardarReto();
  const caja = $("#modal .modal");
  caja?.classList.remove("temblor"); void caja?.offsetWidth; caja?.classList.add("temblor");
  navigator.vibrate?.([120, 60, 120]);
  pintarReto(persona);
}

// Explosión de confeti desde el centro (estilo promociones de apps de compras)
function estallido(n = 70) {
  const colores = ["#FFD84D", "#FF4D6D", "#FF8A00", "#3DDC97", "#4D9DFF", "#FFFFFF", "#C77DFF"];
  return `<div class="estallido" aria-hidden="true">${Array.from({ length: n }, (_, i) => {
    const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 260;
    return `<i style="--dx:${Math.round(Math.cos(a) * d)}px;--dy:${Math.round(Math.sin(a) * d - 60)}px;--r:${Math.round(Math.random() * 900 - 450)}deg;--c:${colores[i % colores.length]};--d:${(1.35 + Math.random() * 0.25).toFixed(2)}s;--w:${6 + Math.round(Math.random() * 8)}px"></i>`;
  }).join("")}</div>`;
}
async function retoAcertado(persona) {
  const st = S.retoInline;
  const yaEstaba = retoResuelto(st.tipo, persona);
  localStorage.setItem(claveReto(st.tipo, persona), "1");
  const cambios = { [`resueltos.${st.clave}`]: true, reto: deleteField() };
  if (!yaEstaba) cambios[`puntos.${mes()}`] = increment(PUNTOS_RETO);
  updateDoc(ref$("miembros", persona.id), cambios).catch(console.error);
  const m = S.menus[`${hoy()}_${st.tipo}`], rec = m && receta(m.recetaId);
  delete $("#modal").dataset.fijo;
  clearInterval(S.relojBomba);
  $("#modal").className = "modal-fondo modal-sorpresa-fondo";
  const cuerpo = $("#modal .modal");
  cuerpo.className = "modal modal-sorpresa";
  cuerpo.innerHTML = `
    <div class="sorpresa-rayos" aria-hidden="true"></div>
    <div class="sorpresa-luz" aria-hidden="true"></div>
    <div class="regalo" aria-hidden="true"><div class="regalo-tapa"><span></span></div><div class="regalo-caja"><span></span></div></div>
    ${estallido()}
    <div class="sorpresa-carta">
      <div class="sorpresa-cinta">${st.tipo === "comida" ? "¡HOY KEKOMEMOS!" : "¡HOY KECENAMOS!"}</div>
      <div class="sorpresa-foto">${rec?.foto ? `<img src="${esc(rec.foto)}" alt="">` : `<span>🍽️</span>`}<i class="destello" aria-hidden="true"></i></div>
      <div class="sorpresa-plato">${esc(m?.titulo || "¡Sorpresa! Aún no está decidido")}</div>
      <div class="sorpresa-bien">¡Bien, ${esc(persona.nombre)}!</div>
      ${!yaEstaba ? `<div class="sorpresa-puntos"><span class="moneda">★</span>+${PUNTOS_RETO} puntos</div>` : ""}
      ${st.reto.explicacion ? `<p class="sorpresa-explica">${esc(st.reto.explicacion)}</p>` : ""}
      <button class="btn btn-acento btn-grande sorpresa-boton" data-accion="cerrar-modal">¡A la mesa!</button>
    </div>
    <div class="estrellitas" aria-hidden="true">${"<i></i>".repeat(14)}</div>`;
  navigator.vibrate?.([60, 40, 60, 40, 200]);
  setTimeout(() => IA.sonar?.(), 1300);
  S.retoInline = null;
}

function panelAvisos() {
  const cena = new Date().getHours() >= 17;
  return `<section class="panel">
    <h2 class="h2" style="margin-bottom:12px">Avisar a la familia</h2>
    <div class="botones-aviso">
      <button class="btn btn-acento" data-accion="aviso-rapido" data-tipo="comer">${cena ? "¡La cena está lista!" : "¡A comer!"}</button>
      <button class="btn" data-accion="aviso-rapido" data-tipo="mesa">Poned la mesa</button>
      <button class="btn" data-accion="aviso-rapido" data-tipo="falta">¿Cuánto falta?</button>
      <button class="btn" data-accion="aviso-comprar">Comprad…</button>
      <button class="btn btn-linea" data-accion="aviso-escribir">+ Escribir</button>
    </div>
  </section>`;
}

function panelTareas() {
  const texto = (t) => t.tarea === "penalizacion" ? esc(t.motivo || "Penalización") : esc(tareaDef(t.tarea).hecho);
  const estado = (t) => t.estado === "pendiente" ? `<span class="estado-tarea pendiente">⏳ por verificar</span>`
    : t.estado === "rechazada" ? `<span class="estado-tarea rechazada">✗ no contó</span>`
    : t.estado === "asignada" ? `<span class="estado-tarea asignada">📋 encargada</span>`
    : `<span class="${t.puntos < 0 ? "estado-tarea resta" : "suave"}">${t.puntos > 0 ? "+" : ""}${t.premio ?? t.puntos}</span>`;
  const hechas = S.tareasHoy.map((t) => `<li>${avatar(miembro(t.uid), 32)}<span class="crece"><b>${esc(nombreDe(t.uid))}</b> ${texto(t)}</span>${estado(t)}</li>`).join("");
  const pend = S.tareasPendientes.length + S.canjes.filter((c) => c.estado === "pendiente").length;
  return `${esMenor() ? panelMisionesHoy(yoActivo(), true) : ""}<section class="tarjeta seccion">
    <div class="fila" style="justify-content:space-between;margin-bottom:12px"><h2 class="h2">Tareas de casa</h2>
      <button class="btn btn-linea" data-accion="ir" data-vista="misiones">🏆 Misiones y premios ›</button></div>
    ${esJefe() ? `<div class="fila" style="margin-bottom:10px">
      ${pend ? `<button class="btn btn-acento" data-accion="ver-pendientes">✓ Verificar tareas (${pend})</button>` : ""}
      <button class="btn btn-peligro" data-accion="restar-puntos">− Restar puntos</button>
    </div>` : ""}
    <div class="botones-aviso">
      ${RAPIDAS.map(tareaDef).map((t) => `<button class="btn" data-accion="tarea" data-tarea="${t.id}">${esc(t.nombre)} <span class="suave">+${t.puntos}</span></button>`).join("")}
    </div>
    ${hechas ? `<ul class="lista" style="margin-top:10px">${hechas}</ul>` : ""}
  </section>`;
}

function panelSemanaMini() {
  const filas = [1, 2, 3].map((n) => {
    const d = masDias(new Date(), n), f = iso(d);
    const c = S.menus[`${f}_comida`], x = S.menus[`${f}_cena`];
    return `<b>${esc(diaCorto(d))}</b><span>${esc(c?.titulo || "—")}</span><span class="suave">${esc(x?.titulo || "—")}</span>`;
  }).join("");
  return `<section class="tarjeta seccion"><h2 class="h2" style="margin-bottom:10px">Próximos días</h2><div class="semana-mini">${filas}</div></section>`;
}

function panelRanking(completo = false) {
  const lista = [...S.miembros].sort((a, b) => puntosMes(b) - puntosMes(a));
  const max = Math.max(1, ...lista.map(puntosMes));
  const nombreMes = new Date().toLocaleDateString("es-ES", { month: "long" });
  return `<section class="tarjeta seccion">
    <div class="fila" style="justify-content:space-between;margin-bottom:12px"><h2 class="h2">Liga de ${esc(nombreMes)}</h2><span class="suave" style="font-size:14px">tareas · compra · retos</span></div>
    <div class="ranking">
      ${lista.map((m, i) => `<div class="ranking-fila">
        <b>${i + 1}</b>${avatar(m, 36)}
        <span>${esc(m.nombre)} <span class="nivel-mini" title="${esc(nivelDe(m).nombre)}">${nivelDe(m).emoji}</span>${i === 0 && puntosMes(m) > 0 ? '<span class="corona">· Líder del mes</span>' : ""}</span>
        <b>${puntosMes(m)} pts</b>
        <div class="barra-progreso"><span style="width:${Math.round((puntosMes(m) / max) * 100)}%"></span></div>
      </div>`).join("")}
    </div>
    ${completo ? `<p class="suave" style="font-size:14px;margin:14px 0 0">Cada tarea vale de 5 a 40 pts según el esfuerzo · «¡Perfecto!» +50 % · rachas y día perfecto dan bonus · reto del menú +${PUNTOS_RETO}. Quien gane el mes elige la cena especial del sábado.</p>` : ""}
  </section>`;
}

// ---------- MISIONES (pantallas) ----------
const anillo = (hechas, total, dentro) => `<span class="anillo ${total && hechas >= total ? "lleno" : ""}" style="--p:${total ? Math.round((hechas / total) * 100) : 0}">${dentro}</span>`;
function botonMision(x) {
  const etiqueta = x.estado === "porhacer" ? "Marcar hecha" : x.estado === "ok" ? "Hecha" : "Por verificar";
  return `<button class="mision ${x.estado}" data-accion="hacer-mision" data-tarea="${esc(x.def.id)}" ${x.estado !== "porhacer" ? "disabled" : ""} aria-label="${etiqueta}: ${esc(x.def.nombre)}">
    <span class="m-emoji" aria-hidden="true">${x.def.emoji}</span>
    <span class="m-txt"><b>${esc(x.def.nombre)}</b><small>${x.encargo ? "📋 Encargo · " : ""}${esc(zonaDe(x.def.zona).nombre)} · ~${x.def.min} min</small></span>
    <span class="m-pts">+${x.def.puntos}</span>
    <span class="m-check" aria-hidden="true">${x.estado === "ok" ? "✓" : x.estado === "pendiente" ? "⏳" : ""}</span>
  </button>`;
}
function panelMisionesHoy(m, compacto = false) {
  const l = estadoMisiones(m.id), ok = l.filter((x) => x.estado === "ok").length, perfecto = m.perfectoDia === hoy();
  return `<section class="tarjeta seccion misiones-hoy">
    <div class="mh-cab">${anillo(ok, l.length, `<b>${ok}/${l.length}</b>`)}
      <div class="crece"><h2 class="h2">Tus misiones de hoy</h2>
        <small class="suave">${perfecto ? "💯 ¡Día perfecto conseguido!" : l.length ? `Hazlas todas y ganas el bonus Día perfecto (+${PUNTOS_PERFECTO})` : "Hoy no tienes misiones fijas: elige alguna tarea extra."}</small></div>
      ${compacto ? `<button class="btn" data-accion="ir" data-vista="misiones">Ver todo ›</button>` : ""}
    </div>
    ${l.length ? `<div class="lista-misiones">${l.map(botonMision).join("")}</div>` : ""}
  </section>`;
}
function heroJugador(m) {
  const nv = nivelDe(m), r = rachaDe(m), s = saldoDe(m), lg = logrosDe(m).length;
  return `<section class="hero-jugador">
    <div class="hj-cara">${avatar(m, 88)}<span class="hj-insignia" aria-hidden="true">${nv.emoji}</span></div>
    <div class="hj-info">
      <small class="hj-nivel">Nivel ${nv.i + 1} · ${esc(nv.nombre)}</small>
      <strong>${esc(m.nombre)}</strong>
      <div class="hj-xp" role="progressbar" aria-label="Progreso de nivel" aria-valuenow="${nv.pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${nv.pct}%"></span></div>
      <small>${nv.siguiente ? `${nv.xp} / ${nv.hasta} XP · faltan ${nv.hasta - nv.xp} para <b>${esc(nv.siguiente)}</b>` : `${nv.xp} XP · ¡nivel máximo!`}</small>
    </div>
    <div class="hj-stats">
      <div class="hj-stat ${r ? "fuego" : ""}"><b>🔥 ${r}</b><small>${r === 1 ? "día" : "días"} de racha</small></div>
      <div class="hj-stat"><b>★ ${s}</b><small>para gastar</small></div>
      <div class="hj-stat"><b>🏅 ${lg}/${LOGROS.length}</b><small>logros</small></div>
    </div>
  </section>`;
}
function panelControl() {
  const pend = S.tareasPendientes.length + S.canjes.filter((c) => c.estado === "pendiente").length;
  return `<section class="tarjeta seccion control-adultos">
    <div class="fila" style="justify-content:space-between;margin-bottom:10px"><h2 class="h2">Panel de adultos</h2><span class="suave" style="font-size:14px">solo lo ves tú</span></div>
    <div class="control-botones">
      <button class="btn ${pend ? "btn-acento" : ""}" data-accion="ver-pendientes">✓ Revisar${pend ? ` (${pend})` : ""}</button>
      <button class="btn" data-accion="encargar">📋 Encargar misión</button>
      <button class="btn btn-peligro" data-accion="restar-puntos">− Restar puntos</button>
      <button class="btn" data-accion="config-misiones">⚙️ Configurar</button>
    </div>
  </section>`;
}
function panelEquipoHoy(chicos) {
  return `<section class="tarjeta seccion">
    <div class="fila" style="justify-content:space-between;margin-bottom:12px"><h2 class="h2">Misiones de hoy</h2><span class="suave" style="font-size:14px">los turnos rotan cada día</span></div>
    <div class="equipo-hoy">${chicos.map((m) => {
      const l = estadoMisiones(m.id), ok = l.filter((x) => x.estado === "ok").length, nv = nivelDe(m), r = rachaDe(m);
      return `<div class="eq-fila">${anillo(ok, l.length, avatar(m, 46))}
        <div class="crece"><div class="eq-nombre"><b>${esc(m.nombre)}</b><small class="suave">${nv.emoji} ${esc(nv.nombre)}${r ? ` · 🔥 ${r}` : ""} · ${ok}/${l.length}</small></div>
          <div class="chips-misiones">${l.length ? l.map((x) => `<button class="cm ${x.estado}" data-accion="mision-de" data-uid="${m.id}" data-tarea="${esc(x.def.id)}" ${x.estado !== "porhacer" ? "disabled" : ""}><span aria-hidden="true">${x.def.emoji}</span> ${esc(x.def.nombre)}${x.estado === "ok" ? " ✓" : x.estado === "pendiente" ? " ⏳" : ""}</button>`).join("") : `<span class="suave">Sin misiones hoy</span>`}</div>
        </div></div>`;
    }).join("")}</div>
  </section>`;
}
function panelBolsa() {
  const z = S.zonaBolsa || "cocina";
  return `<section class="tarjeta seccion">
    <div class="fila" style="justify-content:space-between;margin-bottom:10px"><h2 class="h2">Tareas extra</h2><span class="suave" style="font-size:14px">${esMenor() ? "más ★ para la tienda" : "apunta quién ha hecho qué"}</span></div>
    <div class="chips-scroll zonas" role="tablist">${ZONAS.map((x) => `<button class="chip" role="tab" aria-selected="${x.id === z}" aria-pressed="${x.id === z}" data-accion="zona" data-zona="${x.id}"><span aria-hidden="true">${x.emoji}</span> ${esc(x.nombre)}</button>`).join("")}</div>
    <div class="bolsa">${catalogo().filter((t) => t.zona === z).map((t) => `<button class="tarea-card" data-accion="tarea" data-tarea="${esc(t.id)}">
      <span class="tc-emoji" aria-hidden="true">${esc(t.emoji)}</span><span class="tc-txt"><b>${esc(t.nombre)}</b><small>~${t.min} min</small></span><span class="tc-pts">+${t.puntos}</span></button>`).join("")}</div>
  </section>`;
}
function panelObjetivo() {
  const o = objetivo(), v = S.hogar?.equipo?.[lunesIso()] || 0, pct = Math.min(100, Math.round((v / o.puntos) * 100)), hecho = v >= o.puntos;
  return `<section class="tarjeta seccion objetivo-familiar ${hecho ? "hecho" : ""}">
    <div class="fila" style="justify-content:space-between"><h2 class="h2">Objetivo familiar</h2><span class="suave" style="font-size:14px">esta semana · todos juntos</span></div>
    <div class="of-premio"><span aria-hidden="true">${hecho ? "🎉" : "🎯"}</span> ${esc(o.premio)}</div>
    <div class="of-barra" role="progressbar" aria-label="Objetivo familiar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
    <div class="of-pie"><b>${v} / ${o.puntos} pts</b><span>${hecho ? "¡Conseguido!" : `faltan ${o.puntos - v}`}</span></div>
  </section>`;
}
function panelTienda(m) {
  const s = saldoDe(m), mios = canjesPendientes(m.id), menor = m.rol === "menor";
  return `<section class="tarjeta seccion">
    <div class="fila" style="justify-content:space-between;margin-bottom:12px"><h2 class="h2">Tienda de premios</h2>${menor ? `<span class="saldo">★ ${s}</span>` : `<span class="suave" style="font-size:14px">los chicos canjean sus ★</span>`}</div>
    ${mios.length ? `<div class="canje-espera">⏳ Esperando a que un adulto te lo dé: ${mios.map((c) => esc(c.nombre)).join(", ")}</div>` : ""}
    <div class="tienda">${premios().map((p) => {
      const falta = p.coste - s;
      return `<div class="ticket ${menor && falta > 0 ? "bloqueado" : ""}">
        <span class="tk-emoji" aria-hidden="true">${esc(p.emoji)}</span>
        <span class="tk-txt"><b>${esc(p.nombre)}</b><small>${p.coste} ★</small>${menor && falta > 0 ? `<span class="tk-barra"><span style="width:${Math.round((s / p.coste) * 100)}%"></span></span>` : ""}</span>
        ${menor ? (falta > 0 ? `<span class="tk-falta">faltan ${falta}</span>` : `<button class="btn btn-acento" data-accion="canjear" data-id="${esc(p.id)}">Canjear</button>`) : ""}
      </div>`;
    }).join("")}</div>
    <p class="suave" style="font-size:13px;margin:10px 0 0">Las ★ se ganan con tareas verificadas y retos. Gastarlas no baja el nivel ni el puesto en la liga.</p>
  </section>`;
}
function panelLogros(m) {
  const x = metricas(m), hechos = logrosDe(m);
  return `<section class="tarjeta seccion">
    <div class="fila" style="justify-content:space-between;margin-bottom:12px"><h2 class="h2">Logros${m.id !== yoActivo()?.id ? ` de ${esc(m.nombre)}` : ""}</h2><span class="suave" style="font-size:14px">${hechos.length} de ${LOGROS.length}</span></div>
    <div class="logros">${LOGROS.map((l) => {
      const v = Math.min(l.meta, l.valor(x)), ok = hechos.includes(l.id);
      return `<div class="logro ${ok ? "ok" : ""}"><span class="medalla" aria-hidden="true">${l.emoji}</span><b>${esc(l.nombre)}</b><small>${ok ? esc(l.texto) : `${v}/${l.meta} · ${esc(l.texto)}`}</small></div>`;
    }).join("")}</div>
  </section>`;
}
function vistaMisiones() {
  const yo = yoActivo(), chicos = S.miembros.filter((m) => m.rol === "menor");
  const verLogros = esMenor() ? yo : (miembro(S.verLogrosDe) || chicos[0] || yo);
  return `<div class="misiones">
    <div class="pila">
      ${heroJugador(yo)}
      ${esJefe() ? panelControl() : ""}
      ${esMenor() ? panelMisionesHoy(yo) : chicos.length ? panelEquipoHoy(chicos) : ""}
      ${panelBolsa()}
    </div>
    <div class="pila">
      ${panelObjetivo()}
      ${panelTienda(yo)}
      ${!esMenor() && chicos.length > 1 ? `<div class="chips-scroll">${chicos.map((m) => `<button class="chip" aria-pressed="${m.id === verLogros.id}" data-accion="ver-logros" data-id="${m.id}">${esc(m.nombre)}</button>`).join("")}</div>` : ""}
      ${panelLogros(verLogros)}
      ${panelRanking(true)}
    </div>
  </div>`;
}

function vistaHoy() {
  const actual = comidaActual(), otra = actual === "comida" ? "cena" : "comida";
  if (esMenor()) {
    return `<div class="hoy">
      <div class="pila">
        ${retoResuelto(actual) ? tarjetaPlato(actual, true) : ""}
        ${retoResuelto(otra) ? tarjetaPlato(otra, false) : ""}
        ${panelTareas()}
      </div>
      <div class="pila">${panelAvisos()}${panelRanking()}</div>
    </div>`;
  }
  return `<div class="hoy">
    <div class="pila">
      ${bannerPregunta()}
      ${tarjetaPlato(actual, true)}
      <button class="boton-ideas" data-accion="dame-ideas"><span class="ideas-emoji" aria-hidden="true">💡</span><span class="ideas-texto"><b>No sé qué cocinar</b><small>¡Dame ideas!</small></span><span class="ideas-flecha" aria-hidden="true">›</span></button>
      ${tarjetaPlato(otra, false)}
      ${botonCocinarAhora()}
      ${panelTareas()}
    </div>
    <div class="pila">
      ${panelAvisos()}
      ${panelSemanaMini()}
      ${panelRanking()}
    </div>
  </div>`;
}
function botonCocinarAhora() {
  const m = S.menus[`${hoy()}_${comidaActual()}`];
  const r = m && receta(m.recetaId);
  if (!r) return "";
  return `<button class="btn btn-oscuro btn-grande" data-accion="cocinar" data-id="${r.id}">${icono("mic")}Empezar a cocinar · manos libres</button>`;
}

// ---------- PLANIFICACIÓN AUTOMÁTICA ----------
const DIAS_SIN_REPETIR = 4;
// Elige una receta para un hueco: del tipo correcto (comida/cena), sin repetir en ±4 días, ponderada
function elegirParaHueco(huecoId, extra = {}, pool = S.recetas) {
  const [fecha, tipo] = huecoId.split("_");
  const finde = [0, 6].includes(deIso(fecha).getDay());
  const otros = { ...extra };
  delete otros[huecoId];
  const candidatas = pool.filter((r) => tieneTipo(r, tipo) && !(r.tipos?.length && r.tipos.every((t) => ["postre", "merienda", "desayuno", "entrante"].includes(t))))
    .filter((r) => !repetidaCercaSin(r.id, fecha, huecoId, otros));
  if (!candidatas.length) return null;
  const peso = (r) => (r.categoria === "favoritos" ? 4 : r.categoria === "quiero_probar" ? 1.5 : finde ? 3 : 0.4) + Math.min(r.veces || 0, 6) * 0.3;
  const total = candidatas.reduce((a, r) => a + peso(r), 0);
  let x = Math.random() * total;
  for (const r of candidatas) { x -= peso(r); if (x <= 0) return r; }
  return candidatas[0];
}
function repetidaCercaSin(recetaId, fecha, huecoId, extra) {
  const t = deIso(fecha).getTime();
  const todos = { ...S.menus, ...extra };
  delete todos[huecoId];
  return Object.values(todos).some((m) => m?.recetaId === recetaId && Math.abs(deIso(m.fecha).getTime() - t) < DIAS_SIN_REPETIR * 86400000);
}

// ---------- SEMANA ----------
function selectorCalendario() {
  return `<div class="chips">
    <button class="chip" data-accion="modo-cal" data-modo="semana" aria-pressed="${S.modoCal === "semana"}">Semana</button>
    <button class="chip" data-accion="modo-cal" data-modo="mes" aria-pressed="${S.modoCal === "mes"}">Mes</button>
  </div>`;
}
function accionesPlan() {
  return esAdulto() ? `<div class="fila">
      <button class="btn btn-primario crece" data-accion="sugerir-semana">${icono("chispa")}Rellenar huecos con KeKoMeMos</button>
      <button class="btn crece" data-accion="nueva-receta-plan">+ Nueva receta</button>
      <button class="btn crece" data-accion="compra-semana">${icono("compra")}Lista de la compra</button>
      <button class="btn btn-peligro" data-accion="vaciar-plan">Vaciar ${S.modoCal === "mes" ? "mes" : "semana"}</button>
    </div>` : "";
}
function vistaSemana() {
  if (S.modoCal === "mes") return vistaMes();
  const lunes = masDias(lunesDe(new Date()), S.semana * 7);
  const dias = Array.from({ length: 7 }, (_, i) => masDias(lunes, i));
  const hueco = (f, tipo) => {
    const id = `${f}_${tipo}`, m = S.menus[id];
    const marcado = S.intercambio === id ? "marcado" : "";
    return `<button class="hueco ${m ? "" : "vacio-hueco"} ${marcado}" data-accion="hueco" data-hueco="${id}">
      <small>${tipo}</small><span>${esc(m?.titulo || (esAdulto() ? "+ Añadir" : "—"))}</span></button>`;
  };
  return `<div class="pila">
    ${S.intercambio ? `<div class="banner"><span>Toca el otro hueco para intercambiarlos</span><button class="btn" data-accion="cancelar-intercambio">Cancelar</button></div>` : ""}
    <div class="fila">
      ${selectorCalendario()}
      <span class="crece"></span>
      <button class="btn" data-accion="semana" data-delta="-1" aria-label="Semana anterior">‹</button>
      <strong style="text-align:center">Semana del ${esc(lunes.toLocaleDateString("es-ES", { day: "numeric", month: "long" }))}</strong>
      <button class="btn" data-accion="semana" data-delta="1" aria-label="Semana siguiente">›</button>
    </div>
    ${accionesPlan()}
    <div class="semana">
      ${dias.map((d) => {
        const f = iso(d);
        return `<div class="dia ${f === hoy() ? "es-hoy" : ""}">
          <div class="dia-nombre">${esc(diaCorto(d))}<small>${d.getDate()}</small></div>
          ${hueco(f, "comida")}${hueco(f, "cena")}
        </div>`;
      }).join("")}
    </div>
  </div>`;
}
function vistaMes() {
  const base = new Date();
  const primero = new Date(base.getFullYear(), base.getMonth() + S.mesOffset, 1);
  const inicio = lunesDe(primero);
  const celdas = Array.from({ length: 42 }, (_, i) => masDias(inicio, i));
  const filas = celdas[35].getMonth() === primero.getMonth() ? 6 : (celdas[28].getMonth() === primero.getMonth() ? 5 : 4);
  const t0 = primero.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const titulo = t0.charAt(0).toUpperCase() + t0.slice(1);
  return `<div class="pila">
    ${S.intercambio ? `<div class="banner"><span>Toca el otro día para intercambiar</span><button class="btn" data-accion="cancelar-intercambio">Cancelar</button></div>` : ""}
    <div class="fila">
      ${selectorCalendario()}
      <span class="crece"></span>
      <button class="btn" data-accion="mes" data-delta="-1" aria-label="Mes anterior">‹</button>
      <strong style="text-align:center">${esc(titulo)}</strong>
      <button class="btn" data-accion="mes" data-delta="1" aria-label="Mes siguiente">›</button>
    </div>
    ${accionesPlan()}
    <div class="mes">
      ${["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].map((d) => `<div class="mes-cabecera">${d}</div>`).join("")}
      ${celdas.slice(0, filas * 7).map((d) => {
        const f = iso(d), c = S.menus[`${f}_comida`], x = S.menus[`${f}_cena`];
        const fuera = d.getMonth() !== primero.getMonth();
        return `<button class="mes-dia ${fuera ? "fuera" : ""} ${f === hoy() ? "es-hoy" : ""}" data-accion="dia" data-fecha="${f}" aria-label="${esc(fechaLarga(d))}">
          <b>${d.getDate()}</b>
          <span class="${c ? "" : "vacio-mes"}">${esc(c?.titulo || "·")}</span>
          <span class="${x ? "" : "vacio-mes"}">${esc(x?.titulo || "·")}</span>
        </button>`;
      }).join("")}
    </div>
    <p class="suave" style="margin:0;font-size:14px">En cada día: arriba la comida, abajo la cena. Toca un día para organizarlo.</p>
  </div>`;
}

// ---------- RECETAS ----------
function vistaRecetas() {
  const filtros = [["todas", "Todas"], ...TIPOS_PLATO, ...Object.entries(CATEGORIAS)];
  const b = normal(S.busqueda);
  const lista = S.recetas.filter((r) =>
    (S.filtro === "todas" || r.categoria === S.filtro || (r.tipos || []).includes(S.filtro)) && (!b || normal(r.titulo).includes(b) || (r.ingredientes || []).some((i) => normal(i.nombre).includes(b))));
  return `<div class="pila">
    <div class="fila">
      <label class="oculto-visual" for="buscar">Buscar receta</label>
      <input id="buscar" class="entrada-texto crece" placeholder="Buscar por nombre o ingrediente" value="${esc(S.busqueda)}" data-input="buscar">
      ${esAdulto() ? `<button class="btn btn-primario" data-accion="anadir-receta">+ Añadir receta</button>
        <button class="btn" data-accion="copia-recetas" title="Exportar o importar todas las recetas">⇅ Copia</button>` : ""}
    </div>
    <div class="chips-scroll">${filtros.map(([id, t]) => `<button class="chip" data-accion="filtro" data-filtro="${id}" aria-pressed="${S.filtro === id}">${esc(t)}</button>`).join("")}</div>
    ${lista.length ? `<div class="rejilla-recetas">${lista.map((r) => `
      <button class="tarjeta receta-tarjeta" data-accion="ver-receta" data-id="${r.id}">
        <div class="foto">${fotoHTML(r)}</div>
        <div class="info"><strong>${esc(r.titulo)}</strong><span class="suave" style="font-size:13px">${esc([nombresTipos(r), r.minutos ? r.minutos + " min" : ""].filter(Boolean).join(" · "))}</span></div>
      </button>`).join("")}</div>`
      : `<div class="vacio">${S.recetas.length ? "Nada coincide con la búsqueda." : "Aún no hay recetas. Crea la primera o impórtala desde un texto o una foto."}</div>`}
  </div>`;
}

const nombresTipos = (r) => (r.tipos || []).map((t) => TIPOS_PLATO.find(([id]) => id === t)?.[1]).filter(Boolean).join(", ");
function vistaReceta() {
  const r = receta(S.param);
  if (!r) return `<div class="vacio">Receta no encontrada.</div>`;
  const ing = (r.ingredientes || []).map((i) => {
    const hay = S.despensa.some((d) => d.estado === "hay" && normal(d.nombre) === normal(i.nombre));
    return `<li><span class="crece">${esc([i.cantidad, i.unidad && i.unidad !== "ud" ? i.unidad : "", i.nombre].filter((x) => x !== null && x !== undefined && x !== "").join(" "))}</span>${hay ? '<span class="suave">en casa</span>' : ""}</li>`;
  }).join("");
  return `<div class="pila">
    <div class="fila"><button class="btn" data-accion="ir" data-vista="recetas">‹ Recetas</button></div>
    <div class="receta-detalle">
      <div class="pila">
        <div class="foto">${fotoHTML(r, "Sin foto")}</div>
        <div class="fila">
          ${esAdulto() ? `<button class="btn btn-primario" data-accion="cocinar" data-id="${r.id}">${icono("mic")}Cocinar manos libres</button>
          <button class="btn" data-accion="planificar" data-id="${r.id}">Planificar</button>
          <button class="btn" data-accion="editar-receta" data-id="${r.id}">Editar</button>
          ${!r.foto || r.fotoGenerada ? `<button class="btn" data-accion="foto-receta" data-id="${r.id}">${icono("chispa")}${r.foto ? "Otra foto con IA" : "Crear foto con IA"}</button>` : ""}` : ""}
        </div>
      </div>
      <div class="pila">
        <div>
          <div class="etiqueta">${esc([nombresTipos(r), CATEGORIAS[r.categoria], r.subcategoria].filter(Boolean).join(" · "))}</div>
          <h2 class="titulo">${esc(r.titulo)}</h2>
          <div class="suave">${esc([r.minutos ? r.minutos + " min" : "", r.raciones ? r.raciones + " raciones" : ""].filter(Boolean).join(" · "))}</div>
        </div>
        <section class="tarjeta seccion"><h3 class="h2" style="margin-bottom:8px">Ingredientes</h3><ul class="lista">${ing || '<li class="suave">Sin ingredientes</li>'}</ul></section>
        <section class="tarjeta seccion"><h3 class="h2" style="margin-bottom:8px">Pasos</h3><ol class="pasos">${(r.pasos || []).map((p) => `<li>${esc(p)}</li>`).join("") || '<li class="suave">Sin pasos</li>'}</ol></section>
        ${/^https?:\/\//.test(r.fuente || "") ? `<a href="${esc(r.fuente)}" target="_blank" rel="noopener noreferrer">Ver la receta original (${esc(new URL(r.fuente).hostname.replace(/^www\./, ""))})</a>` : ""}
        ${esAdulto() ? `<button class="btn btn-peligro" data-accion="borrar-receta" data-id="${r.id}">Eliminar receta</button>` : ""}
      </div>
    </div>
  </div>`;
}

function textoIngredientes(lista) {
  return (lista || []).map((i) => [i.cantidad ?? "", i.unidad && i.unidad !== "ud" ? i.unidad : "", i.nombre].filter((x) => x !== "").join(" ")).join("\n");
}
function leerIngredientes(texto) {
  const unidades = "g|gr|kg|ml|l|cucharadas?|cucharaditas?|dientes?|pizcas?|latas?|ud|unidades?|al gusto";
  return texto.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(new RegExp(`^([\\d.,/½¼¾]+)?\\s*(${unidades})?\\.?\\s*(?:de\\s+)?(.+)$`, "i"));
    if (!m) return { nombre: l, cantidad: null, unidad: "" };
    const n = m[1] ? Number(m[1].replace(",", ".").replace("½", ".5").replace("¼", ".25").replace("¾", ".75")) : null;
    let u = (m[2] || (n !== null ? "ud" : "")).toLowerCase().replace(/^gr$/, "g").replace(/^unidades?$/, "ud");
    u = u.replace(/s$/, (s) => (["cucharadas", "cucharaditas", "dientes", "pizcas", "latas"].includes(u) ? "" : s));
    return { nombre: m[3].trim(), cantidad: Number.isFinite(n) ? n : null, unidad: u };
  });
}

function tiposPorDefecto() {
  const t = S.asignarA?.split("_")[1];
  return t ? [t] : ["comida", "cena"];
}
function vistaEditor() {
  const r = S.borrador || receta(S.param) || { categoria: "favoritos" };
  const foto = S.editorFoto?.url || r.foto;
  const destino = S.asignarA ? (() => { const [f, t] = S.asignarA.split("_"); return `<div class="banner"><span>Al guardar se añadirá al menú: ${esc(fechaLarga(deIso(f)))} · ${t}</span></div>`; })() : "";
  return `<form class="pila" data-form="guardar-receta" style="max-width:900px">
    ${destino}
    <div class="fila"><button type="button" class="btn" data-accion="${S.param ? "ver-receta" : "ir"}" data-id="${esc(S.param || "")}" data-vista="recetas">‹ Volver</button></div>
    <div class="receta-detalle">
      <div class="pila">
        <div class="foto" id="editor-foto" style="aspect-ratio:4/3;border-radius:var(--radio)">${foto ? `<img src="${esc(foto)}" alt="">` : "<span>Sin foto</span>"}</div>
        <div class="fila botones-foto">
          <button type="button" class="btn btn-primario crece" data-accion="buscar-fotos">${icono("buscar")}Buscar fotos en internet</button>
          <label class="btn crece">Subir foto<input type="file" accept="image/*" data-input="foto-receta" hidden></label>
          <button type="button" class="btn crece" data-accion="generar-foto">${icono("chispa")}Crear con IA</button>
        </div>
      </div>
      <div class="pila">
        <label class="campo">Nombre <input name="titulo" required value="${esc(r.titulo || "")}"></label>
        <fieldset class="campo tipos"><legend>Es para…</legend>
          <div class="chips">${TIPOS_PLATO.map(([id, t]) => `<label class="chip"><input type="checkbox" name="tipos" value="${id}" ${(r.tipos || tiposPorDefecto()).includes(id) ? "checked" : ""}> ${t}</label>`).join("")}</div>
        </fieldset>
        <input type="hidden" name="fuente" value="${esc(r.fuente || "")}">
        <div class="fila">
          <label class="campo crece">Categoría
            <select name="categoria">${Object.entries(CATEGORIAS).map(([id, t]) => `<option value="${id}" ${r.categoria === id ? "selected" : ""}>${t}</option>`).join("")}</select></label>
          <label class="campo crece">Ocasión especial
            <select name="subcategoria"><option value="">—</option>${SUBCATEGORIAS.map((s) => `<option ${r.subcategoria === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
        </div>
        <div class="fila">
          <label class="campo crece">Minutos <input name="minutos" type="number" min="0" inputmode="numeric" value="${esc(r.minutos ?? "")}"></label>
          <label class="campo crece">Raciones <input name="raciones" type="number" min="1" inputmode="numeric" value="${esc(r.raciones ?? 5)}"></label>
        </div>
        <label class="campo">Ingredientes <textarea name="ingredientes" rows="7" placeholder="400 g fideo grueso&#10;2 dientes ajo&#10;1 l caldo de pescado">${esc(textoIngredientes(r.ingredientes))}</textarea><small>Uno por línea: cantidad, unidad e ingrediente.</small></label>
        <label class="campo">Pasos <textarea name="pasos" rows="8" placeholder="Un paso por línea">${esc((r.pasos || []).join("\n"))}</textarea></label>
        <button class="btn btn-primario btn-grande">Guardar receta</button>
      </div>
    </div>
  </form>`;
}

// ---------- COMPRA ----------
function vistaCompra() {
  const orden = (a, b) => normal(a.nombre).localeCompare(normal(b.nombre));
  const falta = S.despensa.filter((d) => d.estado === "falta").sort(orden);
  const comprado = S.despensa.filter((d) => d.estado === "comprado").sort(orden);
  const hay = S.despensa.filter((d) => d.estado === "hay").sort(orden);
  const fila = (d) => `<li>
    <button class="check" role="checkbox" aria-checked="${d.estado === "comprado"}" data-accion="marcar" data-id="${d.id}" aria-label="Marcar ${esc(d.nombre)}">${d.estado === "comprado" ? icono("check") : ""}</button>
    <span class="crece ${d.estado === "comprado" ? "tachado" : ""}">${esc(d.nombre)}${d.cantidad ? ` <span class="suave">· ${esc(d.cantidad)}</span>` : ""}</span>
    ${esAdulto() ? `<button class="btn-x" data-accion="borrar-item" data-id="${d.id}" aria-label="Quitar ${esc(d.nombre)}">×</button>` : ""}
  </li>`;
  return `<div class="compra">
    <div class="pila">
      <form class="fila" data-form="anadir-item">
        <label class="oculto-visual" for="nuevo-item">Producto</label>
        <input id="nuevo-item" name="nombre" class="entrada-texto crece" placeholder="Añadir: pan, nata, arroz…" required autocomplete="off">
        <input name="cantidad" class="entrada-texto" placeholder="Cant." style="width:90px" autocomplete="off" aria-label="Cantidad">
        <button class="btn btn-primario">Añadir</button>
      </form>
      <section class="tarjeta seccion">
        <h2 class="h2" style="margin-bottom:6px">Por comprar (${falta.length + comprado.length})</h2>
        <ul class="lista">${[...falta, ...comprado].map(fila).join("") || '<li class="suave">¡No falta nada!</li>'}</ul>
        ${comprado.length ? `<button class="btn btn-acento btn-grande" style="width:100%;margin-top:10px" data-accion="guardar-compra">Ya está en casa (${comprado.length})</button>` : ""}
      </section>
      ${esAdulto() ? `<button class="btn" data-accion="compra-semana">${icono("chispa")}Añadir lo que falta para el menú de la semana</button>` : ""}
    </div>
    <section class="tarjeta seccion">
      <h2 class="h2" style="margin-bottom:6px">Hay en casa (${hay.length})</h2>
      <ul class="lista">${hay.map((d) => `<li><span class="crece">${esc(d.nombre)}</span><button class="btn" style="min-height:40px" data-accion="se-acabo" data-id="${d.id}">Se acabó</button>${esAdulto() ? `<button class="btn-x" data-accion="borrar-item" data-id="${d.id}" aria-label="Quitar ${esc(d.nombre)}">×</button>` : ""}</li>`).join("") || '<li class="suave">Al guardar la compra, los productos aparecen aquí.</li>'}</ul>
    </section>
  </div>`;
}

// ---------- YO ----------
function vistaYo() {
  const yo = yoActivo();
  const temaActual = (esTablet() && localStorage.getItem("temaTablet")) || yo.tema;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const notifActivas = typeof Notification !== "undefined" && Notification.permission === "granted" && (yo.tokens || []).length > 0;
  return `<div class="hoy">
    <div class="pila">
      <section class="tarjeta seccion pila">
        <div class="fila">
          ${avatar(yo, 72)}
          <div class="crece"><strong style="font-size:20px">${esc(yo.nombre)}</strong><div class="suave">${yo.rol === "adulto" ? "Adulto" : "Menor"} · ${puntosMes(yo)} pts este mes</div></div>
          <label class="btn">Cambiar foto<input type="file" accept="image/*" data-input="foto-perfil" hidden></label>
        </div>
        <form class="fila" data-form="nombre">
          <label class="oculto-visual" for="mi-nombre">Nombre</label>
          <input id="mi-nombre" name="nombre" class="entrada-texto crece" value="${esc(yo.nombre)}" maxlength="24" required>
          <button class="btn">Guardar</button>
        </form>
      </section>
      <section class="tarjeta seccion">
        <h2 class="h2" style="margin-bottom:10px">Tema ${esTablet() ? "de esta tablet" : ""}</h2>
        <div class="temas">${TEMAS.map((t) => `<button class="tema-opcion" data-accion="tema" data-tema="${t.id}" aria-pressed="${temaActual === t.id}">
          <span class="muestras">${t.colores.map((c) => `<i style="background:${c}"></i>`).join("")}</span>${esc(t.nombre)}</button>`).join("")}</div>
      </section>
      <section class="tarjeta seccion pila">
        <h2 class="h2">Notificaciones</h2>
        ${ios && !instalada ? `<p class="suave">En iPhone las notificaciones solo funcionan con la app instalada: en Safari pulsa <b>Compartir</b> › <b>Añadir a pantalla de inicio</b> y ábrela desde el icono.</p>` : ""}
        <button class="btn ${notifActivas ? "" : "btn-primario"}" data-accion="notificaciones">${notifActivas ? "Notificaciones activadas en este dispositivo" : "Activar notificaciones en este dispositivo"}</button>
      </section>
      <section class="tarjeta seccion pila">
        <h2 class="h2">Este dispositivo</h2>
        <label class="interruptor">
          <span class="int-texto"><b>Tablet de la cocina</b><small>Al abrir pregunta «¿Quién eres?» y tiene su propio tema</small></span>
          <input type="checkbox" role="switch" data-input="modo-tablet" ${esTablet() ? "checked" : ""}>
          <span class="int-pista" aria-hidden="true"></span>
        </label>
        <div class="fila">
          ${esTablet() ? `<button class="btn crece" data-accion="cambiar-persona">Cambiar de persona</button>` : ""}
          <button class="btn btn-linea crece" data-accion="salir">Cerrar sesión</button>
        </div>
      </section>
    </div>
    <div class="pila">
      ${panelRanking(true)}
      ${puedeOrdenarFamilia() ? panelHogar() : ""}
      ${puedeReiniciar() ? panelReinicio() : ""}
      ${esSuper() ? panelFamilias() : ""}
      ${esAdulto() ? `<section class="tarjeta seccion pila"><h2 class="h2">KeKoMeMos (IA ${IA.CON_GEMINI ? "Gemini" : "gratuita · Cloudflare"})</h2>
        <p class="suave" style="margin:0">La IA escribe recetas, crea las fotos de los platos, pone los acertijos, rellena la semana, calcula la compra y te ayuda en el modo cocina.</p>
        <div class="fila"><button class="btn" data-accion="probar-ia">Probar la IA</button>
        <button class="btn" data-accion="fotos-pendientes">${icono("chispa")}Crear fotos que faltan</button></div></section>` : ""}
    </div>
  </div>`;
}

async function fusionarMiembros(dup, keep) {
  if (dup.id === S.user.uid) throw new Error(`«${dup.nombre}» es el perfil con el que estás usando la app en este dispositivo: quédate con ese y junta el otro dentro.`);
  const puntos = { ...(keep.puntos || {}) };
  Object.entries(dup.puntos || {}).forEach(([k, v]) => { puntos[k] = (puntos[k] || 0) + v; });
  const lote = writeBatch(db);
  lote.update(ref$("miembros", keep.id), {
    puntos,
    gastado: (keep.gastado || 0) + (dup.gastado || 0),
    contador: Object.fromEntries([...new Set([...Object.keys(keep.contador || {}), ...Object.keys(dup.contador || {})])].map((k) => [k, (keep.contador?.[k] || 0) + (dup.contador?.[k] || 0)])),
    logros: { ...(dup.logros || {}), ...(keep.logros || {}) },
    resueltos: { ...(dup.resueltos || {}), ...(keep.resueltos || {}) },
    tokens: [...new Set([...(keep.tokens || []), ...(dup.tokens || [])])],
    foto: keep.foto || dup.foto || null,
    nacimiento: keep.nacimiento || dup.nacimiento || ""
  });
  if (S.hogar.admin === dup.id) lote.update(doc(db, "hogares", S.hogarId), { admin: keep.id });
  lote.delete(ref$("miembros", dup.id));
  if (S.hogar.cocineraHabitual === dup.id) lote.update(doc(db, "hogares", S.hogarId), { cocineraHabitual: keep.id });
  await lote.commit();
}
// ---------- FAMILIAS NUEVAS (solo Rubén) ----------
function panelFamilias() {
  if (!S.invitaciones) cargarInvitaciones();
  const lista = S.invitaciones || [];
  return `<section class="tarjeta seccion pila zona-familias">
    <h2 class="h2">Familias nuevas · solo Rubén</h2>
    <p class="suave" style="margin:0">Crea un enlace para que otra familia tenga su propio KeKoMeMos. Quien lo abra entra con Google, crea su familia y la administra. Te llegará un aviso cuando la cree.</p>
    <form class="fila" data-form="invitacion">
      <label class="oculto-visual" for="inv-nota">Para quién</label>
      <input id="inv-nota" name="nota" class="entrada-texto crece" placeholder="Para quién (ej. Familia Pérez)" maxlength="60" autocomplete="off">
      <button class="btn btn-primario">Crear enlace</button>
    </form>
    ${lista.length ? `<ul class="lista">${lista.map((i) => `<li style="flex-wrap:wrap">
      <span class="crece"><b>${esc(i.nota || "Sin nombre")}</b><br><small class="suave">${i.usada ? `✅ Creada: «${esc(i.familia || "")}» · ${esc(i.usadaEmail || "")}${i.usadaMs ? " · " + new Date(i.usadaMs).toLocaleDateString("es-ES") : ""}` : `⏳ Pendiente · creada el ${new Date(i.creadaMs).toLocaleDateString("es-ES")}`}</small></span>
      ${i.usada ? "" : `<button class="btn" data-accion="compartir-invitacion" data-id="${i.id}" data-nota="${esc(i.nota || "")}">Compartir</button>
      <button class="btn-x" data-accion="borrar-invitacion" data-id="${i.id}" aria-label="Anular invitación">×</button>`}
    </li>`).join("")}</ul>` : `<p class="suave" style="margin:0">Aún no has creado invitaciones.</p>`}
  </section>`;
}
async function cargarInvitaciones() {
  S.invitaciones = [];
  try {
    const qs = await getDocs(query(collection(db, "invitaciones"), where("creadaPor", "==", S.user.uid)));
    S.invitaciones = qs.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.creadaMs || 0) - (a.creadaMs || 0));
    if (S.vista === "yo") render();
  } catch (e) { console.error(e); }
}
const enlaceInvitacion = (id) => `${location.origin}/?invitacion=${id}`;
async function compartirInvitacion(id, nota) {
  const url = enlaceInvitacion(id);
  const texto = `${nota ? nota + ": " : ""}te invito a KeKoMeMos, la app para organizar menús, recetas y la compra en familia. Abre este enlace, entra con tu cuenta de Google y crea tu familia: ${url}`;
  if (navigator.share) { try { await navigator.share({ title: "Invitación a KeKoMeMos", text: texto }); return; } catch { /* cancelado */ } }
  try { await navigator.clipboard.writeText(texto); notificar("Invitación copiada: pégala en WhatsApp o en un correo."); }
  catch { prompt("Copia este enlace:", url); }
}

// ---------- REINICIOS ----------
const REINICIOS = {
  puntos: { titulo: "Puntos y misiones", texto: "Pone a 0 puntos, niveles, rachas y logros, y borra el historial de tareas y premios." },
  menus: { titulo: "Menús planificados", texto: "Quita todas las comidas y cenas del calendario (las recetas se quedan)." },
  recetas: { titulo: "Recetas", texto: "Borra todas las recetas. Los menús que las usaban se quedan sin receta." },
  compra: { titulo: "Lista de la compra", texto: "Vacía la lista de la compra y lo que hay en casa." },
  avisos: { titulo: "Avisos", texto: "Borra todos los avisos enviados." },
  retos: { titulo: "Retos de los chicos", texto: "Olvida los retos resueltos y los que estaban a medias." },
  usuarios: { titulo: "Usuarios", texto: "Borra a todos los miembros menos a ti. Tendrán que volver a unirse con el código." }
};
function panelReinicio() {
  return `<section class="tarjeta seccion pila zona-reinicio">
    <h2 class="h2">Reiniciar</h2>
    <p class="suave" style="margin:0">Para empezar de cero alguna parte de la app. Se pide confirmación y no se puede deshacer.</p>
    <div class="reinicios">${Object.entries(REINICIOS).map(([id, r]) => `<button class="btn btn-peligro" data-accion="reiniciar" data-que="${id}"><span><b>${r.titulo}</b><small>${r.texto}</small></span></button>`).join("")}</div>
  </section>`;
}
async function borrarColeccion(nombre, filtro = () => true) {
  const qs = await getDocs(col$(nombre));
  const docs = qs.docs.filter(filtro);
  for (let i = 0; i < docs.length; i += 400) {
    const lote = writeBatch(db);
    docs.slice(i, i + 400).forEach((d) => lote.delete(d.ref));
    await lote.commit();
  }
  return docs.length;
}
async function reiniciar(que) {
  const yo = S.user.uid;
  if (que === "puntos") {
    const lote = writeBatch(db);
    const limpio = { puntos: {}, gastado: 0, contador: {}, logros: {}, estrellas: 0, perfectos: 0, racha: deleteField(), perfectoDia: deleteField() };
    S.miembros.forEach((m) => lote.update(ref$("miembros", m.id), limpio));
    lote.update(doc(db, "hogares", S.hogarId), { equipo: {} });
    await lote.commit();
    await borrarColeccion("canjes");
    return `${await borrarColeccion("tareas")} tareas borradas y puntos, niveles y logros a 0`;
  }
  if (que === "menus") return `${await borrarColeccion("menus")} comidas/cenas quitadas`;
  if (que === "recetas") return `${await borrarColeccion("recetas")} recetas borradas`;
  if (que === "compra") return `${await borrarColeccion("despensa")} productos borrados`;
  if (que === "avisos") return `${await borrarColeccion("avisos")} avisos borrados`;
  if (que === "retos") {
    const lote = writeBatch(db);
    S.miembros.forEach((m) => lote.update(ref$("miembros", m.id), { resueltos: deleteField(), reto: deleteField() }));
    await lote.commit();
    Object.keys(localStorage).filter((k) => k.startsWith("reto-") || k.startsWith("bomba-")).forEach((k) => localStorage.removeItem(k));
    return "Retos reiniciados";
  }
  if (que === "usuarios") {
    const otros = S.miembros.filter((m) => m.id !== yo && m.id !== S.hogar.admin);
    const lote = writeBatch(db);
    otros.forEach((m) => lote.delete(ref$("miembros", m.id)));
    if (S.hogar.cocineraHabitual && otros.some((m) => m.id === S.hogar.cocineraHabitual)) lote.update(doc(db, "hogares", S.hogarId), { cocineraHabitual: yo, cocinaHoy: deleteField() });
    await lote.commit();
    if (esTablet()) fijarActivo(yo);
    return `${otros.length} miembros borrados`;
  }
  throw new Error("Opción desconocida");
}
function duplicados() {
  const vistos = {}, rep = new Set();
  S.miembros.forEach((m) => { const k = normal(m.nombre); if (vistos[k]) rep.add(m.nombre); vistos[k] = true; });
  return [...rep];
}
function panelHogar() {
  const h = S.hogar;
  const enlace = `${location.origin}/?unir=${h.codigo}`;
  let qr = "";
  try { const q = window.qrcode(0, "M"); q.addData(enlace); q.make(); qr = q.createSvgTag(5, 2); } catch { /* librería no cargada */ }
  return `<section class="tarjeta seccion pila">
    <h2 class="h2">Hogar: ${esc(h.nombre)}</h2>
    <div class="fila" style="align-items:flex-start">
      <div class="qr">${qr}</div>
      <div class="pila crece">
        <div><div class="suave">Código familiar</div><div class="codigo-hogar">${esc(h.codigo)}</div></div>
        <p class="suave" style="margin:0">Escanea el QR con la cámara del móvil o introduce el código al entrar.</p>
        <button class="btn" data-accion="compartir-enlace" data-enlace="${esc(enlace)}">Compartir enlace</button>
      </div>
    </div>
    <label class="campo">Quien cocina habitualmente
      <select data-input="cocinera-habitual">${S.miembros.filter((m) => m.rol === "adulto").map((m) => `<option value="${m.id}" ${h.cocineraHabitual === m.id ? "selected" : ""}>${esc(m.nombre)}</option>`).join("")}</select>
      <small>Aparece por defecto cada día. Si otra persona cocina, se cambia solo para ese día desde «Hoy».</small>
    </label>
    <h3 class="h2">Miembros</h3>
    ${duplicados().length ? `<div class="aviso-duplicados">
      <b>Hay personas repetidas.</b> Elige con qué perfil quedarte y el resto se junta en él:
      <div class="fila">${duplicados().map((n) => `<button class="btn btn-primario" data-accion="resolver-duplicado" data-nombre="${esc(n)}">Arreglar «${esc(n)}»</button>`).join("")}</div>
    </div>` : ""}
    <ul class="lista">${S.miembros.map((m) => `<li>
      ${avatar(m, 40)}
      <span class="crece">${esc(m.nombre)}${m.nacimiento ? ` <span class="suave">· ${edad(m.nacimiento)} años</span>` : ""}</span>
      ${esJefe() ? `<button class="btn-x" data-accion="renombrar" data-id="${m.id}" aria-label="Cambiar el nombre de ${esc(m.nombre)}" title="Cambiar nombre">✏️</button>` : ""}
      <select data-input="rol" data-id="${m.id}" aria-label="Perfil de ${esc(m.nombre)}" ${m.id === h.admin ? "disabled" : ""} class="entrada-texto" style="width:auto">
        <option value="adulto" ${m.rol === "adulto" ? "selected" : ""}>Adulto</option>
        <option value="menor" ${m.rol === "menor" ? "selected" : ""}>Menor</option>
      </select>
      ${puedeOrdenarFamilia() ? `<button class="btn" style="min-height:40px" data-accion="fusionar" data-id="${m.id}">Fusionar…</button>` : ""}
      ${esAdmin() && m.id !== h.admin ? `<button class="btn-x" data-accion="quitar-miembro" data-id="${m.id}" aria-label="Quitar a ${esc(m.nombre)}">×</button>` : ""}
    </li>`).join("")}</ul>
  </section>`;
}

// =========================================================
// ACCIONES DE DATOS
// =========================================================
// =========================================================
// MISIONES (lógica)
// =========================================================
const tareasPropias = () => (S.hogar?.tareasPropias || []).map((t) => ({ emoji: "⭐", min: 15, max: 1, zona: "casa", ...t }));
const catalogo = () => [...TAREAS, ...tareasPropias()];
const tareaDef = (id) => catalogo().find((t) => t.id === id) || { id, nombre: id, hecho: "ha hecho una tarea", puntos: 0, zona: "casa", emoji: "⭐", min: 0, max: 1 };
const zonaDe = (id) => ZONAS.find((z) => z.id === id) || ZONAS[4];
const premios = () => (S.hogar?.premios?.length ? S.hogar.premios : PREMIOS);
const objetivo = () => ({ ...OBJETIVO, ...(S.hogar?.objetivo || {}) });
const xpDe = (m) => Object.values(m?.puntos || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const canjesPendientes = (uid) => S.canjes.filter((c) => c.uid === uid && c.estado === "pendiente");
const saldoDe = (m) => Math.max(0, xpDe(m) - (m?.gastado || 0) - canjesPendientes(m?.id).reduce((a, c) => a + (c.coste || 0), 0));
const lunesIso = (d = new Date()) => iso(lunesDe(d));
const ayerDe = (f) => iso(masDias(deIso(f), -1));
const diasEntre = (a, b) => Math.round((deIso(b) - deIso(a)) / 86400000);
const rachaDe = (m) => { const r = m?.racha; return r && (r.ultimo === hoy() || r.ultimo === ayerDe(hoy())) ? r.n || 0 : 0; };
function nivelDe(m) {
  const xp = Math.max(0, xpDe(m));
  let i = 0;
  while (i < NIVELES.length - 1 && xp >= NIVELES[i + 1][0]) i++;
  const [desde, nombre, emoji] = NIVELES[i], sig = NIVELES[i + 1];
  return { i, nombre, emoji, xp, desde, hasta: sig?.[0], siguiente: sig?.[1], pct: sig ? Math.round(((xp - desde) / (sig[0] - desde)) * 100) : 100 };
}
function metricas(m) {
  const c = m?.contador || {}, z = {};
  Object.entries(c).forEach(([id, n]) => { const zona = tareaDef(id).zona; z[zona] = (z[zona] || 0) + n; });
  return { c, z, total: Object.values(c).reduce((a, b) => a + b, 0), mejor: m?.racha?.mejor || 0, perfectos: m?.perfectos || 0,
    estrellas: m?.estrellas || 0, zonas: Object.values(z).filter(Boolean).length };
}
const logrosDe = (m) => { const x = metricas(m); return LOGROS.filter((l) => m?.logros?.[l.id] || l.valor(x) >= l.meta).map((l) => l.id); };

// Reparto: unas tareas son diarias para cada chico y otras van por turnos que rotan cada día
function reparto() {
  const r = S.hogar?.reparto;
  if (r) return { diarias: r.diarias || [], turnos: r.turnos || [], personas: (r.personas || []).filter((id) => miembro(id)), inicio: r.inicio || "2026-01-05" };
  return { diarias: ["hacer_cama"], turnos: ["poner_mesa", "quitar_mesa", "vaciar_lavavajillas", "basura"],
    personas: S.miembros.filter((m) => m.rol === "menor").map((m) => m.id), inicio: "2026-01-05" };
}
function misionesRota(uid, fecha = hoy()) {
  const r = reparto(), n = r.personas.length, k = r.personas.indexOf(uid);
  if (k < 0) return [];
  const d = diasEntre(r.inicio, fecha);
  return [...r.diarias, ...r.turnos.filter((_, i) => (((i + d) % n) + n) % n === k)];
}
// Misiones de hoy de una persona con su estado: porhacer · pendiente (falta verificar) · ok
function estadoMisiones(uid) {
  const regs = S.tareasHoy.filter((t) => t.uid === uid && t.tarea !== "penalizacion" && t.estado !== "rechazada");
  const usados = new Set();
  const lista = misionesRota(uid).map((id) => {
    const r = regs.find((t) => t.tarea === id && !t.encargo && !usados.has(t.id));
    if (r) usados.add(r.id);
    return { def: tareaDef(id), estado: !r ? "porhacer" : r.estado === "ok" ? "ok" : "pendiente", reg: r };
  });
  regs.filter((t) => t.encargo).forEach((t) => lista.push({ def: { ...tareaDef(t.tarea), puntos: t.puntos }, encargo: true, reg: t,
    estado: t.estado === "asignada" ? "porhacer" : t.estado === "ok" ? "ok" : "pendiente" }));
  return lista;
}

async function sumarPuntos(uid, n) {
  if (!uid || !n) return;
  await updateDoc(ref$("miembros", uid), { [`puntos.${mes()}`]: increment(n) });
}
// Da los puntos de una tarea hecha (solo lo hace un adulto): calidad, racha, día perfecto, logros, nivel y objetivo familiar
async function premiarTarea(t, top = false) {
  const m = miembro(t.uid);
  if (!m) return { total: 0, extras: [] };
  const fecha = t.fecha || hoy();
  const extra = top ? Math.ceil(t.puntos / 2) : 0;
  let total = t.puntos + extra;
  const extras = extra ? [`★ ¡Perfecto! +${extra}`] : [];
  const cambios = { [`contador.${t.tarea}`]: increment(1) };
  const despues = { ...m, contador: { ...(m.contador || {}), [t.tarea]: (m.contador?.[t.tarea] || 0) + 1 }, estrellas: (m.estrellas || 0) + (top ? 1 : 0) };
  if (top) cambios.estrellas = increment(1);
  const r = m.racha || {};
  if (r.ultimo !== fecha) {
    const n = r.ultimo === ayerDe(fecha) ? (r.n || 0) + 1 : 1;
    cambios.racha = despues.racha = { n, ultimo: fecha, mejor: Math.max(n, r.mejor || 0) };
    if (BONUS_RACHA[n]) { total += BONUS_RACHA[n]; extras.push(`🔥 Racha de ${n} días +${BONUS_RACHA[n]}`); }
  }
  if (fecha === hoy() && m.perfectoDia !== fecha) {
    let usada = false;
    const lista = estadoMisiones(t.uid);
    const completa = lista.length > 0 && lista.every((x) => {
      if (x.estado === "ok" || x.reg?.id === t.id) return true;
      if (!usada && !x.reg && x.def.id === t.tarea) { usada = true; return true; }
      return false;
    });
    if (completa) {
      total += PUNTOS_PERFECTO; cambios.perfectoDia = fecha; cambios.perfectos = increment(1);
      despues.perfectos = (m.perfectos || 0) + 1; extras.push(`💯 Día perfecto +${PUNTOS_PERFECTO}`);
    }
  }
  despues.puntos = { ...(m.puntos || {}), [mes()]: (m.puntos?.[mes()] || 0) + total };
  const nuevos = logrosDe(despues).filter((id) => !m.logros?.[id]);
  nuevos.forEach((id) => { cambios[`logros.${id}`] = fecha; });
  cambios[`puntos.${mes()}`] = increment(total);
  await updateDoc(ref$("miembros", t.uid), cambios);
  const sem = lunesIso(deIso(fecha)), antes = S.hogar?.equipo?.[sem] || 0, o = objetivo();
  updateDoc(doc(db, "hogares", S.hogarId), { [`equipo.${sem}`]: increment(total) }).catch(console.error);
  const avisar = (texto) => enviarAviso(texto, "logro", "todos", { deNombre: "KeKoMeMos" }).catch(() => {});
  if (antes < o.puntos && antes + total >= o.puntos) avisar(`🎉 ¡Objetivo familiar conseguido! Premio: ${o.premio}`);
  nuevos.forEach((id) => { const l = LOGROS.find((x) => x.id === id); avisar(`🏅 ${m.nombre} ha conseguido el logro «${l.nombre}» (${l.texto})`); });
  const n0 = nivelDe(m).i, n1 = nivelDe(despues).i;
  if (n1 > n0) avisar(`⬆️ ${m.nombre} sube a nivel ${n1 + 1}: ${NIVELES[n1][1]} ${NIVELES[n1][2]}`);
  return { total, extras, nuevos };
}
async function registrarTarea(tareaId, uid) {
  const t = tareaDef(tareaId);
  const veces = S.tareasHoy.filter((x) => x.uid === uid && x.tarea === tareaId && ["ok", "pendiente"].includes(x.estado)).length;
  if (veces >= (t.max || 1)) return notificar(`${nombreDe(uid)} ya tiene «${t.nombre}» apuntada hoy${t.max > 1 ? ` ${t.max} veces` : ""}.`);
  const encargo = S.tareasHoy.find((x) => x.uid === uid && x.tarea === tareaId && x.estado === "asignada");
  const pendiente = miembro(uid)?.rol === "menor" && !esJefe();
  const datos = { estado: pendiente ? "pendiente" : "ok", hechoMs: Date.now() };
  let reg;
  if (encargo) {
    await updateDoc(ref$("tareas", encargo.id), datos);
    reg = { ...encargo, ...datos };
  } else {
    const nuevo = { tarea: tareaId, uid, puntos: t.puntos, por: S.user.uid, quien: yoActivo().id, fecha: hoy(), creadoMs: Date.now(), ts: serverTimestamp(), ...datos };
    const r = await addDoc(col$("tareas"), nuevo);
    reg = { id: r.id, ...nuevo };
  }
  if (pendiente) return notificar(`Apuntado. Los ${reg.puntos} puntos de ${nombreDe(uid)} se suman cuando lo verifique un adulto.`);
  const p = await premiarTarea(reg);
  updateDoc(ref$("tareas", reg.id), { premio: p.total }).catch(() => {});
  notificar(`+${p.total} para ${nombreDe(uid)}${p.extras.length ? " · " + p.extras.join(" · ") : ""}`);
}
async function verificarTarea(id, ok, top = false) {
  const t = S.tareasPendientes.find((x) => x.id === id);
  if (!t) return;
  if (!ok) return updateDoc(ref$("tareas", id), { estado: "rechazada", verificadoPor: yoActivo().id });
  await updateDoc(ref$("tareas", id), { estado: "ok", verificadoPor: yoActivo().id, top });
  const p = await premiarTarea(t, top);
  await updateDoc(ref$("tareas", id), { premio: p.total });
  notificar(`+${p.total} para ${nombreDe(t.uid)}${p.extras.length ? " · " + p.extras.join(" · ") : ""}`);
}
async function resolverCanje(id, ok) {
  const c = S.canjes.find((x) => x.id === id), m = c && miembro(c.uid);
  if (!c) return;
  const fin = { porQuien: yoActivo().id, resueltoMs: Date.now() };
  if (ok && m && xpDe(m) - (m.gastado || 0) >= c.coste) {
    const lote = writeBatch(db);
    lote.update(ref$("canjes", id), { estado: "entregado", ...fin });
    lote.update(ref$("miembros", c.uid), { gastado: increment(c.coste) });
    await lote.commit();
    return notificar(`🎁 Entregado a ${m.nombre}: ${c.nombre}`);
  }
  if (ok) notificar(`${m?.nombre || "Esa persona"} ya no tiene ★ suficientes.`);
  await updateDoc(ref$("canjes", id), { estado: "rechazado", ...fin });
}
function modalVerificar() {
  const lista = S.tareasPendientes, canjes = S.canjes.filter((c) => c.estado === "pendiente");
  if (!lista.length && !canjes.length) return notificar("No hay nada por revisar.");
  const fecha = (f) => (f === hoy() ? "hoy" : f.split("-").reverse().join("/"));
  abrirModal(`${cabeceraModal("Tareas por verificar")}
    ${lista.length ? `<p class="suave" style="margin:0">Los chicos dicen que han hecho esto. Los puntos solo se suman si lo confirmas. «¡Perfecto!» le da un 50 % extra.</p>
    <ul class="lista verificar">${lista.map((t) => { const d = tareaDef(t.tarea); return `<li>${avatar(miembro(t.uid), 40)}
      <span class="crece"><b>${esc(nombreDe(t.uid))}</b> ${esc(d.hecho)} <span aria-hidden="true">${d.emoji}</span><br><small class="suave">${esc(fecha(t.fecha))} · +${t.puntos} pts</small></span>
      <span class="verificar-botones">
        <button class="btn btn-primario" data-accion="verificar" data-id="${t.id}" data-ok="1" aria-label="Confirmar">✓ Sí</button>
        <button class="btn btn-acento" data-accion="verificar" data-id="${t.id}" data-ok="2" aria-label="Perfecto">★ ¡Perfecto!</button>
        <button class="btn btn-peligro" data-accion="verificar" data-id="${t.id}" data-ok="0" aria-label="Rechazar">✗ No</button>
      </span></li>`; }).join("")}</ul>` : ""}
    ${canjes.length ? `<h3 class="h2" style="margin-top:8px">Premios por entregar</h3>
    <ul class="lista verificar">${canjes.map((c) => `<li>${avatar(miembro(c.uid), 40)}
      <span class="crece"><b>${esc(nombreDe(c.uid))}</b> quiere <span aria-hidden="true">${esc(c.emoji || "🎁")}</span> «${esc(c.nombre)}»<br><small class="suave">${c.coste} ★ · tiene ${Math.max(0, xpDe(miembro(c.uid)) - (miembro(c.uid)?.gastado || 0))} ★</small></span>
      <span class="verificar-botones">
        <button class="btn btn-primario" data-accion="canje" data-id="${c.id}" data-ok="1" aria-label="Entregar">🎁 Entregar</button>
        <button class="btn btn-peligro" data-accion="canje" data-id="${c.id}" data-ok="0" aria-label="No entregar">✗ No</button>
      </span></li>`).join("")}</ul>` : ""}`);
}
const MOTIVOS_RESTA = ["No ha hecho su tarea", "No ha quitado la mesa", "No ha hecho la cama", "Habitación desordenada", "Ha dicho que la hizo y no", "Mal comportamiento", "Otro motivo"];
function modalRestar() {
  const menores = S.miembros.filter((m) => m.rol === "menor");
  if (!menores.length) return notificar("No hay menores en la familia.");
  abrirModal(`${cabeceraModal("Restar puntos")}
    <form class="pila" data-form="restar">
      <fieldset class="campo"><legend>¿A quién?</legend>
        <div class="selector-cocinero">${menores.map((m, i) => `<label class="elegible"><input type="radio" name="uid" value="${m.id}" ${i === 0 ? "checked" : ""}>${avatar(m, 64)}<span>${esc(m.nombre)}</span></label>`).join("")}</div></fieldset>
      <fieldset class="campo"><legend>¿Por qué?</legend>
        <div class="chips">${MOTIVOS_RESTA.map((t, i) => `<label class="chip"><input type="radio" name="motivo" value="${esc(t)}" ${i === 0 ? "checked" : ""}> ${esc(t)}</label>`).join("")}</div></fieldset>
      <fieldset class="campo"><legend>¿Cuántos puntos?</legend>
        <div class="chips">${[2, 5, 10, 20].map((n, i) => `<label class="chip"><input type="radio" name="n" value="${n}" ${i === 1 ? "checked" : ""}> −${n}</label>`).join("")}</div></fieldset>
      <button class="btn btn-peligro btn-grande">Restar puntos</button>
    </form>`);
}
function modalEncargar() {
  const chicos = S.miembros.filter((m) => m.rol === "menor");
  if (!chicos.length) return notificar("No hay menores en la familia.");
  abrirModal(`${cabeceraModal("Encargar una misión")}
    <form class="pila" data-form="encargar">
      <fieldset class="campo"><legend>¿Para quién?</legend>
        <div class="selector-cocinero">${chicos.map((m, i) => `<label class="elegible"><input type="radio" name="uid" value="${m.id}" ${i === 0 ? "checked" : ""}>${avatar(m, 64)}<span>${esc(m.nombre)}</span></label>`).join("")}</div></fieldset>
      <label class="campo">¿Qué tiene que hacer hoy?
        <select name="tarea">${ZONAS.map((z) => `<optgroup label="${z.emoji} ${esc(z.nombre)}">${catalogo().filter((t) => t.zona === z.id).map((t) => `<option value="${esc(t.id)}">${esc(t.nombre)} · +${t.puntos}</option>`).join("")}</optgroup>`).join("")}</select></label>
      <button class="btn btn-primario btn-grande">Encargar y avisar</button>
    </form>`);
}
function modalConfigMisiones() {
  const r = reparto(), o = objetivo(), chicos = S.miembros.filter((m) => m.rol === "menor");
  const chipsTareas = (name, sel) => ZONAS.map((z) => `<div class="cfg-zona"><small>${z.emoji} ${esc(z.nombre)}</small><div class="chips">${catalogo().filter((t) => t.zona === z.id)
    .map((t) => `<label class="chip"><input type="checkbox" name="${name}" value="${esc(t.id)}" ${sel.includes(t.id) ? "checked" : ""}> ${esc(t.nombre)}</label>`).join("")}</div></div>`).join("");
  abrirModal(`${cabeceraModal("Configurar misiones")}
    <div class="pila config-misiones">
    <form class="pila" data-form="reparto">
      <h3 class="h2">1 · Reparto de misiones</h3>
      <fieldset class="campo"><legend>¿Quién entra en el reparto?</legend><div class="chips">${chicos.map((m) => `<label class="chip"><input type="checkbox" name="personas" value="${m.id}" ${r.personas.includes(m.id) ? "checked" : ""}> ${esc(m.nombre)}</label>`).join("") || '<span class="suave">Aún no hay menores</span>'}</div></fieldset>
      <fieldset class="campo"><legend>Cada día, para cada uno</legend><p class="suave cfg-ayuda">Lo que cada chico hace siempre (por ejemplo, su cama).</p>${chipsTareas("diarias", r.diarias)}</fieldset>
      <fieldset class="campo"><legend>Por turnos (rotan cada día)</legend><p class="suave cfg-ayuda">Se reparten entre ellos y cada día le toca a otro: nadie repite siempre lo mismo.</p>${chipsTareas("turnos", r.turnos)}</fieldset>
      <button class="btn btn-primario btn-grande">Guardar reparto</button>
    </form>
    <form class="pila" data-form="objetivo">
      <h3 class="h2">2 · Objetivo familiar de la semana</h3>
      <div class="fila"><label class="campo crece">Premio para todos <input name="premio" maxlength="60" required value="${esc(o.premio)}"></label>
      <label class="campo">Puntos entre todos <input name="puntos" type="number" min="50" max="5000" step="10" required value="${o.puntos}"></label></div>
      <button class="btn btn-primario">Guardar objetivo</button>
    </form>
    <div class="pila">
      <h3 class="h2">3 · Premios de la tienda</h3>
      <ul class="lista">${premios().map((p, i) => `<li><span aria-hidden="true">${esc(p.emoji)}</span><span class="crece">${esc(p.nombre)}</span><b>${p.coste} ★</b><button class="btn-x" data-accion="borrar-premio" data-i="${i}" aria-label="Quitar ${esc(p.nombre)}">×</button></li>`).join("")}</ul>
      <form class="fila" data-form="premio"><input name="emoji" maxlength="4" placeholder="🎁" aria-label="Emoji" class="cfg-emoji"><input name="nombre" required maxlength="50" placeholder="Nuevo premio" class="crece" aria-label="Nombre del premio"><input name="coste" type="number" min="5" max="2000" step="5" value="50" class="cfg-num" aria-label="Coste en estrellas"><button class="btn btn-primario">Añadir</button></form>
    </div>
    <div class="pila">
      <h3 class="h2">4 · Tareas propias de la familia</h3>
      ${tareasPropias().length ? `<ul class="lista">${tareasPropias().map((t, i) => `<li><span aria-hidden="true">${esc(t.emoji)}</span><span class="crece">${esc(t.nombre)} <small class="suave">${esc(zonaDe(t.zona).nombre)}</small></span><b>+${t.puntos}</b><button class="btn-x" data-accion="borrar-tarea-propia" data-i="${i}" aria-label="Quitar ${esc(t.nombre)}">×</button></li>`).join("")}</ul>` : `<p class="suave" style="margin:0">Añade las que solo hacéis en casa (pasear al perro, la piscina, el coche…).</p>`}
      <form class="fila" data-form="tarea-propia"><input name="emoji" maxlength="4" placeholder="⭐" aria-label="Emoji" class="cfg-emoji"><input name="nombre" required maxlength="40" placeholder="Ej.: Lavar el coche" class="crece" aria-label="Nombre de la tarea">
        <select name="zona" aria-label="Zona">${ZONAS.map((z) => `<option value="${z.id}">${esc(z.nombre)}</option>`).join("")}</select>
        <select name="puntos" aria-label="Puntos">${[5, 10, 15, 20, 25, 30, 40].map((n) => `<option ${n === 15 ? "selected" : ""}>${n}</option>`).join("")}</select>
        <button class="btn btn-primario">Añadir</button></form>
    </div></div>`, true);
}
// Fiesta en pantalla cuando un adulto verifica una tarea, se sube de nivel o se entrega un premio
function celebrar(titulo, grande, texto = "") {
  if ($("#bloqueo-reto")) return notificar(`${titulo} ${grande}`);
  document.querySelector(".celebracion")?.remove();
  const d = document.createElement("div");
  d.className = "celebracion";
  d.setAttribute("role", "status");
  d.innerHTML = `<div class="cel-carta"><div class="cel-titulo">${esc(titulo)}</div><div class="cel-grande">${esc(grande)}</div>${texto ? `<p>${esc(texto)}</p>` : ""}<small>Toca para seguir</small></div>${estallido(60)}`;
  d.addEventListener("click", () => d.remove());
  document.body.appendChild(d);
  navigator.vibrate?.([60, 40, 140]);
  setTimeout(() => d.remove(), 4500);
}
function vigilarNivel() {
  const yo = yoActivo();
  if (!yo) return;
  const k = `nivel-${yo.id}`, nv = nivelDe(yo).i, antes = Number(localStorage.getItem(k) ?? -1);
  if (antes >= 0 && nv > antes) celebrar("¡Subes de nivel!", `${NIVELES[nv][2]} ${NIVELES[nv][1]}`, `Ya eres nivel ${nv + 1}`);
  localStorage.setItem(k, String(nv));
}
async function asignarMenu(huecoId, r) {
  const [fecha, tipo] = huecoId.split("_");
  if (repetidaCercaSin(r.id, fecha, huecoId, {})) notificar(`Ojo: ${r.titulo} ya está en el menú a menos de ${DIAS_SIN_REPETIR} días.`);
  if (r.tipos?.length && !r.tipos.includes(tipo)) notificar(`Ojo: ${r.titulo} está marcada como ${r.tipos.join("/")}, no como ${tipo}.`);
  updateDoc(ref$("recetas", r.id), { veces: increment(1) }).catch(() => {});
  await setDoc(ref$("menus", huecoId), { fecha, tipo, recetaId: r.id, titulo: r.titulo });
}
async function enviarAviso(texto, tipo = "texto", para = "todos", extra = {}) {
  const yo = yoActivo();
  await addDoc(col$("avisos"), { texto, tipo, para, de: S.user.uid, quien: yo.id, deNombre: yo.nombre, creadoMs: Date.now(), ts: serverTimestamp(), ...extra });
}
async function anadirFaltan(nombres) {
  let n = 0;
  for (const item of nombres) {
    const nombre = typeof item === "string" ? item : item.nombre;
    const cantidad = typeof item === "string" ? "" : [item.cantidad, item.unidad].filter(Boolean).join(" ");
    const existe = S.despensa.find((d) => normal(d.nombre) === normal(nombre));
    if (existe && existe.estado !== "hay") continue;
    if (existe) await updateDoc(ref$("despensa", existe.id), { estado: "falta", cantidad, por: S.user.uid });
    else await addDoc(col$("despensa"), { nombre, cantidad, estado: "falta", por: S.user.uid, ts: serverTimestamp() });
    n++;
  }
  return n;
}

// ---------- AVISOS RECIBIDOS ----------
const RESPUESTAS = {
  mesa: [["¡La pongo yo!", "mesa-yo"]],
  falta: [["Ya voy", "Ya voy"], ["10 min", "Llego en 10 minutos"], ["30 min", "Llego en media hora"]],
  comprar: [["Lo compro yo", "Lo compro yo"]],
  comer: [["¡Voy!", "¡Voy!"]]
};
function recibirAviso(a) {
  if (S.vistos.has(a.id)) return;
  S.vistos.add(a.id);
  if (a.de === S.user.uid || (a.para !== "todos" && a.para !== S.user.uid)) return;
  if ((a.creadoMs || 0) < S.inicio - 5000) return;
  IA.sonar();
  const d = document.createElement("div");
  d.className = "aviso";
  d.setAttribute("role", "alert");
  d.innerHTML = `<div><b>${esc(a.deNombre)}</b>: ${esc(a.texto)}</div>
    <div class="fila">${(RESPUESTAS[a.tipo] || []).map(([t, v]) => `<button class="btn btn-acento" data-accion="responder" data-id="${a.id}" data-valor="${esc(v)}">${esc(t)}</button>`).join("")}
    <button class="btn" data-accion="cerrar-aviso">Cerrar</button></div>`;
  $("#avisos-flotantes").appendChild(d);
  setTimeout(() => d.remove(), a.tipo === "logro" ? 9000 : 30000);
  if (!$("#app").hidden) render();
}
async function responderAviso(id, valor) {
  const a = S.avisos.find((x) => x.id === id);
  if (!a) return;
  if (valor === "mesa-yo") {
    if (a.hechoPor) return notificar(`${nombreDe(a.hechoPor)} ya se ha ofrecido`);
    await updateDoc(ref$("avisos", id), { hechoPor: yoActivo().id });
    await registrarTarea("poner_mesa", yoActivo().id);
    return enviarAviso(`${yoActivo().nombre} pone la mesa`, "respuesta", a.de);
  }
  await enviarAviso(valor, "respuesta", a.de);
  notificar("Respuesta enviada");
}

// ---------- NOTIFICACIONES PUSH ----------
async function activarNotificaciones() {
  if (!CLAVE_VAPID) return notificar("Falta poner la clave VAPID en app.js (ver LEEME).");
  if (!(await isSupported())) return notificar("Este navegador no admite notificaciones. En iPhone, instala la app en la pantalla de inicio.");
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return notificar("Permiso de notificaciones denegado.");
  const reg = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: CLAVE_VAPID, serviceWorkerRegistration: reg });
  await updateDoc(ref$("miembros", S.user.uid), { tokens: arrayUnion(token) });
  notificar("¡Notificaciones activadas!");
}

// ---------- IDEAS ----------
async function mostrarIdeas(tipo) {
  const hace7 = iso(masDias(new Date(), -7));
  const recientes = [...new Set(Object.values(S.menus).filter((m) => m.fecha >= hace7 && m.fecha <= hoy()).map((m) => m.titulo))];
  const propias = habituales(tipo, 8).filter((r) => !recientes.includes(r.titulo)).slice(0, 4);
  const hueco = `${hoy()}_${tipo}`;
  abrirModal(`${cabeceraModal("Ideas para " + (tipo === "comida" ? "comer" : "cenar") + " hoy")}
    <div class="chips">
      <button class="chip" data-accion="dame-ideas" data-tipo="comida" aria-pressed="${tipo === "comida"}">Comida</button>
      <button class="chip" data-accion="dame-ideas" data-tipo="cena" aria-pressed="${tipo === "cena"}">Cena</button>
    </div>
    ${propias.length ? `<h3 class="h2">De vuestras recetas</h3>
    <div class="sugerencias-lista">${propias.map((r) => `<div class="sugerencia">
      <span class="foto">${fotoHTML(r)}</span><span class="sug-titulo">${esc(r.titulo)}</span>
      <span class="fila" style="padding:0 8px 8px;gap:6px"><button class="btn" style="min-height:40px;flex:1" data-accion="asignar-sugerencia" data-hueco="${hueco}" data-id="${r.id}">Para hoy</button></span>
    </div>`).join("")}</div>` : ""}
    <h3 class="h2">Ideas nuevas de KeKoMeMos</h3>
    <div id="ideas-ia" class="ideas"><div class="reto-cargando"><div class="cargando-plato"></div><p>Pensando ideas con lo que tenéis en casa…</p></div></div>`, true);
  try {
    const ideas = await IA.ideasCocina({
      tipo, recientes,
      hayEnCasa: S.despensa.filter((x) => x.estado === "hay").map((x) => x.nombre),
      conocidas: S.recetas.map((r) => r.titulo)
    });
    const caja = $("#ideas-ia");
    if (!caja) return;
    caja.innerHTML = ideas.map((i) => `<div class="idea tarjeta">
      <div class="etiqueta">${esc(i.motivo || "")}${i.minutos ? ` · ${esc(i.minutos)} min` : ""}</div>
      <strong>${esc(i.titulo)}</strong>
      <p class="suave">${esc(i.descripcion || "")}</p>
      <button class="btn btn-primario" data-accion="idea-crear" data-titulo="${esc(i.titulo)}" data-tipo="${tipo}">${icono("chispa")}¡Esta! Crear receta para hoy</button>
    </div>`).join("") + `<button class="btn btn-linea" data-accion="dame-ideas" data-tipo="${tipo}">Otras ideas</button>`;
  } catch (e) {
    console.error(e);
    const caja = $("#ideas-ia");
    if (caja) caja.innerHTML = `<p class="suave">${esc(errorIA(e, "No se han podido pensar ideas"))}</p>`;
  }
}

// ---------- BÚSQUEDA EN INTERNET ----------
async function buscarPaginas(consulta) {
  const { enlaces, sugerencias } = await IA.buscarEnInternet(consulta);
  if (!enlaces.length) return { paginas: [], sugerencias };
  const res = await leerWebs({ urls: enlaces.map((e) => e.uri) });
  const paginas = (res.data?.paginas || []).filter((p) => p.imagenes?.length || p.receta);
  paginas.sort((a, b) => (b.receta ? 1 : 0) - (a.receta ? 1 : 0));
  return { paginas, sugerencias };
}
// Google exige mostrar sus «sugerencias de búsqueda» junto a resultados basados en su buscador
function pintarSugerencias(html) {
  const caja = $(".google-sugerencias");
  if (!caja || !html) return;
  caja.attachShadow({ mode: "open" }).innerHTML = html;
}
async function ponerFotoWeb(url, avisar) {
  const caja = $("#editor-foto");
  if (caja) caja.innerHTML = `<img src="${esc(url)}" alt="" referrerpolicy="no-referrer"><span class="cargando-texto">Guardando foto…</span>`;
  try {
    const res = await guardarFotoWeb({ url, hogarId: S.hogarId });
    S.editorFoto = { url: res.data.url, remota: true };
    const c2 = $("#editor-foto");
    if (c2) c2.innerHTML = `<img src="${esc(res.data.url)}" alt="">`;
    if (avisar) notificar("Foto lista");
  } catch (e) {
    console.error(e);
    notificar("No se ha podido guardar esa foto: " + (e.message || e.code) + ". Prueba con otra.");
    const c3 = $("#editor-foto");
    if (c3) c3.innerHTML = S.editorFoto?.url ? `<img src="${esc(S.editorFoto.url)}" alt="">` : "<span>Sin foto</span>";
  }
}

// ---------- MODALES ----------
function modalElegirReceta(titulo, alElegir, huecoId = null) {
  const pintar = (filtro = "") => {
    const b = normal(filtro);
    const grupos = Object.entries(CATEGORIAS).map(([id, t]) => {
      const tipoH = huecoId?.split("_")[1];
      const rs = S.recetas.filter((r) => r.categoria === id && (!b || normal(r.titulo).includes(b)) && (!tipoH || b || tieneTipo(r, tipoH)));
      return rs.length ? `<h3 class="h2" style="margin-top:6px">${t}</h3><ul class="lista">${rs.map((r) => `<li><button class="btn crece" style="justify-content:flex-start" data-elegir="${r.id}">${esc(r.titulo)}${r.subcategoria ? ` <span class="suave">· ${esc(r.subcategoria)}</span>` : ""}</button></li>`).join("")}</ul>` : "";
    }).join("");
    $("#lista-elegir").innerHTML = grupos || `<p class="vacio">No hay recetas${b ? " con ese nombre" : ""}.</p>`;
  };
  let sub = "";
  if (huecoId) { const [f, t] = huecoId.split("_"); sub = `<p class="suave" style="margin:0">${esc(fechaLarga(deIso(f)))} · ${t}</p>`; }
  abrirModal(`${cabeceraModal(titulo)}
    ${sub}
    ${huecoId ? `<div class="fila">
      <button class="btn btn-primario crece" data-accion="anadir-receta" data-hueco="${huecoId}">+ Receta nueva (internet, IA o a mano)</button>
    </div>
    <h3 class="h2" style="margin-top:4px">…o elegir una receta existente</h3>` : ""}
    <input class="entrada-texto" id="filtro-elegir" placeholder="Buscar receta" autocomplete="off">
    <div id="lista-elegir" class="pila"></div>`);
  pintar();
  $("#filtro-elegir").addEventListener("input", (e) => pintar(e.target.value));
  $("#lista-elegir").addEventListener("click", (e) => {
    const b = e.target.closest("[data-elegir]");
    if (b) { cerrarModal(); alElegir(receta(b.dataset.elegir)); }
  });
}

// Reto del menú: KeKoMeMos pone un acertijo y, al acertar, desvela la comida
function elegirPeque() {
  const menores = S.miembros.filter((m) => m.rol === "menor");
  if (!menores.length) return notificar("No hay menores en el hogar todavía.");
  abrirModal(`${cabeceraModal("¿Quién pregunta?")}
    <div class="selector-cocinero">${menores.map((m) => `<button data-peque="${m.id}">${avatar(m, 84)}<span>${esc(m.nombre)}</span></button>`).join("")}</div>`);
  $(".selector-cocinero").addEventListener("click", (e) => {
    const b = e.target.closest("[data-peque]");
    if (b) { cerrarModal(); abrirReto(miembro(b.dataset.peque)); }
  });
}
function bannerPregunta() {
  if (esMenor()) return "";
  if (esTablet() && S.miembros.some((m) => m.rol === "menor")) {
    return `<button class="pregunta-keko" data-accion="reto-tablet">${icono("chispa")}<span><b>¿Qué hay de comer?</b><small>Los chicos preguntan a KeKoMeMos</small></span></button>`;
  }
  return "";
}

function modalTarea(tareaId) {
  const t = tareaDef(tareaId);
  const personas = esMenor() ? [yoActivo()] : S.miembros;
  abrirModal(`${cabeceraModal(`¿Quién? · ${t.nombre}`)}
    <p class="suave">Suma ${t.puntos} puntos a quien lo haya hecho.</p>
    <div class="selector-cocinero">${personas.map((m) => `<button data-quien="${m.id}">${avatar(m, 84)}<span>${esc(m.nombre)}</span></button>`).join("")}</div>`);
  $(".selector-cocinero").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-quien]");
    if (!b) return;
    cerrarModal();
    await registrarTarea(tareaId, b.dataset.quien);
  });
}

// =========================================================
// EVENTOS
// =========================================================
const ACCIONES = {
  "login-google": async () => {
    const p = new GoogleAuthProvider();
    try { await signInWithPopup(auth, p); } catch (e) { if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") await signInWithRedirect(auth, p); else notificar("No se pudo entrar: " + e.code); }
  },
  "union-soy": (d) => { S.union.miembroId = d.id; S.union.paso = "soy"; mostrarEntrada("unirse"); },
  "union-nuevo": () => { S.union.paso = "nuevo"; mostrarEntrada("unirse"); },
  "union-elegir": () => { S.union.paso = "elegir"; mostrarEntrada("unirse"); },
  "union-atras": () => { S.union = null; mostrarEntrada("unirse"); },
  "copia-recetas": () => abrirModal(`${cabeceraModal("Copia de seguridad de recetas")}
    <div class="pila">
      <button class="btn btn-primario btn-grande" data-accion="exportar-recetas">⬇ Exportar las ${S.recetas.length} recetas (JSON)</button>
      <p class="suave" style="margin:0">Se descarga un archivo con todas las recetas (nombre, tipo, ingredientes, pasos, enlace a la foto…). Guárdalo en tu ordenador o en Drive.</p>
      <label class="btn btn-grande">⬆ Importar desde un archivo<input type="file" accept="application/json,.json" data-input="importar-recetas" hidden></label>
      <p class="suave" style="margin:0">Las recetas que ya existan (mismo nombre) no se duplican: se saltan.</p>
    </div>`),
  "exportar-recetas": () => {
    const campos = ["titulo", "categoria", "subcategoria", "tipos", "minutos", "raciones", "ingredientes", "pasos", "fuente", "foto", "fotoGenerada"];
    const recetas = S.recetas.map((r) => Object.fromEntries(campos.filter((c) => r[c] !== undefined && r[c] !== null && r[c] !== "").map((c) => [c, r[c]])));
    const datos = { app: "KeKoMeMos", version: 1, exportado: new Date().toISOString(), hogar: S.hogar?.nombre || "", recetas };
    const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `kekomemos-recetas-${hoy()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    notificar(`${recetas.length} recetas exportadas`);
  },
  "compartir-invitacion": (d) => compartirInvitacion(d.id, d.nota),
  "borrar-invitacion": async (d) => {
    if (!confirmar("¿Anular esta invitación? El enlace dejará de funcionar.")) return;
    await deleteDoc(doc(db, "invitaciones", d.id));
    S.invitaciones = null; render();
  },
  "ver-pendientes": () => modalVerificar(),
  verificar: async (d, el) => {
    el.closest("li")?.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    await verificarTarea(d.id, d.ok !== "0", d.ok === "2");
    el.closest("li")?.remove();
    if (!$("#modal .verificar li")) cerrarModal();
  },
  "restar-puntos": () => modalRestar(),
  canje: async (d, el) => {
    el.closest("li")?.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    await resolverCanje(d.id, d.ok === "1");
    el.closest("li")?.remove();
    if (!$("#modal .verificar li")) cerrarModal();
  },
  canjear: async (d) => {
    const p = premios().find((x) => x.id === d.id), yo = yoActivo();
    if (!p || !yo) return;
    if (saldoDe(yo) < p.coste) return notificar(`Te faltan ${p.coste - saldoDe(yo)} ★ para «${p.nombre}».`);
    if (!confirmar(`¿Canjear ${p.coste} ★ por «${p.nombre}»? Un adulto te lo dará y entonces se descuentan.`)) return;
    await addDoc(col$("canjes"), { uid: yo.id, por: S.user.uid, premioId: p.id, nombre: p.nombre, emoji: p.emoji || "🎁", coste: p.coste, estado: "pendiente", creadoMs: Date.now(), ts: serverTimestamp() });
    enviarAviso(`🎁 ${yo.nombre} quiere canjear «${p.nombre}» (${p.coste} ★)`).catch(() => {});
    notificar("¡Pedido! Cuando un adulto te lo dé, se descuentan las ★.");
  },
  "hacer-mision": async (d, el) => { el.disabled = true; await registrarTarea(d.tarea, yoActivo().id); },
  "mision-de": async (d) => {
    const t = tareaDef(d.tarea);
    if (!confirmar(`¿${nombreDe(d.uid)} ha hecho «${t.nombre}»?`)) return;
    await registrarTarea(d.tarea, d.uid);
  },
  zona: (d) => { S.zonaBolsa = d.zona; render(); },
  "ver-logros": (d) => { S.verLogrosDe = d.id; render(); },
  encargar: () => modalEncargar(),
  "config-misiones": () => modalConfigMisiones(),
  "borrar-premio": async (d) => {
    const lista = premios().filter((_, i) => i !== Number(d.i));
    await updateDoc(doc(db, "hogares", S.hogarId), { premios: lista.length ? lista : [] });
    modalConfigMisiones();
  },
  "borrar-tarea-propia": async (d) => {
    await updateDoc(doc(db, "hogares", S.hogarId), { tareasPropias: tareasPropias().filter((_, i) => i !== Number(d.i)) });
    modalConfigMisiones();
  },
  renombrar: (d) => {
    const m = miembro(d.id);
    abrirModal(`${cabeceraModal("Cambiar nombre")}
      <form class="pila" data-form="renombrar" data-id="${m.id}">
        <div class="fila">${avatar(m, 56)}<label class="campo crece">Nombre <input name="nombre" required maxlength="24" value="${esc(m.nombre)}"></label></div>
        <button class="btn btn-primario btn-grande">Guardar</button>
      </form>`);
  },
  reiniciar: (d) => {
    const r = REINICIOS[d.que];
    abrirModal(`${cabeceraModal("Reiniciar: " + r.titulo)}
      <p>${esc(r.texto)}</p>
      <p class="suave" style="margin:0">No se puede deshacer. Escribe <b>BORRAR</b> para confirmar.</p>
      <form class="pila" data-form="reiniciar" data-que="${d.que}">
        <input name="confirmar" class="entrada-texto" autocomplete="off" autocapitalize="characters" placeholder="BORRAR" required>
        <button class="btn btn-peligro btn-grande">Reiniciar ${esc(r.titulo.toLowerCase())}</button>
      </form>`);
  },
  "resolver-duplicado": (d) => {
    const iguales = S.miembros.filter((m) => normal(m.nombre) === normal(d.nombre));
    const info = (m) => {
      const pts = Object.values(m.puntos || {}).reduce((a, b) => a + b, 0);
      const creado = m.creado?.toDate ? " · creado el " + m.creado.toDate().toLocaleDateString("es-ES") : "";
      return `${m.rol === "adulto" ? "Adulto" : "Menor"}${m.id === S.user.uid ? " · el de este dispositivo" : ""} · ${pts} pts${m.nacimiento ? " · nació el " + m.nacimiento.split("-").reverse().join("/") : ""}${creado}`;
    };
    abrirModal(`${cabeceraModal("¿Con qué «" + d.nombre + "» nos quedamos?")}
      <p class="suave" style="margin:0">Los demás se juntan en el elegido (se suman sus puntos y retos) y se borran.</p>
      <ul class="lista">${iguales.map((m) => `<li>${avatar(m, 44)}<span class="crece"><b>${esc(m.nombre)}</b><br><small class="suave">${esc(info(m))}</small></span>
        <button class="btn btn-primario" data-accion="quedarse-con" data-id="${m.id}" data-nombre="${esc(d.nombre)}">Quedarme con este</button></li>`).join("")}</ul>`);
  },
  "quedarse-con": async (d) => {
    const keep = miembro(d.id);
    const otros = S.miembros.filter((m) => m.id !== keep.id && normal(m.nombre) === normal(d.nombre));
    if (otros.some((m) => m.id === S.hogar.admin) && keep.rol !== "adulto") return notificar("Para juntar a un adulto, quédate con un perfil de adulto.");
    if (!confirmar(`¿Juntar ${otros.length} perfil(es) repetido(s) en este «${keep.nombre}»?`)) return;
    for (const dup of otros) await fusionarMiembros(dup, keep);
    cerrarModal();
    notificar(`Listo: un solo «${keep.nombre}»`);
  },
  fusionar: (d) => {
    const dup = miembro(d.id);
    const otros = S.miembros.filter((m) => m.id !== dup.id);
    abrirModal(`${cabeceraModal("¿" + dup.nombre + " es la misma persona que…?")}
      <p class="suave" style="margin:0">Se juntan los puntos y los retos en el perfil que elijas, y se borra este duplicado. En el móvil del duplicado tendrá que volver a entrar eligiendo su perfil.</p>
      <div class="selector-cocinero">${otros.map((m) => `<button data-accion="fusionar-con" data-dup="${dup.id}" data-id="${m.id}">${avatar(m, 72)}<span>${esc(m.nombre)}</span></button>`).join("")}</div>`);
  },
  "fusionar-con": async (d) => {
    const dup = miembro(d.dup), keep = miembro(d.id);
    if (dup.id === S.hogar.admin && keep.rol !== "adulto") return notificar("Para juntar a un adulto, elige un perfil de adulto.");
    if (!confirmar(`¿Juntar «${dup.nombre}» dentro de «${keep.nombre}»? No se puede deshacer.`)) return;
    await fusionarMiembros(dup, keep);
    cerrarModal();
    notificar(`${dup.nombre} unido a ${keep.nombre}`);
  },
  "login-anonimo": async () => {
    try { await signInAnonymously(auth); } catch (e) {
      notificar(e.code === "auth/admin-restricted-operation"
        ? "La entrada con código no está activada todavía. El administrador debe activar «Anónimo» en Firebase › Authentication."
        : "No se pudo entrar: " + e.code);
    }
  },
  salir: async () => { if (confirmar("¿Cerrar sesión en este dispositivo?")) { await signOut(auth); location.reload(); } },
  ir: (d) => { S.vista = d.vista; S.param = null; S.borrador = null; S.editorFoto = null; S.asignarA = null; render(); window.scrollTo(0, 0); },
  "cerrar-modal": cerrarModal,
  "cerrar-aviso": (_, el) => el.closest(".aviso")?.remove(),
  responder: (d, el) => { el.closest(".aviso")?.remove(); cerrarModal(); responderAviso(d.id, d.valor); },
  bandeja: () => {
    localStorage.setItem("avisosLeidos", String(Date.now()));
    const mios = S.avisos.filter((a) => a.para === "todos" || a.para === S.user.uid || a.de === S.user.uid);
    abrirModal(`${cabeceraModal("Avisos")}
      <ul class="lista">${mios.map((a) => `<li style="flex-wrap:wrap">${avatar(miembro(a.de), 36)}
        <span class="crece"><b>${esc(a.deNombre)}</b>${a.para !== "todos" ? ` <span class="suave">› ${esc(nombreDe(a.para))}</span>` : ""}: ${esc(a.texto)}
        <br><small class="suave">${a.creadoMs ? new Date(a.creadoMs).toLocaleString("es-ES", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : ""}${a.hechoPor ? ` · lo hace ${esc(nombreDe(a.hechoPor))}` : ""}</small></span>
        ${a.de !== S.user.uid ? (RESPUESTAS[a.tipo] || []).map(([t, v]) => `<button class="btn" data-accion="responder" data-id="${a.id}" data-valor="${esc(v)}">${esc(t)}</button>`).join("") : ""}
      </li>`).join("") || '<li class="suave">No hay avisos todavía.</li>'}</ul>`);
    render();
  },
  "aviso-rapido": async (d) => {
    const cena = new Date().getHours() >= 17;
    const textos = { comer: cena ? "¡La cena está lista!" : "¡La comida está lista!", mesa: "¡Poned la mesa, por favor!", falta: "¿Cuándo llegáis a casa? ¿Falta mucho?" };
    await enviarAviso(textos[d.tipo], d.tipo);
    notificar("Aviso enviado a la familia");
  },
  "aviso-comprar": () => {
    const faltan = S.despensa.filter((x) => x.estado === "falta" || x.estado === "hay").sort((a, b) => (a.estado === "falta" ? -1 : 1) - (b.estado === "falta" ? -1 : 1)).slice(0, 18);
    abrirModal(`${cabeceraModal("¿Qué hay que comprar?")}
      <form class="pila" data-form="aviso-comprar">
        <div class="chips">${faltan.map((x) => `<label class="chip"><input type="checkbox" name="item" value="${esc(x.nombre)}" ${x.estado === "falta" ? "checked" : ""}> ${esc(x.nombre)}</label>`).join("")}</div>
        <label class="campo">Otra cosa <input name="otro" placeholder="pan, nata, arroz…" autocomplete="off"></label>
        <button class="btn btn-primario btn-grande">Enviar aviso</button>
      </form>`);
  },
  "aviso-escribir": () => abrirModal(`${cabeceraModal("Escribir aviso")}
    <form class="pila" data-form="aviso-libre">
      <label class="campo">Mensaje <textarea name="texto" required maxlength="160" rows="3" placeholder="Hoy cenamos un poco más tarde…"></textarea></label>
      <label class="campo">Para <select name="para"><option value="todos">Toda la familia</option>${S.miembros.filter((m) => m.id !== S.user.uid).map((m) => `<option value="${m.id}">${esc(m.nombre)}</option>`).join("")}</select></label>
      <button class="btn btn-primario btn-grande">Enviar</button>
    </form>`),
  tarea: (d) => modalTarea(d.tarea),
  "cambiar-cocinera": () => {
    const actual = cocineraHoy();
    abrirModal(`${cabeceraModal("¿Hoy cocina otra persona?")}
      <p class="suave">Solo para hoy. Mañana vuelve a ${esc(nombreDe(S.hogar.cocineraHabitual))}.</p>
      <div class="selector-cocinero">${S.miembros.map((m) => `<button data-cocina="${m.id}" aria-pressed="${m.id === actual}">${avatar(m, 84)}<span>${esc(m.nombre)}</span></button>`).join("")}</div>`);
    $(".selector-cocinero").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-cocina]");
      if (!b) return;
      cerrarModal();
      const uid = b.dataset.cocina;
      await updateDoc(doc(db, "hogares", S.hogarId), { cocinaHoy: uid === S.hogar.cocineraHabitual ? deleteField() : { fecha: hoy(), uid } });
    });
  },
  reto: () => abrirReto(),
  "reto-tablet": elegirPeque,
  "ver-receta": (d) => { if (!d.id) return ACCIONES.ir({ vista: "recetas" }); S.vista = "receta"; S.param = d.id; render(); window.scrollTo(0, 0); },
  "nueva-receta": (d) => { cerrarModal(); S.asignarA = d.hueco || null; S.vista = "editor"; S.param = null; S.borrador = null; S.editorFoto = null; render(); window.scrollTo(0, 0); },
  "editar-receta": (d) => { S.vista = "editor"; S.param = d.id; S.borrador = null; S.editorFoto = null; render(); },
  "borrar-receta": async (d) => {
    if (!confirmar("¿Eliminar esta receta?")) return;
    await deleteDoc(ref$("recetas", d.id));
    ACCIONES.ir({ vista: "recetas" });
  },
  filtro: (d) => { S.filtro = d.filtro; render(); },
  cocinar: (d) => {
    const r = receta(d.id);
    if (!r) return;
    IA.abrirCocina({ contenedor: $("#cocina"), receta: r, cocinero: nombreDe(cocineraHoy() || S.user.uid) });
  },
  planificar: (d) => {
    const r = receta(d.id);
    abrirModal(`${cabeceraModal("Planificar " + r.titulo)}
      <form class="pila" data-form="planificar" data-id="${r.id}">
        <label class="campo">Día <input type="date" name="fecha" required value="${hoy()}"></label>
        <label class="campo">Comida o cena <select name="tipo"><option value="comida">Comida</option><option value="cena">Cena</option></select></label>
        <button class="btn btn-primario btn-grande">Guardar</button>
      </form>`);
  },
  "elegir-hueco": (d) => modalElegirReceta("Elegir plato", (r) => asignarMenu(d.hueco, r), d.hueco),
  "modo-cal": (d) => { S.modoCal = d.modo; S.intercambio = null; render(); },
  mes: (d) => { S.mesOffset += Number(d.delta); render(); },
  "nueva-receta-plan": () => ACCIONES["anadir-receta"]({}),
  dia: (d) => {
    const f = d.fecha;
    if (S.intercambio) {
      const tipo = S.intercambio.split("_")[1];
      return ACCIONES.hueco({ hueco: `${f}_${tipo}` });
    }
    const fila = (tipo) => {
      const m = S.menus[`${f}_${tipo}`];
      return `<button class="hueco ${m ? "" : "vacio-hueco"}" data-accion="hueco" data-hueco="${f}_${tipo}"><small>${tipo}</small><span>${esc(m?.titulo || (esAdulto() ? "+ Añadir" : "—"))}</span></button>`;
    };
    abrirModal(`${cabeceraModal(fechaLarga(deIso(f)))}<div class="pila">${fila("comida")}${fila("cena")}</div>`);
  },
  sorpresa: async (d) => {
    const pool = S.recetas.filter((r) => r.categoria === "quiero_probar" || r.categoria === "especiales");
    const r = elegirParaHueco(d.hueco, {}, pool.length ? pool : S.recetas) || elegirParaHueco(d.hueco);
    if (!r) return notificar("No hay recetas de ese tipo sin repetir en estos días.");
    await asignarMenu(d.hueco, r);
    notificar(`Sorpresa: ${r.titulo}`);
  },
  semana: (d) => { S.semana += Number(d.delta); render(); },
  "cancelar-intercambio": () => { S.intercambio = null; render(); },
  hueco: async (d) => {
    const id = d.hueco, m = S.menus[id];
    if (S.intercambio) {
      const otro = S.intercambio;
      S.intercambio = null;
      if (otro === id) return render();
      const a = S.menus[otro], b = S.menus[id];
      const lote = writeBatch(db);
      const mover = (destino, datos) => {
        const [fecha, tipo] = destino.split("_");
        if (datos) lote.set(ref$("menus", destino), { ...datos, fecha, tipo }); else lote.delete(ref$("menus", destino));
      };
      mover(id, a); mover(otro, b);
      await lote.commit();
      return notificar("Intercambiados");
    }
    if (!esAdulto()) { if (m?.recetaId) ACCIONES["ver-receta"]({ id: m.recetaId }); return; }
    if (!m) return modalElegirReceta("¿Qué ponemos?", (r) => asignarMenu(id, r), id);
    const [fecha, tipo] = id.split("_");
    abrirModal(`${cabeceraModal(m.titulo)}
      <p class="suave">${esc(fechaLarga(deIso(fecha)))} · ${tipo}</p>
      <div class="pila">
        <button class="btn btn-grande" data-accion="ver-receta" data-id="${esc(m.recetaId)}">Ver receta</button>
        <button class="btn btn-grande" data-accion="elegir-hueco" data-hueco="${id}">Cambiar plato</button>
        <button class="btn btn-grande" data-accion="iniciar-intercambio" data-hueco="${id}">Mover o intercambiar con otro día</button>
        <button class="btn btn-peligro" data-accion="quitar-menu" data-hueco="${id}">Quitar</button>
      </div>`);
  },
  "iniciar-intercambio": (d) => { cerrarModal(); S.intercambio = d.hueco; render(); },
  "quitar-menu": async (d) => { cerrarModal(); await deleteDoc(ref$("menus", d.hueco)); },
  "vaciar-plan": async () => {
    let desde, hasta, nombre;
    if (S.modoCal === "mes") {
      const base = new Date();
      const primero = new Date(base.getFullYear(), base.getMonth() + S.mesOffset, 1);
      desde = iso(primero); hasta = iso(new Date(primero.getFullYear(), primero.getMonth() + 1, 0));
      nombre = primero.toLocaleDateString("es-ES", { month: "long" });
    } else {
      const lunes = masDias(lunesDe(new Date()), S.semana * 7);
      desde = iso(lunes); hasta = iso(masDias(lunes, 6));
      nombre = "la semana del " + lunes.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
    }
    const ids = Object.keys(S.menus).filter((id) => { const f = id.split("_")[0]; return f >= desde && f <= hasta; });
    if (!ids.length) return notificar("No hay nada planificado en " + nombre + ".");
    if (!confirmar(`¿Vaciar ${nombre}? Se quitan ${ids.length} comidas y cenas planificadas (las recetas no se borran).`)) return;
    const lote = writeBatch(db);
    ids.forEach((id) => lote.delete(ref$("menus", id)));
    await lote.commit();
    notificar(`${nombre.charAt(0).toUpperCase() + nombre.slice(1)} vaciada`);
  },
  "sugerir-semana": async () => {
    if (!S.recetas.length) return notificar("Primero añade algunas recetas.");
    const lunes = masDias(lunesDe(new Date()), S.semana * 7);
    const huecos = [];
    for (let i = 0; i < 7; i++) {
      const f = iso(masDias(lunes, i));
      if (f < hoy()) continue;
      ["comida", "cena"].forEach((t) => { if (!S.menus[`${f}_${t}`]) huecos.push(`${f}_${t}`); });
    }
    if (!huecos.length) return notificar("No hay huecos libres esta semana.");
    const nuevos = {};
    const sinHueco = [];
    huecos.forEach((h) => {
      const r = elegirParaHueco(h, nuevos);
      const [fecha, tipo] = h.split("_");
      if (r) nuevos[h] = { fecha, tipo, recetaId: r.id, titulo: r.titulo };
      else sinHueco.push(h);
    });
    const lote = writeBatch(db);
    Object.entries(nuevos).forEach(([h, m]) => lote.set(ref$("menus", h), m));
    await lote.commit();
    const n = Object.keys(nuevos).length;
    notificar(sinHueco.length
      ? `${n} huecos rellenados. ${sinHueco.length} se quedan vacíos: no hay más recetas de ese tipo sin repetir en ${DIAS_SIN_REPETIR} días.`
      : `${n} huecos rellenados, sin repetir platos en ${DIAS_SIN_REPETIR} días`);
  },
  "compra-semana": async (_, el) => {
    const desde = S.vista === "semana" ? masDias(lunesDe(new Date()), S.semana * 7) : new Date();
    const fechas = Array.from({ length: 7 }, (_, i) => iso(masDias(desde, i))).filter((f) => f >= hoy());
    const planificadas = Object.values(S.menus).filter((m) => fechas.includes(m.fecha)).map((m) => receta(m.recetaId)).filter(Boolean);
    if (!planificadas.length) return notificar("No hay menús planificados para esos días.");
    el.disabled = true; el.textContent = "Calculando…";
    try {
      const hay = S.despensa.filter((d) => d.estado === "hay").map((d) => d.nombre);
      const faltan = await IA.calcularCompra(planificadas, hay);
      const n = await anadirFaltan(faltan);
      notificar(`${n} productos añadidos a la lista`);
      if (S.vista !== "compra") ACCIONES.ir({ vista: "compra" });
    } catch (e) { console.error(e); notificar(errorIA(e, "No se ha podido calcular la lista")); }
    render();
  },
  "pedir-receta": (d) => { S.asignarA = d.hueco || null; abrirModal(`${cabeceraModal("Pedir receta a KeKoMeMos")}
    <form class="pila" data-form="pedir-receta">
      <label class="campo">¿Qué te apetece cocinar?
        <textarea name="pedido" rows="3" required placeholder="Fideos a la cazuela como los de la abuela, para 5…"></textarea></label>
      <div class="chips">${["Fideos a la cazuela", "Pizza casera", "Algo rápido con pollo", "Cena ligera con verduras", "Postre para Navidad"].map((t) => `<button type="button" class="chip" data-ejemplo="${esc(t)}">${esc(t)}</button>`).join("")}</div>
      <label class="campo">Categoría <select name="categoria">${Object.entries(CATEGORIAS).map(([id, t]) => `<option value="${id}" ${id === "quiero_probar" ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <button class="btn btn-primario btn-grande">${icono("chispa")}Crear receta con foto</button>
      <small class="suave">KeKoMeMos (Gemini) escribe la receta y crea una foto del plato. Podrás revisarla antes de guardar.</small>
    </form>`); },
  "foto-receta": (d) => fotoParaReceta(d.id),
  "anadir-receta": (d) => {
    S.asignarA = d.hueco || null;
    let sub = "";
    if (d.hueco) { const [f, t] = d.hueco.split("_"); sub = `<p class="suave" style="margin:0">Para ${esc(fechaLarga(deIso(f)))} · ${t}</p>`; }
    abrirModal(`${cabeceraModal("Añadir receta")}${sub}
      <form class="pila" data-form="anadir-receta">
        <label class="campo">¿Qué receta?
          <input name="consulta" required autocomplete="off" placeholder="Fideos a la cazuela, lasaña de verduras…"></label>
        ${IA.CON_GEMINI
          ? `<button class="btn btn-primario btn-grande" name="modo" value="web">${icono("buscar")}Buscar la receta en internet</button>`
          : `<button class="btn btn-primario btn-grande" name="modo" value="enlace">${icono("buscar")}Traerla de internet (Google)</button>`}
        <button class="btn btn-grande" name="modo" value="ia">${icono("chispa")}Que la cree KeKoMeMos</button>
        <button class="btn btn-grande" name="modo" value="manual">Escribirla yo</button>
        <button type="button" class="btn-enlace" data-accion="importar" ${d.hueco ? `data-hueco="${d.hueco}"` : ""}>…o importar de un texto o una foto (libro, revista)</button>
      </form>`);
  },
  "elegir-web": async (d) => {
    const pag = S.webResultados?.[Number(d.i)];
    if (!pag) return;
    abrirModal(`${cabeceraModal("Importando receta")}<p>Leyendo la receta de ${esc(pag.sitio)}…</p><div class="cargando-plato" aria-hidden="true"></div>`);
    try {
      let r;
      if (pag.receta?.ingredientes?.length) {
        r = { titulo: pag.receta.titulo, minutos: pag.receta.minutos, raciones: pag.receta.raciones,
          ingredientes: leerIngredientes(pag.receta.ingredientes.join("\n")), pasos: pag.receta.pasos };
      } else {
        r = await IA.importarReceta({ texto: `${pag.titulo}\n\n${pag.texto || ""}` });
      }
      S.borrador = { ...r, tipos: r.tipos?.length ? r.tipos : tiposPorDefecto(), categoria: "quiero_probar", fuente: pag.url };
      S.vista = "editor"; S.param = null; S.editorFoto = null;
      cerrarModal();
      render();
      window.scrollTo(0, 0);
      if (pag.imagenes?.[0]) await ponerFotoWeb(pag.imagenes[0], false);
      notificar("Revisa la receta y guárdala");
    } catch (e) { console.error(e); notificar(errorIA(e, "No se ha podido importar la receta")); cerrarModal(); }
  },
  "buscar-fotos": async (_, el) => {
    const titulo = el.closest("form")?.titulo?.value.trim();
    if (!titulo) return notificar("Escribe primero el nombre del plato.");
    if (!IA.CON_GEMINI) {
      abrirModal(`${cabeceraModal("Foto de " + titulo)}
        <div class="pila">
          <a class="btn btn-grande" href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent(titulo + " receta")}" target="_blank" rel="noopener">1 · Buscar fotos en Google Imágenes</a>
          <p class="suave" style="margin:0">Abre la foto (o la receta) que te guste, copia su enlace y pégalo aquí:</p>
          <form class="pila" data-form="foto-enlace">
            <input name="url" type="url" required class="entrada-texto" placeholder="https://…" autocomplete="off">
            <button class="btn btn-primario btn-grande">2 · Usar esta foto</button>
          </form>
        </div>`);
      return;
    }
    abrirModal(`${cabeceraModal("Fotos de " + titulo)}<p>Buscando fotos en internet…</p><div class="cargando-plato" aria-hidden="true"></div>`, true);
    try {
      const { paginas, sugerencias } = await buscarPaginas(titulo);
      const fotos = [...new Set(paginas.flatMap((p) => p.imagenes || []))].slice(0, 16);
      if (!fotos.length) throw new Error("Sin fotos");
      abrirModal(`${cabeceraModal("Elige una foto")}
        <div class="rejilla-fotos">${fotos.map((u) => `<button class="foto-web" data-accion="elegir-foto" data-url="${esc(u)}"><img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()"></button>`).join("")}</div>
        <div class="google-sugerencias"></div>`, true);
      pintarSugerencias(sugerencias);
    } catch (e) { console.error(e); notificar(errorIA(e, "No se han encontrado fotos")); cerrarModal(); }
  },
  "elegir-foto": async (d) => { cerrarModal(); await ponerFotoWeb(d.url, true); },
  "asignar-sugerencia": async (d) => {
    const r = receta(d.id);
    if (!r) return;
    await asignarMenu(d.hueco, r);
    notificar(`${r.titulo} para ${d.hueco.endsWith("comida") ? "comer" : "cenar"}`);
  },
  "quien-soy": () => (esTablet() ? preguntarQuienEres() : ACCIONES.ir({ vista: "yo" })),
  "cambiar-persona": () => preguntarQuienEres(),
  "abrir-reto": async (_, el) => {
    el?.classList.add("pulsado");
    navigator.vibrate?.(40);
    await new Promise((ok) => setTimeout(ok, 180));
    el?.classList.remove("pulsado");
    abrirReto();
  },
  "dame-ideas": (d) => mostrarIdeas(d.tipo || comidaActual()),
  "idea-crear": (d, el) => {
    S.asignarA = `${hoy()}_${d.tipo}`;
    const fd = new FormData(); fd.set("pedido", d.titulo); fd.set("categoria", "quiero_probar");
    return FORMS["pedir-receta"](fd, el.closest(".idea"));
  },
  "ver-pista": () => {
    const st = S.retoInline;
    if (!st) return;
    st.pistaVista = true;
    guardarReto();
    pintarReto(miembro(st.personaId));
  },
  "responder-reto": async (d) => {
    const st = S.retoInline;
    if (!st?.reto || st.bloqueoHasta > Date.now()) return;
    const persona = miembro(st.personaId);
    const i = Number(d.i);
    if (String(st.reto.opciones[i]) === String(st.reto.correcta)) return retoAcertado(persona);
    st.fallos.push(i);
    falloReto(st, persona);
  },
  pareja: (d) => {
    const st = S.retoInline;
    if (!st?.reto || st.bloqueoHasta > Date.now()) return;
    const persona = miembro(st.personaId);
    if (!st.sel || st.sel.lado === d.lado) { st.sel = { lado: d.lado, v: d.v }; return pintarReto(persona); }
    const a = d.lado === "a" ? d.v : st.sel.v, b = d.lado === "b" ? d.v : st.sel.v;
    st.sel = null;
    if (st.reto.pares.some((p) => p.a === a && p.b === b)) {
      st.progreso.hechas = [...(st.progreso.hechas || []), a];
      navigator.vibrate?.(30);
      if (st.progreso.hechas.length === st.reto.pares.length) return retoAcertado(persona);
      guardarReto();
      return pintarReto(persona);
    }
    falloReto(st, persona);
  },
  orden: (d) => {
    const st = S.retoInline;
    if (!st?.reto || st.bloqueoHasta > Date.now()) return;
    const persona = miembro(st.personaId);
    const i = Number(d.i), sec = st.progreso.secuencia || [];
    if (st.reto.mezclados[i] === st.reto.elementos[sec.length]) {
      st.progreso.secuencia = [...sec, i];
      navigator.vibrate?.(30);
      if (st.progreso.secuencia.length === st.reto.elementos.length) return retoAcertado(persona);
      guardarReto();
      return pintarReto(persona);
    }
    st.progreso.secuencia = [];
    falloReto(st, persona);
  },

  "fotos-pendientes": async () => {
    const n = S.recetas.filter((r) => !r.foto).length;
    if (!n) return notificar("Todas las recetas tienen foto.");
    notificar(`Creando ${Math.min(n, 5)} fotos… pueden tardar un poco.`);
    for (const r of S.recetas.filter((x) => !x.foto).slice(0, 5)) await fotoParaReceta(r.id, false);
    notificar("Fotos terminadas");
  },
  "probar-ia": async (_, el) => {
    el.disabled = true; el.textContent = "Probando…";
    try { notificar(`IA (${IA.PROVEEDOR}) responde: ` + await IA.probarGemini()); }
    catch (e) { console.error(e); notificar(errorIA(e, "Gemini no responde")); }
    el.disabled = false; el.textContent = "Probar la IA";
  },
  importar: (d) => { S.asignarA = d.hueco || null; abrirModal(`${cabeceraModal("Importar receta")}
    <form class="pila" data-form="importar">
      <label class="campo">Pega el texto de la receta <textarea name="texto" rows="6" placeholder="Copia la receta de una web, un mensaje…"></textarea></label>
      <label class="campo">…o haz una foto (libro, revista, pantalla) <input type="file" name="foto" accept="image/*"></label>
      <button class="btn btn-primario btn-grande">${icono("chispa")}Convertir con Gemini</button>
    </form>`); },
  "generar-foto": async (_, el) => {
    const f = el.closest("form");
    const titulo = f.titulo.value.trim();
    if (!titulo) return notificar("Escribe primero el nombre del plato.");
    el.disabled = true; el.textContent = "Generando…";
    try {
      const blob = await comprimir(await IA.generarFotoPlato(titulo, leerIngredientes(f.ingredientes.value)));
      S.editorFoto = { blob, url: URL.createObjectURL(blob), generada: true };
      $("#editor-foto").innerHTML = `<img src="${S.editorFoto.url}" alt="">`;
    } catch (e) { console.error(e); notificar(errorIA(e, "No se ha podido crear la foto")); }
    el.disabled = false; el.innerHTML = `${icono("chispa")}Generar con Gemini`;
  },
  marcar: async (d) => {
    const item = S.despensa.find((x) => x.id === d.id);
    await updateDoc(ref$("despensa", d.id), { estado: item.estado === "comprado" ? "falta" : "comprado", por: S.user.uid });
  },
  "guardar-compra": async () => {
    const comprados = S.despensa.filter((x) => x.estado === "comprado");
    const lote = writeBatch(db);
    comprados.forEach((x) => lote.update(ref$("despensa", x.id), { estado: "hay", por: S.user.uid }));
    await lote.commit();
    if (comprados.length >= 3 && confirmar(`¿Has hecho tú la compra? (+${tareaDef("compra").puntos} puntos)`)) await registrarTarea("compra", S.user.uid);
  },
  "se-acabo": (d) => updateDoc(ref$("despensa", d.id), { estado: "falta", por: S.user.uid }),
  "borrar-item": (d) => deleteDoc(ref$("despensa", d.id)),
  tema: async (d) => {
    if (esTablet()) localStorage.setItem("temaTablet", d.tema);
    else await updateDoc(ref$("miembros", S.user.uid), { tema: d.tema });
    aplicarTema();
    render();
  },
  notificaciones: () => activarNotificaciones().catch((e) => { console.error(e); notificar("No se pudieron activar: " + (e.code || e.message)); }),
  "compartir-enlace": async (d) => {
    if (navigator.share) navigator.share({ title: "Únete a nuestro menú familiar", url: d.enlace }).catch(() => {});
    else { await navigator.clipboard.writeText(d.enlace); notificar("Enlace copiado"); }
  },
  "quitar-miembro": async (d) => {
    if (!confirmar(`¿Quitar a ${nombreDe(d.id)} del hogar?`)) return;
    await deleteDoc(ref$("miembros", d.id));
  }
};

const FORMS = {
  ...FORMULARIOS,
  async "aviso-comprar"(f) {
    const items = [...f.getAll("item"), ...String(f.get("otro") || "").split(",").map((s) => s.trim()).filter(Boolean)];
    if (!items.length) return notificar("Elige o escribe algo.");
    await anadirFaltan(items);
    await enviarAviso(`Que alguien compre: ${items.join(", ")}`, "comprar");
    cerrarModal();
    notificar("Aviso enviado");
  },
  async "aviso-libre"(f) {
    await enviarAviso(f.get("texto").trim(), "texto", f.get("para"));
    cerrarModal();
    notificar("Aviso enviado");
  },
  async planificar(f, form) {
    const r = receta(form.dataset.id);
    await asignarMenu(`${f.get("fecha")}_${f.get("tipo")}`, r);
    cerrarModal();
    notificar("Planificado");
  },
  async "anadir-item"(f, form) {
    const nombre = f.get("nombre").trim();
    const cantidad = String(f.get("cantidad") || "").trim();
    const existe = S.despensa.find((d) => normal(d.nombre) === normal(nombre));
    if (existe?.estado === "falta" || existe?.estado === "comprado") { form.reset(); return notificar("Ya está en la lista."); }
    if (existe?.estado === "hay") {
      if (!confirmar(`Ojo: ya hay ${nombre} en casa. ¿Añadir a la lista igualmente?`)) return;
      await updateDoc(ref$("despensa", existe.id), { estado: "falta", cantidad, por: S.user.uid });
    } else {
      await addDoc(col$("despensa"), { nombre, cantidad, estado: "falta", por: S.user.uid, ts: serverTimestamp() });
    }
    form.reset();
    form.nombre.focus();
  },
  async nombre(f) {
    await updateDoc(ref$("miembros", yoActivo().id), { nombre: f.get("nombre").trim() });
    notificar("Nombre guardado");
  },
  async "anadir-receta"(f, form, boton) {
    const consulta = String(f.get("consulta") || "").trim();
    const modo = boton?.value || "web";
    if (!consulta) return;
    if (modo === "manual") {
      cerrarModal();
      S.borrador = { titulo: consulta, categoria: "favoritos", tipos: tiposPorDefecto() };
      S.vista = "editor"; S.param = null; S.editorFoto = null;
      render(); window.scrollTo(0, 0);
      return;
    }
    if (modo === "enlace") {
      abrirModal(`${cabeceraModal("Receta de internet")}
        <div class="pila">
          <a class="btn btn-grande" href="https://www.google.com/search?q=${encodeURIComponent("receta " + consulta)}" target="_blank" rel="noopener">1 · Buscar «${esc(consulta)}» en Google</a>
          <p class="suave" style="margin:0">Abre la receta que te guste, copia su dirección (enlace) y pégala aquí:</p>
          <form class="pila" data-form="importar-enlace">
            <input name="url" type="url" required class="entrada-texto" placeholder="https://…" autocomplete="off">
            <button class="btn btn-primario btn-grande">2 · Importar receta y foto</button>
          </form>
        </div>`);
      return;
    }
    if (modo === "ia") {
      const fd = new FormData(); fd.set("pedido", consulta); fd.set("categoria", "quiero_probar");
      return FORMS["pedir-receta"](fd, form);
    }
    abrirModal(`${cabeceraModal("Buscando «" + consulta + "»")}<p>Buscando recetas en Google…</p><div class="cargando-plato" aria-hidden="true"></div>`, true);
    try {
      const { paginas, sugerencias } = await buscarPaginas(consulta);
      S.webResultados = paginas;
      if (!paginas.length) throw new Error("Sin resultados");
      abrirModal(`${cabeceraModal("Recetas encontradas")}
        <p class="suave" style="margin:0">Elige una: se copiarán los ingredientes, los pasos y la foto. Podrás revisarla antes de guardar.</p>
        <div class="resultados-web">${paginas.map((p, i) => `<button class="resultado-web" data-accion="elegir-web" data-i="${i}">
          <span class="foto">${p.imagenes?.[0] ? `<img src="${esc(p.imagenes[0])}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}</span>
          <span class="info"><b>${esc(p.receta?.titulo || p.titulo || p.sitio)}</b><small>${esc(p.sitio)}${p.receta?.ingredientes?.length ? ` · ${p.receta.ingredientes.length} ingredientes` : ""}</small></span>
        </button>`).join("")}</div>
        <div class="google-sugerencias"></div>`, true);
      pintarSugerencias(sugerencias);
    } catch (e) { console.error(e); notificar(errorIA(e, "No se han encontrado recetas")); cerrarModal(); }
  },
  async "importar-enlace"(f, form) {
    const url = String(f.get("url") || "").trim();
    const b = form.querySelector("button"); b.disabled = true; b.textContent = "Leyendo la página…";
    try {
      const res = await leerWebs({ urls: [url] });
      const p = res.data?.paginas?.[0];
      if (!p) throw new Error("No se ha podido leer esa página");
      S.webResultados = [p];
      await ACCIONES["elegir-web"]({ i: 0 });
    } catch (e) { console.error(e); notificar(errorIA(e, "No se ha podido importar")); b.disabled = false; b.textContent = "2 · Importar receta y foto"; }
  },
  async "foto-enlace"(f, form) {
    const url = String(f.get("url") || "").trim();
    const b = form.querySelector("button"); b.disabled = true; b.textContent = "Buscando la foto…";
    try {
      const res = await leerWebs({ urls: [url] }).catch(() => null);
      const fotos = res?.data?.paginas?.[0]?.imagenes || [];
      if (fotos.length > 1) {
        abrirModal(`${cabeceraModal("Elige una foto")}
          <div class="rejilla-fotos">${fotos.map((u) => `<button class="foto-web" data-accion="elegir-foto" data-url="${esc(u)}"><img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()"></button>`).join("")}</div>`, true);
        return;
      }
      cerrarModal();
      await ponerFotoWeb(fotos[0] || url, true);
    } catch (e) { console.error(e); notificar("No se ha podido usar ese enlace"); b.disabled = false; b.textContent = "Usar esta foto"; }
  },
  async "pedir-receta"(f, form) {
    const boton = form.querySelector("button.btn-primario");
    form.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    boton.textContent = "KeKoMeMos está escribiendo la receta…";
    try {
      const r = await IA.crearReceta(String(f.get("pedido")).trim());
      cerrarModal();
      S.vista = "editor"; S.param = null; S.editorFoto = null;
      S.borrador = { ...r, tipos: r.tipos?.length ? r.tipos : tiposPorDefecto(), categoria: f.get("categoria") || "quiero_probar" };
      render();
      notificar("Receta lista. Ahora preparo la foto…");
      try {
        const blob = await comprimir(await IA.generarFotoPlato(r.titulo, r.ingredientes || []));
        if (S.vista === "editor" && !S.editorFoto) {
          S.editorFoto = { blob, url: URL.createObjectURL(blob), generada: true };
          const caja = $("#editor-foto");
          if (caja) caja.innerHTML = `<img src="${S.editorFoto.url}" alt="">`;
        }
      } catch (e) { console.error(e); notificar("La foto no ha salido; se intentará al guardar."); }
    } catch (e) {
      console.error(e);
      notificar(errorIA(e, "No se ha podido crear la receta"));
      form.querySelectorAll("button").forEach((b) => { b.disabled = false; });
      boton.innerHTML = `${icono("chispa")}Volver a intentarlo`;
    }
  },
  async importar(f) {
    const texto = String(f.get("texto") || "").trim();
    const foto = f.get("foto");
    if (!texto && !(foto && foto.size)) return notificar("Pega un texto o elige una foto.");
    const boton = $("#modal button.btn-primario");
    boton.disabled = true; boton.textContent = "Leyendo la receta…";
    try {
      const r = await IA.importarReceta({ texto, foto: foto && foto.size ? await comprimir(foto, 1600) : null });
      cerrarModal();
      S.vista = "editor"; S.param = null; S.editorFoto = null;
      S.borrador = { ...r, categoria: "quiero_probar" };
      render();
      notificar("Revisa la receta y guárdala");
    } catch (e) {
      console.error(e);
      notificar(errorIA(e, "No se ha podido leer la receta"));
      boton.disabled = false; boton.textContent = "Convertir con Gemini";
    }
  },
  async "guardar-receta"(f, form) {
    const boton = form.querySelector("button.btn-primario");
    boton.disabled = true; boton.textContent = "Guardando…";
    try {
      const id = S.param || doc(col$("recetas")).id;
      const datos = {
        titulo: f.get("titulo").trim(),
        categoria: f.get("categoria"),
        subcategoria: f.get("subcategoria") || "",
        minutos: Number(f.get("minutos")) || null,
        raciones: Number(f.get("raciones")) || null,
        ingredientes: leerIngredientes(f.get("ingredientes")),
        tipos: f.getAll("tipos"),
        fuente: f.get("fuente") || "",
        pasos: String(f.get("pasos")).split("\n").map((p) => p.trim().replace(/^\d+[.)-]\s*/, "")).filter(Boolean),
        actualizado: serverTimestamp()
      };
      if (S.editorFoto?.remota) {
        datos.foto = S.editorFoto.url;
        datos.fotoGenerada = false;
      } else if (S.editorFoto?.blob) {
        datos.foto = await subirImagen(`hogares/${S.hogarId}/recetas/${id}-${Date.now()}.jpg`, S.editorFoto.blob);
        datos.fotoGenerada = !!S.editorFoto.generada;
      }
      await setDoc(ref$("recetas", id), datos, { merge: true });
      const sinFoto = !datos.foto && !receta(id)?.foto;
      S.borrador = null; S.editorFoto = null;
      if (S.asignarA) {
        await asignarMenu(S.asignarA, { id, titulo: datos.titulo });
        S.asignarA = null;
        S.vista = "semana"; S.param = null;
        notificar("Receta guardada y añadida al menú");
      } else {
        S.vista = "receta"; S.param = id;
        notificar("Receta guardada");
      }
      render();
      if (sinFoto) fotoParaReceta(id);
    } catch (e) {
      console.error(e);
      notificar("No se pudo guardar.");
      boton.disabled = false; boton.textContent = "Guardar receta";
    }
  }
};

document.addEventListener("click", (e) => {
  S.ultimoUso = Date.now();
  if (esTablet() && S.activoId) { try { sessionStorage.setItem("activo", JSON.stringify({ id: S.activoId, ts: Date.now() })); } catch { /* nada */ } }
  if (e.target.id === "modal") return $("#modal").dataset.fijo ? null : cerrarModal();
  const ej = e.target.closest("[data-ejemplo]");
  if (ej) { const t = ej.closest("form").pedido; t.value = ej.dataset.ejemplo; t.focus(); return; }
  const el = e.target.closest("[data-accion]");
  if (!el || el.disabled) return;
  const f = ACCIONES[el.dataset.accion];
  if (f) { e.preventDefault(); Promise.resolve(f(el.dataset, el)).catch((err) => { console.error(err); notificar("Algo ha fallado: " + (err.code || err.message)); }); }
});
document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  const f = FORMS[form.dataset.form];
  if (f) Promise.resolve(f(new FormData(form), form, e.submitter)).catch((err) => { console.error(err); notificar("Algo ha fallado: " + (err.code || err.message)); });
});
document.addEventListener("input", (e) => {
  if (e.target.dataset.input === "fecha-texto") return sincronizarFecha(e.target.closest(".campo-fecha"), "texto");
  if (e.target.dataset.input === "buscar") {
    S.busqueda = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const b = $("#buscar"); b.focus(); b.setSelectionRange(pos, pos);
  }
});
document.addEventListener("change", async (e) => {
  const t = e.target, tipo = t.dataset.input;
  if (tipo === "fecha-sel") return sincronizarFecha(t.closest(".campo-fecha"), "sel");
  try {
    if (tipo === "importar-recetas" && t.files[0]) {
      let datos;
      try { datos = JSON.parse(await t.files[0].text()); } catch { return notificar("Ese archivo no es una copia de recetas válida."); }
      const lista = Array.isArray(datos) ? datos : datos.recetas;
      if (!Array.isArray(lista)) return notificar("El archivo no contiene recetas.");
      const existentes = new Set(S.recetas.map((r) => normal(r.titulo)));
      const nuevas = [];
      let repetidas = 0, invalidas = 0;
      for (const r of lista) {
        const titulo = String(r?.titulo || "").trim();
        if (!titulo) { invalidas++; continue; }
        if (existentes.has(normal(titulo))) { repetidas++; continue; }
        existentes.add(normal(titulo));
        nuevas.push({
          titulo, categoria: CATEGORIAS[r.categoria] ? r.categoria : "favoritos", subcategoria: String(r.subcategoria || ""),
          tipos: Array.isArray(r.tipos) ? r.tipos.filter((x) => TIPOS_PLATO.some(([id]) => id === x)) : [],
          minutos: Number(r.minutos) || null, raciones: Number(r.raciones) || null,
          ingredientes: Array.isArray(r.ingredientes) ? r.ingredientes.map((i) => (typeof i === "string" ? leerIngredientes(i)[0] : { nombre: String(i?.nombre || ""), cantidad: Number(i?.cantidad) || null, unidad: String(i?.unidad || "") })).filter((i) => i?.nombre) : [],
          pasos: Array.isArray(r.pasos) ? r.pasos.map(String).filter(Boolean) : [],
          fuente: /^https?:\/\//.test(r.fuente || "") ? r.fuente : "",
          foto: /^https:\/\//.test(r.foto || "") ? r.foto : null, fotoGenerada: !!r.fotoGenerada,
          importada: serverTimestamp()
        });
      }
      t.value = "";
      if (!nuevas.length) return notificar(`No hay recetas nuevas que importar (${repetidas} ya existían).`);
      if (!confirmar(`Se van a importar ${nuevas.length} recetas nuevas.${repetidas ? ` ${repetidas} ya existían y se saltan.` : ""}${invalidas ? ` ${invalidas} no eran válidas.` : ""} ¿Continuar?`)) return;
      for (let i = 0; i < nuevas.length; i += 400) {
        const lote = writeBatch(db);
        nuevas.slice(i, i + 400).forEach((r) => lote.set(doc(col$("recetas")), r));
        await lote.commit();
      }
      cerrarModal();
      notificar(`${nuevas.length} recetas importadas${repetidas ? ` · ${repetidas} repetidas saltadas` : ""}`);
    }
    if (tipo === "foto-receta" && t.files[0]) {
      const blob = await comprimir(t.files[0]);
      S.editorFoto = { blob, url: URL.createObjectURL(blob), generada: false };
      $("#editor-foto").innerHTML = `<img src="${S.editorFoto.url}" alt="">`;
    }
    if (tipo === "foto-perfil" && t.files[0]) {
      notificar("Subiendo foto…");
      const id = yoActivo().id;
      const url = await subirImagen(`hogares/${S.hogarId}/avatares/${id}-${Date.now()}.jpg`, await comprimir(t.files[0], 400));
      await updateDoc(ref$("miembros", id), { foto: url });
    }
    if (tipo === "modo-tablet") {
      localStorage.setItem("modoTablet", t.checked ? "1" : "0");
      aplicarTema();
      if (t.checked) fijarActivo(S.user.uid);
      render();
    }
    if (tipo === "cocinera-habitual") { await updateDoc(doc(db, "hogares", S.hogarId), { cocineraHabitual: t.value, cocinaHoy: deleteField() }); notificar("Guardado"); }
    if (tipo === "rol") { await updateDoc(ref$("miembros", t.dataset.id), { rol: t.value }); notificar("Perfil actualizado"); }
  } catch (err) { console.error(err); notificar("No se pudo guardar: " + (err.code || err.message)); }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden && !$("#modal").dataset.fijo) cerrarModal(); });
// En la tablet, tras un rato sin uso, vuelve a preguntar quién es
setInterval(() => {
  if (!esTablet() || !S.activoId || $("#app").hidden) return;
  if (Date.now() - S.ultimoUso > MINUTOS_INACTIVIDAD * 60000 && $("#cocina").hidden && $("#modal").hidden) { S.vista = "hoy"; preguntarQuienEres(); render(); }
}, 30000);
// Al volver a la app tras la medianoche, recarga para empezar el día nuevo
let diaCargado = hoy();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && hoy() !== diaCargado) location.reload(); });
setInterval(() => { if (hoy() !== diaCargado && document.visibilityState === "visible" && $("#cocina").hidden) { diaCargado = hoy(); location.reload(); } }, 60000);
