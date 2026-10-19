// =========================================================
// Menú Familiar · app.js
// Firebase (login, datos, fotos, notificaciones) + pantallas
// =========================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app-check.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  signInAnonymously, signOut, connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, getDoc, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, query, where, orderBy, limit,
  serverTimestamp, increment, writeBatch, arrayUnion, deleteField, connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-storage.js";
import { getMessaging, getToken, isSupported } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging.js";
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
  { id: "azulejo", nombre: "Azulejo", colores: ["#FFFFFF", "#1F4FA8", "#E0A526"] },
  { id: "nordico", nombre: "Nórdico", colores: ["#EEF0EC", "#4D6B5A", "#23302A"] },
  { id: "diner", nombre: "Diner retro", colores: ["#FFF4E2", "#B00E28", "#0F6E6E"] },
  { id: "cielo", nombre: "Cielo", colores: ["#EEF2FA", "#2F5FC4", "#F5A524"] }
];
const CATEGORIAS = { favoritos: "Favoritos", quiero_probar: "Quiero probar", especiales: "Especiales" };
const SUBCATEGORIAS = ["Fin de semana", "Navidad", "Cumpleaños", "Verano", "Otra ocasión"];
const TAREAS = [
  { id: "poner_mesa", nombre: "Poner la mesa", hecho: "ha puesto la mesa", puntos: 10 },
  { id: "quitar_mesa", nombre: "Quitar la mesa", hecho: "ha quitado la mesa", puntos: 10 },
  { id: "llenar_lavavajillas", nombre: "Llenar el lavavajillas", hecho: "ha llenado el lavavajillas", puntos: 10 },
  { id: "vaciar_lavavajillas", nombre: "Vaciar el lavavajillas", hecho: "ha vaciado el lavavajillas", puntos: 10 },
  { id: "basura", nombre: "Sacar la basura", hecho: "ha sacado la basura", puntos: 5 },
  { id: "compra", nombre: "Hacer la compra", hecho: "ha hecho la compra", puntos: 20 }
];
const PUNTOS_RETO = 5;
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

// ---------- ESTADO ----------
const S = {
  user: null, hogarId: null, hogar: null, yo: null,
  miembros: [], recetas: [], menus: {}, despensa: [], avisos: [], tareasHoy: [],
  vista: "hoy", param: null, semana: 0, filtro: "todas", busqueda: "",
  intercambio: null, borrador: null, editorFoto: null,
  inicio: Date.now(), vistos: new Set(), cargado: new Set(), pendiente: false,
  desuscribir: []
};
const esTablet = () => localStorage.getItem("modoTablet") === "1";
const esAdulto = () => S.yo?.rol === "adulto";
const esMenor = () => S.yo?.rol === "menor";
const esAdmin = () => S.hogar?.admin === S.user?.uid;

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
const comidaActual = () => (new Date().getHours() < 17 ? "comida" : "cena");
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
  chispa: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>'
};
const icono = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n]}</svg>`;

// ---------- MENSAJES, MODAL ----------
function notificar(texto) {
  const d = document.createElement("div");
  d.className = "aviso";
  d.setAttribute("role", "status");
  d.textContent = texto;
  $("#avisos-flotantes").appendChild(d);
  setTimeout(() => d.remove(), 3200);
}
function abrirModal(html, ancho = false) {
  const m = $("#modal");
  m.innerHTML = `<div class="modal ${ancho ? "ancho" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false;
  m.querySelector("input:not([type=file]):not([type=hidden]), textarea")?.focus?.();
}
function cerrarModal() { const m = $("#modal"); m.hidden = true; m.innerHTML = ""; }
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
        <h1 class="titulo">Menú familiar</h1>
        <p class="suave">Menús, recetas, lista de la compra y avisos para toda la casa.</p>
        <button class="btn btn-primario btn-grande" data-accion="login-google">Entrar con Google</button>
        <button class="btn btn-grande" data-accion="login-anonimo">Entrar con el código familiar</button>
        <p class="suave" style="font-size:14px">Los adultos entran con su cuenta de Google. Los chicos pueden entrar solo con el código o el QR que tiene el administrador.</p>
      </div>`;
    return;
  }
  const anonimo = S.user?.isAnonymous;
  p.innerHTML = `
    <div class="entrada-caja">
      <h1 class="titulo">${anonimo ? "Únete a tu familia" : "Tu hogar"}</h1>
      <form class="tarjeta seccion pila" data-form="unirse">
        <h2 class="h2">Unirme con código</h2>
        <label class="campo">Código familiar
          <input name="codigo" required maxlength="6" value="${esc(codigo)}" autocapitalize="characters" autocomplete="off" style="text-transform:uppercase;letter-spacing:.2em;font-size:22px">
        </label>
        ${camposPerfil()}
        <button class="btn btn-primario btn-grande">Unirme</button>
      </form>
      ${anonimo ? "" : `
      <form class="tarjeta seccion pila" data-form="crear-hogar">
        <h2 class="h2">…o crear un hogar nuevo</h2>
        <label class="campo">Nombre del hogar <input name="hogar" required placeholder="Casa de los García"></label>
        ${camposPerfil()}
        <button class="btn btn-grande">Crear hogar</button>
      </form>`}
      <button class="btn btn-linea" data-accion="salir">Cerrar sesión</button>
    </div>`;
}
function camposPerfil() {
  return `
    <label class="campo">Tu nombre <input name="nombre" required maxlength="24" value="${esc(S.user?.displayName?.split(" ")[0] || "")}"></label>
    <label class="campo">Fecha de nacimiento <input name="nacimiento" type="date" required>
      <small>Sirve para adaptar el reto del menú. Hasta los ${EDAD_ADULTO} años el perfil es de menor.</small></label>`;
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
  async unirse(f) {
    const codigo = f.get("codigo").trim().toUpperCase();
    const c = await getDoc(doc(db, "codigos", codigo));
    if (!c.exists()) return notificar("Ese código no existe. Revísalo con el administrador.");
    const hid = c.data().hogarId;
    const b = writeBatch(db);
    b.set(doc(db, "hogares", hid, "miembros", S.user.uid), datosMiembro(f, codigo));
    b.set(doc(db, "usuarios", S.user.uid), { hogarId: hid });
    await b.commit();
    sessionStorage.removeItem("unir");
    conectarHogar(hid);
  },
  async "crear-hogar"(f) {
    const hogarRef = doc(collection(db, "hogares"));
    const codigo = generarCodigo();
    const b = writeBatch(db);
    b.set(hogarRef, { nombre: f.get("hogar").trim(), codigo, admin: S.user.uid, cocineraHabitual: S.user.uid, creado: serverTimestamp() });
    b.set(doc(db, "codigos", codigo), { hogarId: hogarRef.id });
    const m = datosMiembro(f, codigo);
    m.rol = "adulto";
    b.set(doc(db, "hogares", hogarRef.id, "miembros", S.user.uid), m);
    b.set(doc(db, "usuarios", S.user.uid), { hogarId: hogarRef.id });
    await b.commit();
    conectarHogar(hogarRef.id);
  }
};

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
      listo("miembros");
    }, err),
    onSnapshot(query(col$("recetas"), orderBy("titulo")), (qs) => { S.recetas = qs.docs.map((d) => ({ id: d.id, ...d.data() })); listo("recetas"); }, err),
    onSnapshot(query(col$("menus"), where("fecha", ">=", iso(masDias(new Date(), -21)))), (qs) => {
      S.menus = {};
      qs.docs.forEach((d) => { S.menus[d.id] = d.data(); });
      listo("menus");
    }, err),
    onSnapshot(col$("despensa"), (qs) => { S.despensa = qs.docs.map((d) => ({ id: d.id, ...d.data() })); listo("despensa"); }, err),
    onSnapshot(query(col$("avisos"), orderBy("ts", "desc"), limit(30)), (qs) => {
      S.avisos = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
      qs.docChanges().forEach((c) => { if (c.type === "added") recibirAviso({ id: c.doc.id, ...c.doc.data() }); });
    }, err),
    onSnapshot(query(col$("tareas"), where("fecha", "==", hoy())), (qs) => {
      S.tareasHoy = qs.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.creadoMs || 0) - (b.creadoMs || 0));
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

function arrancarApp() {
  $("#cargando").hidden = true;
  $("#pantalla-entrada").hidden = true;
  $("#app").hidden = false;
  if (esMenor() && !esTablet()) S.vista = "hoy";
  render();
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
  const items = [["hoy", "Hoy"], ["semana", "Semana"], ["recetas", "Recetas"], ["compra", "Compra"], ["yo", "Yo"]];
  return esMenor() ? items.filter(([v]) => v !== "semana") : items;
}
function render() {
  const vistaBase = { receta: "recetas", editor: "recetas" }[S.vista] || S.vista;
  $("#nav").innerHTML = navItems().map(([v, t], i) =>
    `${i === 4 ? '<span class="nav-hueco"></span>' : ""}<button data-accion="ir" data-vista="${v}" ${vistaBase === v ? 'aria-current="page"' : ""}>${icono(v)}${t}</button>`
  ).join("");
  const sinLeer = S.avisos.filter((a) => a.de !== S.user.uid && (a.para === "todos" || a.para === S.user.uid) && (a.creadoMs || 0) > Number(localStorage.getItem("avisosLeidos") || 0)).length;
  const titulos = { hoy: S.hogar?.nombre || "Hoy en casa", semana: "Menús de la semana", recetas: "Recetas", receta: "Receta", editor: S.param ? "Editar receta" : "Nueva receta", compra: "Lista de la compra", yo: "Mi perfil" };
  const cocina = miembro(cocineraHoy());
  $("#cabecera").innerHTML = `
    <div>
      <div class="fecha">${esc(fechaLarga(new Date()))}</div>
      <h1>${esc(titulos[S.vista] || "")}</h1>
    </div>
    <div class="cabecera-acciones">
      ${S.vista === "hoy" && cocina ? `<button class="chip-cocinero" data-accion="cambiar-cocinera" ${esAdulto() ? "" : "disabled"} aria-label="Hoy cocina ${esc(cocina.nombre)}">${avatar(cocina, 38)}<span><span class="prefijo">Hoy cocina </span>${esc(cocina.nombre)}</span></button>` : ""}
      <button class="btn btn-icono" data-accion="bandeja" aria-label="Avisos">${icono("campana")}${sinLeer ? `<span class="contador">${sinLeer}</span>` : ""}</button>
    </div>`;
  const vistas = { hoy: vistaHoy, semana: vistaSemana, recetas: vistaRecetas, receta: vistaReceta, editor: vistaEditor, compra: vistaCompra, yo: vistaYo };
  $("#vista").innerHTML = (vistas[S.vista] || vistaHoy)();
}

// ---------- HOY ----------
function tarjetaPlato(tipo, grande) {
  const m = S.menus[`${hoy()}_${tipo}`];
  const r = m && receta(m.recetaId);
  const titulo = r?.titulo || m?.titulo;
  const oculto = esMenor() && localStorage.getItem("reto-" + hoy()) !== "1";
  const etiqueta = tipo === "comida" ? "Comida" : "Cena";
  if (!titulo) {
    return `<article class="tarjeta plato ${grande ? "" : "compacto"}">
      <div class="foto">${grande ? "<span>Sin planificar</span>" : ""}${grande ? `<span class="etiqueta-flotante">${etiqueta.toUpperCase()}</span>` : ""}</div>
      <div class="plato-cuerpo">
        ${grande ? "" : `<div class="etiqueta">${etiqueta}</div>`}
        <div class="plato-titulo">Sin planificar</div>
        ${esAdulto() ? `<div class="fila"><button class="btn btn-primario" data-accion="elegir-hueco" data-hueco="${hoy()}_${tipo}">Elegir plato</button>
        <button class="btn" data-accion="sorpresa" data-hueco="${hoy()}_${tipo}">${icono("chispa")}Sorpréndeme</button></div>` : ""}
      </div></article>`;
  }
  const meta = [r?.minutos ? `${r.minutos} min` : "", CATEGORIAS[r?.categoria] || "", r?.subcategoria || ""].filter(Boolean).join(" · ");
  return `<article class="tarjeta plato ${grande ? "" : "compacto"}" style="position:relative">
    <div class="foto ${oculto ? "oculto-reto" : ""}">${fotoHTML(r, "Sin foto")}${grande ? `<span class="etiqueta-flotante">${etiqueta.toUpperCase()}</span>` : ""}</div>
    <div class="plato-cuerpo">
      ${grande ? "" : `<div class="etiqueta">${etiqueta}</div>`}
      <div class="${oculto ? "oculto-reto" : ""}"><div class="plato-titulo">${esc(titulo)}</div><div class="suave">${esc(meta)}</div></div>
      ${oculto ? `<button class="btn btn-acento btn-grande" data-accion="reto">¿Qué hay de ${tipo}? Resuelve el reto</button>` : `
      <div class="fila">
        ${r ? `<button class="btn" data-accion="ver-receta" data-id="${r.id}">Ver receta</button>` : ""}
        ${esAdulto() ? `<button class="btn" data-accion="elegir-hueco" data-hueco="${hoy()}_${tipo}">Cambiar</button>` : ""}
        ${r && esAdulto() && grande ? `<button class="btn btn-primario" data-accion="cocinar" data-id="${r.id}">${icono("mic")}Cocinar</button>` : ""}
      </div>`}
    </div></article>`;
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
  const hechas = S.tareasHoy.map((t) => `<li>${avatar(miembro(t.uid), 32)}<span class="crece"><b>${esc(nombreDe(t.uid))}</b> ${esc(TAREAS.find((x) => x.id === t.tarea)?.hecho || t.tarea)}</span><span class="suave">+${t.puntos}</span></li>`).join("");
  return `<section class="tarjeta seccion">
    <div class="fila" style="justify-content:space-between;margin-bottom:12px"><h2 class="h2">Tareas de casa</h2><span class="suave" style="font-size:14px">suman puntos</span></div>
    <div class="botones-aviso">
      ${TAREAS.map((t) => `<button class="btn" data-accion="tarea" data-tarea="${t.id}">${esc(t.nombre)} <span class="suave">+${t.puntos}</span></button>`).join("")}
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
        <span>${esc(m.nombre)} ${i === 0 && puntosMes(m) > 0 ? '<span class="corona">· Líder del mes</span>' : ""}</span>
        <b>${puntosMes(m)} pts</b>
        <div class="barra-progreso"><span style="width:${Math.round((puntosMes(m) / max) * 100)}%"></span></div>
      </div>`).join("")}
    </div>
    ${completo ? `<p class="suave" style="font-size:14px;margin:14px 0 0">${TAREAS.map((t) => `${esc(t.nombre)} +${t.puntos}`).join(" · ")} · Reto del menú +${PUNTOS_RETO}. Quien gane el mes elige la cena especial del sábado.</p>` : ""}
  </section>`;
}

function vistaHoy() {
  return `<div class="hoy">
    <div class="pila">
      ${tarjetaPlato("comida", comidaActual() === "comida")}
      ${tarjetaPlato("cena", comidaActual() === "cena")}
      ${esAdulto() ? botonCocinarAhora() : ""}
      ${panelTareas()}
    </div>
    <div class="pila">
      ${panelAvisos()}
      ${esMenor() ? "" : panelSemanaMini()}
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

// ---------- SEMANA ----------
function vistaSemana() {
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
      <button class="btn" data-accion="semana" data-delta="-1" aria-label="Semana anterior">‹</button>
      <strong class="crece" style="text-align:center">Semana del ${esc(lunes.toLocaleDateString("es-ES", { day: "numeric", month: "long" }))}</strong>
      <button class="btn" data-accion="semana" data-delta="1" aria-label="Semana siguiente">›</button>
    </div>
    ${esAdulto() ? `<div class="fila">
      <button class="btn btn-primario crece" data-accion="sugerir-semana">${icono("chispa")}Rellenar huecos con Gemini</button>
      <button class="btn crece" data-accion="compra-semana">${icono("compra")}Lista de la compra</button>
    </div>` : ""}
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

// ---------- RECETAS ----------
function vistaRecetas() {
  const filtros = [["todas", "Todas"], ...Object.entries(CATEGORIAS)];
  const b = normal(S.busqueda);
  const lista = S.recetas.filter((r) =>
    (S.filtro === "todas" || r.categoria === S.filtro) && (!b || normal(r.titulo).includes(b) || (r.ingredientes || []).some((i) => normal(i.nombre).includes(b))));
  return `<div class="pila">
    <div class="fila">
      <label class="oculto-visual" for="buscar">Buscar receta</label>
      <input id="buscar" class="entrada-texto crece" placeholder="Buscar por nombre o ingrediente" value="${esc(S.busqueda)}" data-input="buscar">
      ${esAdulto() ? `<button class="btn btn-primario" data-accion="nueva-receta">+ Nueva</button><button class="btn" data-accion="importar">${icono("chispa")}Importar</button>` : ""}
    </div>
    <div class="chips-scroll">${filtros.map(([id, t]) => `<button class="chip" data-accion="filtro" data-filtro="${id}" aria-pressed="${S.filtro === id}">${esc(t)}</button>`).join("")}</div>
    ${lista.length ? `<div class="rejilla-recetas">${lista.map((r) => `
      <button class="tarjeta receta-tarjeta" data-accion="ver-receta" data-id="${r.id}">
        <div class="foto">${fotoHTML(r)}</div>
        <div class="info"><strong>${esc(r.titulo)}</strong><span class="suave" style="font-size:13px">${esc([CATEGORIAS[r.categoria], r.subcategoria, r.minutos ? r.minutos + " min" : ""].filter(Boolean).join(" · "))}</span></div>
      </button>`).join("")}</div>`
      : `<div class="vacio">${S.recetas.length ? "Nada coincide con la búsqueda." : "Aún no hay recetas. Crea la primera o impórtala desde un texto o una foto."}</div>`}
  </div>`;
}

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
          <button class="btn" data-accion="editar-receta" data-id="${r.id}">Editar</button>` : ""}
        </div>
      </div>
      <div class="pila">
        <div>
          <div class="etiqueta">${esc([CATEGORIAS[r.categoria], r.subcategoria].filter(Boolean).join(" · "))}</div>
          <h2 class="titulo">${esc(r.titulo)}</h2>
          <div class="suave">${esc([r.minutos ? r.minutos + " min" : "", r.raciones ? r.raciones + " raciones" : ""].filter(Boolean).join(" · "))}</div>
        </div>
        <section class="tarjeta seccion"><h3 class="h2" style="margin-bottom:8px">Ingredientes</h3><ul class="lista">${ing || '<li class="suave">Sin ingredientes</li>'}</ul></section>
        <section class="tarjeta seccion"><h3 class="h2" style="margin-bottom:8px">Pasos</h3><ol class="pasos">${(r.pasos || []).map((p) => `<li>${esc(p)}</li>`).join("") || '<li class="suave">Sin pasos</li>'}</ol></section>
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

function vistaEditor() {
  const r = S.borrador || receta(S.param) || { categoria: "favoritos" };
  const foto = S.editorFoto?.url || r.foto;
  return `<form class="pila" data-form="guardar-receta" style="max-width:900px">
    <div class="fila"><button type="button" class="btn" data-accion="${S.param ? "ver-receta" : "ir"}" data-id="${esc(S.param || "")}" data-vista="recetas">‹ Volver</button></div>
    <div class="receta-detalle">
      <div class="pila">
        <div class="foto" id="editor-foto" style="aspect-ratio:4/3;border-radius:var(--radio)">${foto ? `<img src="${esc(foto)}" alt="">` : "<span>Sin foto</span>"}</div>
        <div class="fila">
          <label class="btn crece">Subir foto<input type="file" accept="image/*" data-input="foto-receta" hidden></label>
          <button type="button" class="btn crece" data-accion="generar-foto">${icono("chispa")}Generar con Gemini</button>
        </div>
        <small class="suave">Tu foto siempre tiene prioridad sobre la generada.</small>
      </div>
      <div class="pila">
        <label class="campo">Nombre <input name="titulo" required value="${esc(r.titulo || "")}"></label>
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
  const yo = S.yo;
  const temaActual = (esTablet() && localStorage.getItem("temaTablet")) || yo.tema;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const notifActivas = typeof Notification !== "undefined" && Notification.permission === "granted" && (yo.tokens || []).length > 0;
  return `<div class="hoy">
    <div class="pila">
      <section class="tarjeta seccion pila">
        <div class="fila">
          ${avatar(yo, 72)}
          <div class="crece"><strong style="font-size:20px">${esc(yo.nombre)}</strong><div class="suave">${yo.rol === "adulto" ? "Adulto" : "Menor"}${esAdmin() ? " · Administrador" : ""} · ${puntosMes(yo)} pts este mes</div></div>
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
        <label class="fila"><input type="checkbox" data-input="modo-tablet" ${esTablet() ? "checked" : ""} style="width:24px;height:24px"> Es la tablet de la cocina</label>
        <button class="btn btn-linea" data-accion="salir">Cerrar sesión</button>
      </section>
    </div>
    <div class="pila">
      ${panelRanking(true)}
      ${esAdulto() ? panelHogar() : ""}
    </div>
  </div>`;
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
    <ul class="lista">${S.miembros.map((m) => `<li>
      ${avatar(m, 40)}
      <span class="crece">${esc(m.nombre)}${m.nacimiento ? ` <span class="suave">· ${edad(m.nacimiento)} años</span>` : ""}</span>
      <select data-input="rol" data-id="${m.id}" aria-label="Perfil de ${esc(m.nombre)}" ${m.id === h.admin ? "disabled" : ""} class="entrada-texto" style="width:auto">
        <option value="adulto" ${m.rol === "adulto" ? "selected" : ""}>Adulto</option>
        <option value="menor" ${m.rol === "menor" ? "selected" : ""}>Menor</option>
      </select>
      ${esAdmin() && m.id !== h.admin ? `<button class="btn-x" data-accion="quitar-miembro" data-id="${m.id}" aria-label="Quitar a ${esc(m.nombre)}">×</button>` : ""}
    </li>`).join("")}</ul>
  </section>`;
}

// =========================================================
// ACCIONES DE DATOS
// =========================================================
async function sumarPuntos(uid, n) {
  if (!uid || !n) return;
  await updateDoc(ref$("miembros", uid), { [`puntos.${mes()}`]: increment(n) });
}
async function registrarTarea(tareaId, uid) {
  const t = TAREAS.find((x) => x.id === tareaId);
  await addDoc(col$("tareas"), { tarea: tareaId, uid, puntos: t.puntos, por: S.user.uid, fecha: hoy(), creadoMs: Date.now(), ts: serverTimestamp() });
  await sumarPuntos(uid, t.puntos);
  notificar(`+${t.puntos} para ${nombreDe(uid)}`);
}
async function asignarMenu(huecoId, r) {
  const [fecha, tipo] = huecoId.split("_");
  await setDoc(ref$("menus", huecoId), { fecha, tipo, recetaId: r.id, titulo: r.titulo });
}
async function enviarAviso(texto, tipo = "texto", para = "todos", extra = {}) {
  await addDoc(col$("avisos"), { texto, tipo, para, de: S.user.uid, deNombre: S.yo.nombre, creadoMs: Date.now(), ts: serverTimestamp(), ...extra });
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
  setTimeout(() => d.remove(), 30000);
  if (!$("#app").hidden) render();
}
async function responderAviso(id, valor) {
  const a = S.avisos.find((x) => x.id === id);
  if (!a) return;
  if (valor === "mesa-yo") {
    if (a.hechoPor) return notificar(`${nombreDe(a.hechoPor)} ya se ha ofrecido`);
    await updateDoc(ref$("avisos", id), { hechoPor: S.user.uid });
    await registrarTarea("poner_mesa", S.user.uid);
    return enviarAviso(`${S.yo.nombre} pone la mesa`, "respuesta", a.de);
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

// ---------- MODALES ----------
function modalElegirReceta(titulo, alElegir) {
  const pintar = (filtro = "") => {
    const b = normal(filtro);
    const grupos = Object.entries(CATEGORIAS).map(([id, t]) => {
      const rs = S.recetas.filter((r) => r.categoria === id && (!b || normal(r.titulo).includes(b)));
      return rs.length ? `<h3 class="h2" style="margin-top:6px">${t}</h3><ul class="lista">${rs.map((r) => `<li><button class="btn crece" style="justify-content:flex-start" data-elegir="${r.id}">${esc(r.titulo)}${r.subcategoria ? ` <span class="suave">· ${esc(r.subcategoria)}</span>` : ""}</button></li>`).join("")}</ul>` : "";
    }).join("");
    $("#lista-elegir").innerHTML = grupos || `<p class="vacio">No hay recetas${b ? " con ese nombre" : ""}.</p>`;
  };
  abrirModal(`${cabeceraModal(titulo)}
    <input class="entrada-texto" id="filtro-elegir" placeholder="Buscar receta" autocomplete="off">
    <div id="lista-elegir" class="pila"></div>`);
  pintar();
  $("#filtro-elegir").addEventListener("input", (e) => pintar(e.target.value));
  $("#lista-elegir").addEventListener("click", (e) => {
    const b = e.target.closest("[data-elegir]");
    if (b) { cerrarModal(); alElegir(receta(b.dataset.elegir)); }
  });
}

function modalReto() {
  const r = IA.generarReto(edad(S.yo.nacimiento) ?? 16);
  abrirModal(`${cabeceraModal("Reto del menú")}
    <p class="suave">Acierta y descubre qué hay hoy de comer (+${PUNTOS_RETO} puntos).</p>
    <div class="reto-pregunta">${esc(r.pregunta)}</div>
    <div class="reto-opciones">${r.opciones.map((o) => `<button class="btn" data-respuesta="${esc(o)}">${esc(o)}</button>`).join("")}</div>`);
  $(".reto-opciones").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-respuesta]");
    if (!b) return;
    if (String(b.dataset.respuesta) === String(r.correcta)) {
      const clave = "reto-" + hoy();
      const primera = localStorage.getItem(clave) !== "1";
      localStorage.setItem(clave, "1");
      cerrarModal();
      notificar("¡Correcto! Ya puedes ver el menú.");
      if (primera) await sumarPuntos(S.user.uid, PUNTOS_RETO);
      render();
    } else {
      b.classList.add("mal");
      b.textContent = "Casi…";
      setTimeout(modalReto, 900);
    }
  });
}

function modalTarea(tareaId) {
  const t = TAREAS.find((x) => x.id === tareaId);
  const personas = esMenor() ? [S.yo] : S.miembros;
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
  "login-anonimo": async () => {
    try { await signInAnonymously(auth); } catch (e) {
      notificar(e.code === "auth/admin-restricted-operation"
        ? "La entrada con código no está activada todavía. El administrador debe activar «Anónimo» en Firebase › Authentication."
        : "No se pudo entrar: " + e.code);
    }
  },
  salir: async () => { if (confirmar("¿Cerrar sesión en este dispositivo?")) { await signOut(auth); location.reload(); } },
  ir: (d) => { S.vista = d.vista; S.param = null; S.borrador = null; S.editorFoto = null; render(); window.scrollTo(0, 0); },
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
  reto: modalReto,
  "ver-receta": (d) => { if (!d.id) return ACCIONES.ir({ vista: "recetas" }); S.vista = "receta"; S.param = d.id; render(); window.scrollTo(0, 0); },
  "nueva-receta": () => { S.vista = "editor"; S.param = null; S.borrador = null; S.editorFoto = null; render(); },
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
  "elegir-hueco": (d) => modalElegirReceta("Elegir plato", (r) => asignarMenu(d.hueco, r)),
  sorpresa: async (d) => {
    const pool = S.recetas.filter((r) => r.categoria === "quiero_probar" || r.categoria === "especiales");
    const lista = pool.length ? pool : S.recetas;
    if (!lista.length) return notificar("Primero añade alguna receta.");
    const r = lista[Math.floor(Math.random() * lista.length)];
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
    if (!m) return modalElegirReceta("Elegir plato", (r) => asignarMenu(id, r));
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
  "sugerir-semana": async (_, el) => {
    if (!S.recetas.length) return notificar("Primero añade algunas recetas.");
    const lunes = masDias(lunesDe(new Date()), S.semana * 7);
    const huecos = [];
    for (let i = 0; i < 7; i++) {
      const f = iso(masDias(lunes, i));
      if (f < hoy()) continue;
      ["comida", "cena"].forEach((t) => { if (!S.menus[`${f}_${t}`]) huecos.push(`${f}_${t}`); });
    }
    if (!huecos.length) return notificar("No hay huecos libres esta semana.");
    el.disabled = true; el.textContent = "Pensando el menú…";
    try {
      const asign = await IA.sugerirSemana(S.recetas, huecos);
      const lote = writeBatch(db);
      asign.forEach((a) => { const r = receta(a.recetaId); const [fecha, tipo] = a.hueco.split("_"); lote.set(ref$("menus", a.hueco), { fecha, tipo, recetaId: r.id, titulo: r.titulo }); });
      await lote.commit();
      notificar(`${asign.length} huecos rellenados`);
    } catch (e) { console.error(e); notificar("Gemini no ha podido sugerir ahora."); render(); }
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
    } catch (e) { console.error(e); notificar("No se pudo calcular la lista ahora."); }
    render();
  },
  importar: () => abrirModal(`${cabeceraModal("Importar receta")}
    <form class="pila" data-form="importar">
      <label class="campo">Pega el texto de la receta <textarea name="texto" rows="6" placeholder="Copia la receta de una web, un mensaje…"></textarea></label>
      <label class="campo">…o haz una foto (libro, revista, pantalla) <input type="file" name="foto" accept="image/*"></label>
      <button class="btn btn-primario btn-grande">${icono("chispa")}Convertir con Gemini</button>
    </form>`),
  "generar-foto": async (_, el) => {
    const f = el.closest("form");
    const titulo = f.titulo.value.trim();
    if (!titulo) return notificar("Escribe primero el nombre del plato.");
    el.disabled = true; el.textContent = "Generando…";
    try {
      const blob = await comprimir(await IA.generarFotoPlato(titulo, leerIngredientes(f.ingredientes.value)));
      S.editorFoto = { blob, url: URL.createObjectURL(blob), generada: true };
      $("#editor-foto").innerHTML = `<img src="${S.editorFoto.url}" alt="">`;
    } catch (e) { console.error(e); notificar("No se pudo generar la foto."); }
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
    if (comprados.length >= 3 && confirmar(`¿Has hecho tú la compra? (+${TAREAS.find((t) => t.id === "compra").puntos} puntos)`)) await registrarTarea("compra", S.user.uid);
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
    await updateDoc(ref$("miembros", S.user.uid), { nombre: f.get("nombre").trim() });
    notificar("Nombre guardado");
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
      notificar("No se pudo leer la receta.");
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
        pasos: String(f.get("pasos")).split("\n").map((p) => p.trim().replace(/^\d+[.)-]\s*/, "")).filter(Boolean),
        actualizado: serverTimestamp()
      };
      if (S.editorFoto?.blob) {
        datos.foto = await subirImagen(`hogares/${S.hogarId}/recetas/${id}-${Date.now()}.jpg`, S.editorFoto.blob);
        datos.fotoGenerada = !!S.editorFoto.generada;
      }
      await setDoc(ref$("recetas", id), datos, { merge: true });
      S.borrador = null; S.editorFoto = null;
      S.vista = "receta"; S.param = id;
      render();
      notificar("Receta guardada");
    } catch (e) {
      console.error(e);
      notificar("No se pudo guardar.");
      boton.disabled = false; boton.textContent = "Guardar receta";
    }
  }
};

document.addEventListener("click", (e) => {
  if (e.target.id === "modal") return cerrarModal();
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
  if (f) Promise.resolve(f(new FormData(form), form)).catch((err) => { console.error(err); notificar("Algo ha fallado: " + (err.code || err.message)); });
});
document.addEventListener("input", (e) => {
  if (e.target.dataset.input === "buscar") {
    S.busqueda = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const b = $("#buscar"); b.focus(); b.setSelectionRange(pos, pos);
  }
});
document.addEventListener("change", async (e) => {
  const t = e.target, tipo = t.dataset.input;
  try {
    if (tipo === "foto-receta" && t.files[0]) {
      const blob = await comprimir(t.files[0]);
      S.editorFoto = { blob, url: URL.createObjectURL(blob), generada: false };
      $("#editor-foto").innerHTML = `<img src="${S.editorFoto.url}" alt="">`;
    }
    if (tipo === "foto-perfil" && t.files[0]) {
      notificar("Subiendo foto…");
      const url = await subirImagen(`hogares/${S.hogarId}/avatares/${S.user.uid}-${Date.now()}.jpg`, await comprimir(t.files[0], 400));
      await updateDoc(ref$("miembros", S.user.uid), { foto: url });
    }
    if (tipo === "modo-tablet") { localStorage.setItem("modoTablet", t.checked ? "1" : "0"); aplicarTema(); render(); }
    if (tipo === "cocinera-habitual") { await updateDoc(doc(db, "hogares", S.hogarId), { cocineraHabitual: t.value, cocinaHoy: deleteField() }); notificar("Guardado"); }
    if (tipo === "rol") { await updateDoc(ref$("miembros", t.dataset.id), { rol: t.value }); notificar("Perfil actualizado"); }
  } catch (err) { console.error(err); notificar("No se pudo guardar: " + (err.code || err.message)); }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) cerrarModal(); });
// Al volver a la app tras la medianoche, recarga para empezar el día nuevo
let diaCargado = hoy();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && hoy() !== diaCargado) location.reload(); });
setInterval(() => { if (hoy() !== diaCargado && document.visibilityState === "visible" && $("#cocina").hidden) { diaCargado = hoy(); location.reload(); } }, 60000);
