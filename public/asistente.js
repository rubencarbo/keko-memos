// =========================================================
// KeKoMeMos · asistente.js
// Gemini (Firebase AI Logic), modo cocina manos libres
// y el reto de los menores.
// =========================================================
import {
  getAI, getGenerativeModel, getLiveGenerativeModel, startAudioConversation,
  GoogleAIBackend, ResponseModality, Schema
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-ai.js";

// Modelos (si Google retira alguno, se cambia solo aquí)
export const MODELOS = {
  texto: "gemini-3.5-flash",
  imagen: "gemini-3.1-flash-image",
  voz: "gemini-3.1-flash-live-preview"
};
// Voces disponibles en Gemini Live: Aoede, Kore, Leda, Zephyr, Puck, Charon…
export const VOZ_GEMINI = "Aoede";

let ai = null;
export function iniciarIA(app) {
  ai = getAI(app, { backend: new GoogleAIBackend() });
}

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Gemini: texto y JSON ----------
function modelo(json, sistema) {
  return getGenerativeModel(ai, {
    model: MODELOS.texto,
    systemInstruction: sistema,
    generationConfig: json ? { responseMimeType: "application/json", temperature: 0.4 } : { temperature: 0.7 }
  });
}

export async function preguntar(texto, sistema) {
  const r = await modelo(false, sistema).generateContent(texto);
  return r.response.text().trim();
}

async function pedirJSON(partes, sistema) {
  const r = await modelo(true, sistema).generateContent(partes);
  let t = r.response.text().trim();
  t = t.replace(/^```(json)?/i, "").replace(/```$/, "");
  return JSON.parse(t);
}

async function archivoAParte(file) {
  const datos = await new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result).split(",")[1]);
    lector.onerror = mal;
    lector.readAsDataURL(file);
  });
  return { inlineData: { mimeType: file.type || "image/jpeg", data: datos } };
}

const FORMATO_RECETA = `Devuelve SOLO JSON con esta forma:
{"titulo": string, "minutos": number, "raciones": number,
 "ingredientes": [{"nombre": string, "cantidad": number|null, "unidad": string}],
 "pasos": [string]}
Reglas: castellano de España; "nombre" del ingrediente en minúsculas y singular cuando sea natural (ej. "huevo", "fideo fino", "nata para cocinar");
unidades solo de esta lista: "g", "kg", "ml", "l", "ud", "cucharada", "cucharadita", "diente", "pizca", "lata", "al gusto";
pasos cortos y claros, uno por elemento, sin numerar.`;

// Importar receta desde texto pegado o desde una foto (libro, pantalla…)
export async function importarReceta({ texto, foto }) {
  const partes = [FORMATO_RECETA];
  if (texto) partes.push("Texto de la receta:\n" + texto);
  if (foto) { partes.push("Extrae la receta de esta imagen."); partes.push(await archivoAParte(foto)); }
  return pedirJSON(partes, "Eres un asistente de cocina que estructura recetas caseras españolas.");
}

// Crear una receta nueva a partir de una petición ("fideos a la cazuela", "algo con calabacín y rápido"…)
export async function crearReceta(pedido) {
  return pedirJSON([FORMATO_RECETA, `Escribe una receta casera, realista y bien explicada para una familia de 5 (2 adultos y 3 adolescentes) a partir de esta petición: "${pedido}". Si es un plato tradicional, respeta la receta clásica española.`],
    "Eres KeKoMeMos, el ayudante de cocina de una familia española. Escribes recetas fiables, con cantidades concretas.");
}

// Prueba rápida de que Gemini responde (para diagnosticar)
export async function probarGemini() {
  const t0 = Date.now();
  const r = await preguntar("Responde solo con: ¡Hola desde KeKoMeMos!");
  return `${r} (${Date.now() - t0} ms)`;
}

// Foto del plato generada por Gemini → Blob
export async function generarFotoPlato(titulo, ingredientes = []) {
  const m = getGenerativeModel(ai, {
    model: MODELOS.imagen,
    generationConfig: { responseModalities: [ResponseModality.TEXT, ResponseModality.IMAGE] }
  });
  const lista = ingredientes.slice(0, 8).map((i) => i.nombre).join(", ");
  const prompt = `Fotografía gastronómica realista y apetecible de "${titulo}", plato casero español servido en la mesa de una cocina familiar, luz natural de ventana, vista a 45 grados, sin texto ni personas.${lista ? " Ingredientes: " + lista + "." : ""}`;
  const r = await m.generateContent(prompt);
  const parte = (r.response.inlineDataParts() || [])[0];
  if (!parte) throw new Error("Gemini no devolvió imagen");
  const bin = atob(parte.inlineData.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: parte.inlineData.mimeType || "image/png" });
}

// Rellenar huecos vacíos de la semana
export async function sugerirSemana(recetas, huecos) {
  const catalogo = recetas.map((r) => ({ id: r.id, titulo: r.titulo, categoria: r.categoria, subcategoria: r.subcategoria || "" }));
  const res = await pedirJSON([
    `Planifica las comidas de una familia de 5 (2 adultos y 3 adolescentes).
Huecos a rellenar (fecha_tipo): ${JSON.stringify(huecos)}
Recetas disponibles: ${JSON.stringify(catalogo)}
Reglas: usa SOLO ids del catálogo; no repitas receta en la misma semana si hay alternativas; comidas más contundentes que cenas;
incluye 1 o 2 recetas "quiero_probar"; usa las "especiales" de fin de semana en sábado o domingo; mayoría "favoritos".
Devuelve JSON: {"asignaciones":[{"hueco":"YYYY-MM-DD_comida","recetaId":"..."}]}`
  ]);
  const ids = new Set(recetas.map((r) => r.id));
  return (res.asignaciones || []).filter((a) => ids.has(a.recetaId) && huecos.includes(a.hueco));
}

// Lista de la compra a partir de los menús, descontando lo que ya hay en casa
export async function calcularCompra(recetasPlanificadas, hayEnCasa) {
  const res = await pedirJSON([
    `Recetas planificadas (pueden repetirse): ${JSON.stringify(recetasPlanificadas.map((r) => ({ titulo: r.titulo, ingredientes: r.ingredientes || [] })))}
Ya hay en casa: ${JSON.stringify(hayEnCasa)}
Suma cantidades del mismo ingrediente, unifica nombres equivalentes y quita lo que ya hay en casa y básicos de despensa (sal, agua, aceite si ya hay).
Devuelve JSON: {"faltan":[{"nombre":"huevo","cantidad":12,"unidad":"ud"}]} con nombres en minúsculas.`
  ]);
  return res.faltan || [];
}

// Acertijo de lógica o ingenio creado por Gemini; si falla, reto matemático local
export async function generarAcertijo(edad = 16) {
  if (Math.random() < 0.35) return generarReto(edad);
  try {
    const temas = ["lógica", "adivinanza", "ingenio lateral", "secuencia de letras", "acertijo de cocina", "problema de razonamiento", "acertijo con trampa"];
    const tema = temas[Math.floor(Math.random() * temas.length)];
    const r = await pedirJSON([`Crea un acertijo de ${tema} en castellano para alguien de ${edad} años, ni demasiado fácil ni imposible, que se pueda resolver en menos de un minuto.
Debe tener UNA única respuesta correcta clara y 3 opciones incorrectas plausibles. Respuestas cortas (máximo 5 palabras).
Devuelve JSON: {"pregunta": string, "opciones": [4 strings], "correcta": string (idéntica a una de las opciones), "explicacion": string corta}`],
      "Eres KeKoMeMos, un asistente divertido que pone retos mentales a adolescentes antes de desvelar el menú del día.");
    if (!r?.pregunta || !Array.isArray(r.opciones) || r.opciones.length < 2 || !r.opciones.includes(r.correcta)) throw new Error("acertijo mal formado");
    return { pregunta: r.pregunta, opciones: barajar([...r.opciones]), correcta: r.correcta, explicacion: r.explicacion || "", ia: true };
  } catch (e) {
    console.warn("Acertijo local:", e);
    return generarReto(edad);
  }
}

// =========================================================
// Reto para menores (se genera aquí: instantáneo, gratis y sin conexión)
// =========================================================
const azar = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function generarReto(edad = 16) {
  const dificil = edad >= 16;
  const tipos = ["secuencia", "ecuacion", "porcentaje", "prioridad", "dias", "edades"];
  const tipo = tipos[azar(0, tipos.length - 1)];
  let pregunta, correcta;

  if (tipo === "secuencia") {
    if (dificil && Math.random() < 0.5) {
      const a = azar(2, 5), r = azar(2, 3);
      const s = [a, a * r, a * r * r, a * r ** 3];
      pregunta = `¿Qué número sigue? ${s.join(", ")}, …`;
      correcta = a * r ** 4;
    } else {
      const a = azar(3, 20), d = azar(3, 9), e = azar(1, 3);
      const s = [a, a + d, a + 2 * d + e, a + 3 * d + 3 * e];
      pregunta = `¿Qué número sigue? ${s.join(", ")}, …`;
      correcta = a + 4 * d + 6 * e;
    }
  } else if (tipo === "ecuacion") {
    const x = azar(2, 12), a = azar(2, dificil ? 9 : 5), b = azar(1, 20);
    pregunta = `Si ${a}x + ${b} = ${a * x + b}, ¿cuánto vale x?`;
    correcta = x;
  } else if (tipo === "porcentaje") {
    const p = [10, 15, 20, 25, 30, 40, 75][azar(0, 6)], n = azar(2, 16) * 20;
    pregunta = `¿Cuánto es el ${p}% de ${n}?`;
    correcta = (p * n) / 100;
  } else if (tipo === "prioridad") {
    const a = azar(2, 20), b = azar(2, 9), c = azar(2, 9), d = azar(1, 15);
    pregunta = `Calcula sin calculadora: ${a} + ${b} × ${c} − ${d}`;
    correcta = a + b * c - d;
  } else if (tipo === "dias") {
    const n = azar(10, dificil ? 100 : 40);
    const hoy = new Date().getDay();
    const res = (hoy + n) % 7;
    pregunta = `Hoy es ${DIAS[hoy]}. ¿Qué día de la semana será dentro de ${n} días?`;
    const opciones = new Set([DIAS[res]]);
    while (opciones.size < 4) opciones.add(DIAS[azar(0, 6)]);
    return { pregunta, opciones: barajar([...opciones]), correcta: DIAS[res] };
  } else {
    const hijo = azar(8, 15), dif = azar(20, 32), anos = azar(3, 12);
    pregunta = `Una madre tiene ${hijo + dif} años y su hijo ${hijo}. ¿Cuántos años tendrá la madre cuando su hijo tenga ${hijo + anos}?`;
    correcta = hijo + dif + anos;
  }
  const opciones = new Set([correcta]);
  while (opciones.size < 4) {
    const delta = azar(1, Math.max(3, Math.round(Math.abs(correcta) * 0.25)));
    opciones.add(correcta + (Math.random() < 0.5 ? -delta : delta));
  }
  return { pregunta, opciones: barajar([...opciones]), correcta };
}
function barajar(a) { for (let i = a.length - 1; i > 0; i--) { const j = azar(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// =========================================================
// MODO COCINA MANOS LIBRES
// =========================================================
const ICONO_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const NUMEROS = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, "media hora": 30, "un cuarto de hora": 15 };

export function abrirCocina({ contenedor, receta, cocinero, alCerrar }) {
  const c = {
    paso: 0,
    escuchando: false,
    hablando: false,
    live: null,
    reconocedor: null,
    temporizadores: [],
    historial: [],
    wakeLock: null,
    voz: null
  };
  const pasos = receta.pasos?.length ? receta.pasos : ["Esta receta no tiene pasos todavía. Pregúntame lo que necesites."];
  const sistema = `Eres el ayudante de cocina de una familia española. Hablas con ${cocinero || "quien cocina"}, que tiene las manos ocupadas.
Responde SIEMPRE en castellano de España, con tono cercano, cálido y alegre, en frases cortas (máximo 3) y sin listas ni símbolos, porque tu respuesta se leerá en voz alta.
Receta: ${receta.titulo}. Raciones: ${receta.raciones || "?"}.
Ingredientes: ${(receta.ingredientes || []).map((i) => `${i.cantidad ?? ""} ${i.unidad ?? ""} ${i.nombre}`.trim()).join("; ")}.
Pasos: ${pasos.map((p, i) => `${i + 1}. ${p}`).join(" ")}`;

  // --- Interfaz ---
  contenedor.hidden = false;
  contenedor.innerHTML = `
    <div class="cocina-cabecera">
      <div>
        <div class="etiqueta">Modo cocina · manos libres</div>
        <h1 class="titulo">${esc(receta.titulo)}</h1>
      </div>
      <div class="fila">
        <button class="btn" data-c="ingredientes">Ingredientes</button>
        <button class="btn" data-c="live" id="c-live" title="Conversación con voz natural de Gemini">Voz natural</button>
        <button class="btn btn-oscuro" data-c="cerrar">Salir</button>
      </div>
    </div>
    <div class="cocina-cuerpo">
      <section class="tarjeta paso-actual" aria-live="polite">
        <div class="paso-numero" id="c-num"></div>
        <div class="paso-texto" id="c-texto"></div>
        <div class="temporizadores" id="c-temps"></div>
      </section>
      <section class="tarjeta conversacion" id="c-conv" aria-live="polite">
        <div class="suave">Di <b>«siguiente»</b>, <b>«anterior»</b>, <b>«repite»</b>, <b>«ingredientes»</b>, <b>«temporizador de 10 minutos»</b> o pregunta lo que quieras: «¿por qué puedo cambiar la nata?»</div>
      </section>
    </div>
    <div class="cocina-controles">
      <button class="btn btn-grande" data-c="anterior">Anterior</button>
      <button class="btn btn-grande" data-c="repetir">Repetir</button>
      <button class="btn btn-grande btn-primario" data-c="siguiente">Siguiente</button>
      <span class="crece" style="flex:1"></span>
      <form id="c-form" class="fila" style="flex:1;min-width:260px">
        <label class="oculto-visual" for="c-pregunta">Escribe una pregunta</label>
        <input id="c-pregunta" class="entrada-texto crece" placeholder="Escribe una pregunta…" autocomplete="off">
      </form>
      <button class="btn mic" data-c="mic" id="c-mic" aria-label="Activar escucha">${ICONO_MIC}</button>
    </div>
    <div class="estado-voz" id="c-estado"></div>`;

  const $ = (id) => contenedor.querySelector("#" + id);
  const estado = (t) => { $("c-estado").textContent = t || ""; };

  function pintarPaso() {
    $("c-num").textContent = `Paso ${c.paso + 1} de ${pasos.length}`;
    $("c-texto").textContent = pasos[c.paso];
  }
  function burbuja(texto, quien) {
    const d = document.createElement("div");
    d.className = "burbuja " + quien;
    d.textContent = texto;
    $("c-conv").appendChild(d);
    $("c-conv").scrollTop = $("c-conv").scrollHeight;
  }

  // --- Voz del sistema (respaldo) ---
  function elegirVoz() {
    const voces = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("es"));
    const puntua = (v) => (v.lang === "es-ES" ? 4 : 0) + (/natural|neural|premium|enhanced|google/i.test(v.name) ? 3 : 0) + (v.localService ? 0 : 1);
    c.voz = voces.sort((a, b) => puntua(b) - puntua(a))[0] || null;
  }
  if ("speechSynthesis" in window) { elegirVoz(); speechSynthesis.onvoiceschanged = elegirVoz; }

  function hablar(texto) {
    return new Promise((ok) => {
      if (!("speechSynthesis" in window) || c.live) return ok();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = "es-ES";
      if (c.voz) u.voice = c.voz;
      u.rate = 1.02;
      u.pitch = 1.05;
      c.hablando = true;
      pararReconocimiento();
      u.onend = u.onerror = () => { c.hablando = false; if (c.escuchando) iniciarReconocimiento(); ok(); };
      speechSynthesis.speak(u);
    });
  }

  // --- Reconocimiento de voz ---
  const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;
  function iniciarReconocimiento() {
    if (!Reconocedor || c.hablando || c.live) return;
    try {
      c.reconocedor = new Reconocedor();
      c.reconocedor.lang = "es-ES";
      c.reconocedor.continuous = true;
      c.reconocedor.interimResults = false;
      c.reconocedor.onresult = (e) => {
        const r = e.results[e.results.length - 1];
        if (r.isFinal) procesar(r[0].transcript.trim());
      };
      c.reconocedor.onend = () => { if (c.escuchando && !c.hablando && !c.live) setTimeout(iniciarReconocimiento, 250); };
      c.reconocedor.onerror = (e) => { if (e.error === "not-allowed") { c.escuchando = false; pintarMic(); estado("Sin permiso para el micrófono."); } };
      c.reconocedor.start();
      estado("Te escucho…");
    } catch { /* ya estaba arrancado */ }
  }
  function pararReconocimiento() {
    try { c.reconocedor?.stop(); } catch { /* nada */ }
    c.reconocedor = null;
  }
  function pintarMic() {
    $("c-mic").classList.toggle("escuchando", c.escuchando);
    $("c-mic").setAttribute("aria-label", c.escuchando ? "Dejar de escuchar" : "Activar escucha");
    if (!c.escuchando) estado("");
  }

  // --- Órdenes ---
  function irA(n) {
    c.paso = Math.max(0, Math.min(pasos.length - 1, n));
    pintarPaso();
    return `Paso ${c.paso + 1}. ${pasos[c.paso]}`;
  }
  function ponerTemporizador(minutos, etiqueta) {
    const t = { fin: Date.now() + minutos * 60000, etiqueta: etiqueta || `${minutos} min` };
    c.temporizadores.push(t);
    pintarTemporizadores();
    return `Vale, temporizador de ${minutos} ${minutos === 1 ? "minuto" : "minutos"} en marcha.`;
  }
  function pintarTemporizadores() {
    const caja = $("c-temps");
    if (!caja) return;
    caja.innerHTML = c.temporizadores.map((t) => {
      const s = Math.max(0, Math.round((t.fin - Date.now()) / 1000));
      return `<span class="temporizador">${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}</span>`;
    }).join("");
  }
  const reloj = setInterval(() => {
    const ahora = Date.now();
    c.temporizadores.filter((t) => t.fin <= ahora).forEach((t) => {
      sonar();
      const msg = `¡Tiempo! Ya han pasado los ${t.etiqueta}.`;
      burbuja(msg, "ia");
      if (c.live) c.live.session.sendTextRealtime?.(`(Aviso del sistema: ha terminado el temporizador de ${t.etiqueta}. Avísale.)`).catch(() => {});
      else hablar(msg);
    });
    c.temporizadores = c.temporizadores.filter((t) => t.fin > ahora);
    pintarTemporizadores();
  }, 1000);

  function minutosEn(texto) {
    const t = texto.toLowerCase();
    if (t.includes("media hora")) return 30;
    if (t.includes("cuarto de hora")) return 15;
    const m = t.match(/(\d+(?:[.,]\d+)?)\s*(minuto|min|segundo|seg|hora)/);
    if (m) {
      const n = parseFloat(m[1].replace(",", "."));
      return m[2].startsWith("seg") ? n / 60 : m[2].startsWith("hora") ? n * 60 : n;
    }
    const w = t.match(/\b(un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|veinticinco|treinta|cuarenta)\s+(minuto|hora)/);
    if (w) return NUMEROS[w[1]] * (w[2] === "hora" ? 60 : 1);
    return null;
  }

  async function procesar(texto) {
    if (!texto) return;
    burbuja(texto, "yo");
    const t = texto.toLowerCase();
    let respuesta = null;
    if (/^(para|calla|silencio|stop)\b/.test(t)) { speechSynthesis.cancel(); return; }
    if (/\b(siguiente|adelante|ya está|listo|hecho)\b/.test(t)) respuesta = irA(c.paso + 1);
    else if (/\b(anterior|atrás|vuelve)\b/.test(t)) respuesta = irA(c.paso - 1);
    else if (/\b(repite|repíte|otra vez|qué paso)\b/.test(t)) respuesta = `Paso ${c.paso + 1}. ${pasos[c.paso]}`;
    else if (/\bingredientes\b/.test(t) && t.split(" ").length < 6) respuesta = "Necesitas: " + (receta.ingredientes || []).map((i) => `${i.cantidad ?? ""} ${i.unidad && i.unidad !== "ud" ? i.unidad + " de" : ""} ${i.nombre}`.replace(/\s+/g, " ").trim()).join(", ") + ".";
    else if (/(temporizador|alarma|avísame|cronómetro)/.test(t)) {
      const min = minutosEn(t);
      respuesta = min ? ponerTemporizador(min) : "¿De cuántos minutos pongo el temporizador?";
    }
    if (!respuesta) {
      estado("Pensando…");
      try {
        const historial = c.historial.slice(-6).map((h) => `${h.quien}: ${h.texto}`).join("\n");
        respuesta = await preguntar(`Estamos en el paso ${c.paso + 1}: "${pasos[c.paso]}".\n${historial ? "Conversación reciente:\n" + historial + "\n" : ""}Pregunta: ${texto}`, sistema);
      } catch (e) {
        console.error(e);
        respuesta = "Uy, no he podido consultar ahora mismo. ¿Lo intentamos otra vez?";
      }
    }
    c.historial.push({ quien: "Cocinero", texto }, { quien: "Ayudante", texto: respuesta });
    burbuja(respuesta, "ia");
    estado(c.escuchando ? "Te escucho…" : "");
    await hablar(respuesta);
  }

  // --- Gemini Live: conversación con voz natural ---
  async function alternarLive() {
    const boton = $("c-live");
    if (c.live) {
      await c.live.control.stop().catch(() => {});
      await c.live.session.close().catch(() => {});
      c.live = null;
      boton.classList.remove("btn-acento");
      boton.textContent = "Voz natural";
      estado("");
      if (c.escuchando) iniciarReconocimiento();
      return;
    }
    try {
      estado("Conectando con Gemini…");
      pararReconocimiento();
      speechSynthesis.cancel();
      const m = getLiveGenerativeModel(ai, {
        model: MODELOS.voz,
        systemInstruction: sistema + "\nUsa las herramientas para cambiar de paso o poner temporizadores cuando te lo pidan, y lee el paso que te devuelvan.",
        generationConfig: {
          responseModalities: [ResponseModality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ_GEMINI } } }
        },
        tools: [{
          functionDeclarations: [
            { name: "siguiente_paso", description: "Avanza al siguiente paso de la receta y devuelve su texto" },
            { name: "paso_anterior", description: "Vuelve al paso anterior y devuelve su texto" },
            { name: "ir_a_paso", description: "Va a un paso concreto (empieza en 1)", parameters: Schema.object({ properties: { numero: Schema.number() } }) },
            { name: "poner_temporizador", description: "Pone un temporizador en minutos", parameters: Schema.object({ properties: { minutos: Schema.number() } }) }
          ]
        }]
      });
      const session = await m.connect();
      const control = await startAudioConversation(session, {
        functionCallingHandler: async (llamadas) => {
          const f = llamadas[0];
          let resultado;
          if (f.name === "siguiente_paso") resultado = irA(c.paso + 1);
          else if (f.name === "paso_anterior") resultado = irA(c.paso - 1);
          else if (f.name === "ir_a_paso") resultado = irA((Number(f.args?.numero) || 1) - 1);
          else if (f.name === "poner_temporizador") resultado = ponerTemporizador(Number(f.args?.minutos) || 1);
          else resultado = "Función desconocida";
          return { id: f.id, name: f.name, response: { resultado } };
        }
      });
      c.live = { session, control };
      boton.classList.add("btn-acento");
      boton.textContent = "Voz natural: activa";
      estado("Conversación natural activa. Habla cuando quieras.");
    } catch (e) {
      console.error(e);
      c.live = null;
      estado("No se pudo activar la voz natural; sigo con la voz del sistema.");
      if (c.escuchando) iniciarReconocimiento();
    }
  }

  // --- Pantalla siempre encendida ---
  async function mantenerEncendida() {
    try { c.wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* no soportado */ }
  }
  const alVolver = () => { if (document.visibilityState === "visible") mantenerEncendida(); };
  document.addEventListener("visibilitychange", alVolver);
  mantenerEncendida();

  // --- Eventos ---
  async function cerrar() {
    clearInterval(reloj);
    c.escuchando = false;
    pararReconocimiento();
    speechSynthesis?.cancel();
    if (c.live) { await c.live.control.stop().catch(() => {}); await c.live.session.close().catch(() => {}); }
    c.wakeLock?.release?.().catch(() => {});
    document.removeEventListener("visibilitychange", alVolver);
    contenedor.removeEventListener("click", alClic);
    contenedor.hidden = true;
    contenedor.innerHTML = "";
    alCerrar?.();
  }
  async function alClic(e) {
    const b = e.target.closest("[data-c]");
    if (!b) return;
    const accion = b.dataset.c;
    if (accion === "cerrar") return cerrar();
    if (accion === "siguiente") return hablar(irA(c.paso + 1));
    if (accion === "anterior") return hablar(irA(c.paso - 1));
    if (accion === "repetir") return hablar(`Paso ${c.paso + 1}. ${pasos[c.paso]}`);
    if (accion === "ingredientes") return procesar("ingredientes");
    if (accion === "live") return alternarLive();
    if (accion === "mic") {
      if (!Reconocedor) { estado("Este navegador no reconoce voz. Usa Chrome en Android o escribe la pregunta."); return; }
      c.escuchando = !c.escuchando;
      pintarMic();
      if (c.escuchando) iniciarReconocimiento(); else pararReconocimiento();
    }
  }
  contenedor.addEventListener("click", alClic);
  $("c-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("c-pregunta").value.trim();
    $("c-pregunta").value = "";
    procesar(v);
  });

  pintarPaso();
  hablar(`¡Vamos con ${receta.titulo}! Paso 1. ${pasos[0]}`);
  return { cerrar };
}

// Pitido corto (temporizadores y avisos)
export function sonar() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
    navigator.vibrate?.([200, 100, 200]);
  } catch { /* sin audio */ }
}
