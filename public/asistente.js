// =========================================================
// KeKoMeMos · asistente.js
// Gemini (Firebase AI Logic), modo cocina manos libres
// y el reto de los menores.
// =========================================================
import {
  getAI, getGenerativeModel, getLiveGenerativeModel, startAudioConversation,
  GoogleAIBackend, ResponseModality, Schema
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-ai.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-functions.js";

// ¿Qué IA usamos?
//  "cloudflare": gratis (Cloudflare Workers AI, a través de la función «ia» de Firebase)
//  "gemini": Gemini de Google (necesita saldo en AI Studio). Permite además buscar en Google y la voz natural.
export const PROVEEDOR = "cloudflare";
export const CON_GEMINI = PROVEEDOR === "gemini";

// Modelos (si Google retira alguno, se cambia solo aquí)
export const MODELOS = {
  texto: "gemini-3.5-flash",
  imagen: "gemini-3.1-flash-image",
  voz: "gemini-3.1-flash-live-preview"
};
// Voces disponibles en Gemini Live: Aoede, Kore, Leda, Zephyr, Puck, Charon…
export const VOZ_GEMINI = "Aoede";

let ai = null;
let iaNube = null;
export function iniciarIA(app) {
  ai = getAI(app, { backend: new GoogleAIBackend() });
  iaNube = httpsCallable(getFunctions(app, "europe-west1"), "ia", { timeout: 125000 });
}
// Saca el primer objeto JSON de un texto (los modelos abiertos a veces añaden explicaciones)
function extraerJSON(t) {
  t = String(t || "").trim().replace(/^```(json)?/i, "").replace(/```$/, "");
  try { return JSON.parse(t); } catch { /* sigue */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error("La IA no devolvió datos válidos");
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
  if (!CON_GEMINI) {
    const r = await iaNube({ tipo: "texto", sistema: sistema || "", prompt: texto });
    return String(r.data.texto || "").trim();
  }
  const r = await modelo(false, sistema).generateContent(texto);
  return r.response.text().trim();
}

async function pedirJSON(partes, sistema) {
  if (!CON_GEMINI) {
    const textos = partes.filter((p) => typeof p === "string");
    const img = partes.find((p) => p?.inlineData)?.inlineData?.data;
    const r = await iaNube({
      tipo: img ? "vision" : "texto", json: true, imagen: img || "",
      sistema: (sistema || "Eres un asistente útil.") + " Responde únicamente con un objeto JSON válido, sin texto adicional.",
      prompt: textos.join("\n\n")
    });
    return extraerJSON(r.data.texto);
  }
  const r = await modelo(true, sistema).generateContent(partes);
  return extraerJSON(r.response.text());
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
 "tipos": [uno o varios de "comida", "cena", "postre", "merienda", "desayuno", "entrante"],
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

// Buscar en Google (a través de Gemini con Búsqueda de Google) páginas de recetas
// Devuelve { enlaces: [{uri, title}], sugerencias: html que Google exige mostrar }
export async function buscarEnInternet(consulta) {
  if (!CON_GEMINI) throw new Error("La búsqueda en Google necesita Gemini (PROVEEDOR = \"gemini\")");
  const m = getGenerativeModel(ai, { model: MODELOS.texto, tools: [{ googleSearch: {} }] });
  const r = await m.generateContent(`Busca en Google recetas de "${consulta}" en webs de cocina en español (blogs y webs de recetas conocidas). Responde con una lista breve de las recetas encontradas.`);
  const meta = r.response.candidates?.[0]?.groundingMetadata || {};
  const enlaces = (meta.groundingChunks || []).map((c) => c.web).filter((w) => w?.uri);
  const vistos = new Set();
  return {
    enlaces: enlaces.filter((w) => { const k = w.title || w.uri; if (vistos.has(k)) return false; vistos.add(k); return true; }).slice(0, 8),
    sugerencias: meta.searchEntryPoint?.renderedContent || ""
  };
}

// Prueba rápida de que la IA responde (para diagnosticar)
export async function probarGemini() {
  const t0 = Date.now();
  const r = await preguntar("Responde solo con: ¡Hola desde KeKoMeMos!");
  return `${r} (${Date.now() - t0} ms)`;
}

// Foto del plato generada por Gemini → Blob
export async function generarFotoPlato(titulo, ingredientes = []) {
  const lista0 = ingredientes.slice(0, 8).map((i) => i.nombre).join(", ");
  if (!CON_GEMINI) {
    const prompt = `Professional realistic food photography of the Spanish home-cooked dish "${titulo}"${lista0 ? ` (made with ${lista0})` : ""}, served on a plate on a family kitchen table, natural window light, 45 degree angle, appetizing, no text, no people.`;
    const r = await iaNube({ tipo: "imagen", prompt });
    const bin = atob(r.data.imagen);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: "image/jpeg" });
  }
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
// ---------- Banco de retos «premium» (revisados a mano: respuesta única y explicación) ----------
// Inspirados en: pensamiento lateral (Paul Sloane), lógica de Raymond Smullyan y Lewis Carroll,
// los puzles del Profesor Layton, test tipo Mensa, adivinanzas populares españolas y emojis de cocina.
const R = (id, categoria, pregunta, correcta, malas, pista, explicacion) => ({ id, categoria, pregunta, correcta, opciones: [correcta, ...malas], pista, explicacion });
export const BANCO_RETOS = [
  R("monopoly", "Pensamiento lateral", "Un hombre empuja su coche hasta un hotel y en ese momento sabe que está arruinado. ¿Qué está pasando?", "Está jugando al Monopoly", ["Se le ha averiado el coche", "Le han robado la cartera", "El hotel está cerrado"], "No hace falta salir de casa para que ocurra.", "En el Monopoly, si caes en una casilla con hotel tienes que pagar… y a veces te arruinas."),
  R("foto", "Pensamiento lateral", "Una mujer dispara a su marido, lo mete bajo el agua cinco minutos y luego lo cuelga. Media hora después cenan juntos tan felices. ¿Cómo es posible?", "Le hizo una foto y la reveló", ["Era una pistola de agua", "Todo era un sueño", "Estaban rodando una película"], "Piensa en cámaras antiguas.", "Disparar una foto, revelarla en agua y colgarla a secar: así se hacían las fotos antes."),
  R("silencio", "Adivinanza", "¿Qué se rompe con solo nombrarlo?", "El silencio", ["Un secreto", "Un cristal", "Una promesa"], "Ahora mismo lo estás oyendo… o no.", "En cuanto dices «silencio», ya no hay silencio."),
  R("tren", "Pregunta trampa", "Un tren eléctrico viaja hacia el norte y el viento sopla hacia el sur. ¿Hacia dónde va el humo?", "No echa humo", ["Hacia el sur", "Hacia el norte", "Hacia arriba"], "Fíjate bien en qué tipo de tren es.", "Los trenes eléctricos no echan humo."),
  R("maria", "Pregunta trampa", "El padre de María tiene cinco hijas: Nana, Nene, Nini y Nono. ¿Cómo se llama la quinta?", "María", ["Nunu", "Nina", "Nena"], "Vuelve a leer el principio.", "Es el padre de María, así que la quinta hija es… María."),
  R("ovejas", "Pregunta trampa", "Un granjero tiene 17 ovejas. Se le mueren todas menos 9. ¿Cuántas le quedan?", "9", ["8", "17", "0"], "«Todas menos…»", "Si mueren todas menos 9, quedan exactamente 9."),
  R("meses", "Pregunta trampa", "¿Cuántos meses del año tienen 28 días?", "Los 12", ["Solo febrero", "Dos", "Ninguno"], "No pregunta cuántos tienen SOLO 28.", "Todos los meses tienen, como mínimo, 28 días."),
  R("croquetas", "Lógica", "Si 5 máquinas tardan 5 minutos en hacer 5 croquetas, ¿cuánto tardan 100 máquinas en hacer 100 croquetas?", "5 minutos", ["100 minutos", "20 minutos", "1 minuto"], "¿Cuánto tarda UNA máquina en hacer UNA croqueta?", "Cada máquina hace una croqueta en 5 minutos, así que 100 máquinas hacen 100 croquetas en 5 minutos."),
  R("calcetines", "Lógica", "A oscuras, en un cajón con calcetines negros y blancos mezclados, ¿cuántos tienes que sacar como mínimo para tener seguro un par del mismo color?", "3", ["2", "4", "5"], "Solo hay dos colores.", "Con 3 calcetines y solo 2 colores, al menos dos coinciden seguro."),
  R("bolas", "Lógica (Layton)", "Tienes 8 bolas iguales, pero una pesa un poco más. Con una balanza de dos platos, ¿cuántas pesadas necesitas como mínimo para encontrarla seguro?", "2", ["3", "1", "4"], "Prueba a dividir en grupos de 3.", "Pesas 3 contra 3: si equilibran, está entre las 2 restantes; si no, entre las 3 del lado pesado. Una segunda pesada basta."),
  R("tarta", "Lógica (Layton)", "Con solo 3 cortes rectos de cuchillo, ¿cuántos trozos como máximo puedes sacar de una tarta?", "8", ["6", "7", "9"], "Nadie dijo que todos los cortes fueran desde arriba.", "Dos cortes en cruz dan 4 trozos y un tercer corte horizontal, por la mitad de la altura, los convierte en 8."),
  R("reloj", "Lógica (Mensa)", "A las 3:15, ¿qué ángulo forman las agujas del reloj?", "7,5 grados", ["0 grados", "15 grados", "90 grados"], "La aguja de las horas también se mueve.", "En 15 minutos la aguja corta avanza un cuarto de hora: 30° ÷ 4 = 7,5°."),
  R("ayer", "Lógica (Lewis Carroll)", "Si ayer fuera mañana, hoy sería viernes. ¿Qué día es hoy?", "Domingo", ["Miércoles", "Sábado", "Jueves"], "Cuenta los días hacia atrás desde ese viernes.", "Si ayer (sábado) fuera mañana, «hoy» sería el día anterior a ese sábado: viernes. Así que hoy es domingo."),
  R("alturas", "Lógica", "Juan es más alto que Luis. Pedro es más bajo que Luis. ¿Quién es el más alto?", "Juan", ["Luis", "Pedro", "No se puede saber"], "Ordénalos de mayor a menor.", "Juan > Luis > Pedro."),
  R("isla", "Lógica (Smullyan)", "En una isla, los caballeros siempre dicen la verdad y los escuderos siempre mienten. Ana dice: «Bea y yo somos escuderos». ¿Qué es cada una?", "Ana escudero, Bea caballero", ["Las dos escuderos", "Las dos caballeros", "Ana caballero, Bea escudero"], "¿Podría un caballero decir esa frase?", "Un caballero nunca diría que es escudero, así que Ana miente. Como miente, no son las dos escuderos: Bea es caballero."),
  R("edades", "Lógica", "Hoy tengo el triple de años que mi hermano. Dentro de 10 años tendré el doble. ¿Cuántos años tengo?", "30", ["20", "15", "24"], "Prueba con tu hermano a los 10.", "Hermano 10 y yo 30. En 10 años: 20 y 40, el doble."),
  R("letras", "Secuencia (Mensa)", "¿Qué letra sigue? U, D, T, C, C, S, S, …", "O", ["N", "D", "S"], "Cuenta en voz alta.", "Son las iniciales de uno, dos, tres, cuatro, cinco, seis, siete… ¡ocho!"),
  R("fibonacci", "Secuencia (Mensa)", "¿Qué número sigue? 1, 1, 2, 3, 5, 8, 13, …", "21", ["18", "20", "26"], "Mira los dos anteriores.", "Cada número es la suma de los dos anteriores: 8 + 13 = 21 (sucesión de Fibonacci)."),
  R("pronicos", "Secuencia (Mensa)", "¿Qué número sigue? 2, 6, 12, 20, 30, …", "42", ["40", "36", "44"], "Mira cuánto aumenta cada vez.", "Suma 4, 6, 8, 10… y luego 12: 30 + 12 = 42."),
  R("pera", "Adivinanza popular", "Blanca por dentro, verde por fuera. Si quieres que te lo diga, espera.", "La pera", ["El melón", "El kiwi", "La sandía"], "Lee despacio la última frase.", "«Espera» suena a «es pera»."),
  R("platano", "Adivinanza popular", "Oro parece, plata no es. Quien no lo adivine, bien tonto es.", "El plátano", ["El limón", "La naranja", "El oro"], "Junta dos palabras de la adivinanza.", "«Plata no es» → plá-ta-no."),
  R("ajo", "Adivinanza popular", "Tiene dientes y no come, tiene cabeza y no es hombre.", "El ajo", ["El peine", "El tenedor", "La cebolla"], "Está en muchas recetas de casa.", "Una cabeza de ajos tiene dientes de ajo."),
  R("reloj-agujas", "Adivinanza", "Tengo agujas pero no pincho, tengo números pero no sumo. ¿Qué soy?", "Un reloj", ["Un pino", "Un erizo", "Una calculadora"], "Lo miras para no llegar tarde a comer.", "Las agujas del reloj marcan los números de las horas."),
  R("emoji-tortilla", "Emoji-plato", "🥔 + 🥚 + 🧅 + 🍳 = ?", "Tortilla de patatas", ["Huevos rotos", "Patatas bravas", "Ensaladilla rusa"], "Lleva cebolla… o no, según a quién preguntes.", "Patata, huevo y cebolla en la sartén: tortilla de patatas."),
  R("emoji-paella", "Emoji-plato", "🍚 + 🦐 + 🍋 + 🥘 = ?", "Paella", ["Risotto", "Arroz con leche", "Sushi"], "Se hace en un recipiente que se llama igual que el plato.", "Arroz, gambas y limón en paellera: paella."),
  R("emoji-gazpacho", "Emoji-plato", "🍅 + 🥒 + 🫑 + 🧄 + 🧊 = ?", "Gazpacho", ["Pisto", "Salmorejo", "Ensalada"], "Se toma frío y en verano.", "Tomate, pepino, pimiento y ajo, bien frío: gazpacho."),
  R("emoji-carbonara", "Emoji-plato", "🍝 + 🥓 + 🥚 + 🧀 = ?", "Espaguetis a la carbonara", ["Lasaña", "Macarrones con tomate", "Pizza"], "Viene de Roma.", "Pasta, panceta, huevo y queso: carbonara."),
  R("emoji-arroz", "Emoji-plato", "🥛 + 🍚 + 🍋 + canela = ?", "Arroz con leche", ["Natillas", "Flan", "Torrijas"], "Es de postre.", "Leche, arroz, piel de limón y canela: arroz con leche."),
  R("baya", "¿Verdad o bulo?", "Para un botánico, ¿cuál de estas frutas es una baya?", "El plátano", ["La fresa", "La frambuesa", "La cereza"], "Sorprendentemente, la que menos lo parece.", "El plátano es una baya; la fresa y la frambuesa no lo son, y la cereza es una drupa."),
  R("tomate", "¿Verdad o bulo?", "¿De dónde es originario el tomate?", "De América", ["De Italia", "De España", "De la India"], "Llegó a Europa en barco hace unos 500 años.", "El tomate viene de América (México y Perú) y llegó a Europa en el siglo XVI."),
  R("aceite", "¿Verdad o bulo?", "¿Qué pesa más: un litro de aceite o un litro de agua?", "El litro de agua", ["El litro de aceite", "Pesan igual", "Depende de la temperatura"], "Piensa en qué flota sobre qué.", "El aceite es menos denso que el agua, por eso flota y un litro pesa menos (unos 920 g)."),
  R("huevo", "Pregunta trampa", "¿Cuántos huevos puedes comerte con el estómago vacío?", "Uno", ["Ninguno", "Tres", "Los que quieras"], "Después del primero…", "Después del primero ya no tienes el estómago vacío.")
];

function retoDelBanco() {
  let vistos = [];
  try { vistos = JSON.parse(localStorage.getItem("retosVistos") || "[]"); } catch { /* nada */ }
  let libres = BANCO_RETOS.filter((r) => !vistos.includes(r.id));
  if (!libres.length) { vistos = []; libres = BANCO_RETOS; }
  const r = libres[Math.floor(Math.random() * libres.length)];
  try { localStorage.setItem("retosVistos", JSON.stringify([...vistos, r.id])); } catch { /* nada */ }
  return { ...r, opciones: barajar([...r.opciones]) };
}

const ESTILOS_IA = [
  ["Pensamiento lateral", "Situación misteriosa con una explicación ingeniosa, como «Un hombre empuja su coche hasta un hotel y sabe que está arruinado» → «Está jugando al Monopoly»."],
  ["Lógica (Layton)", "Puzle de razonamiento con números pequeños, balanzas, cortes o recorridos, como «¿Cuántas pesadas necesitas para encontrar la bola más pesada entre 8?» → «2»."],
  ["Emoji-plato", "Un plato o postre conocido expresado con 3–5 emojis, como «🍚 + 🦐 + 🍋 + 🥘» → «Paella». Las opciones incorrectas deben ser platos parecidos."],
  ["Adivinanza", "Adivinanza en verso, con juego de palabras, al estilo de las adivinanzas populares españolas."],
  ["¿Verdad o bulo?", "Dato curioso y verificable sobre comida o cocina, con respuestas sorprendentes pero ciertas."],
  ["Pregunta trampa", "Pregunta breve que parece fácil pero tiene truco, como «¿Cuántos meses tienen 28 días?» → «Los 12»."]
];

export async function generarAcertijo(edad = 16) {
  if (Math.random() < 0.6) return retoDelBanco();
  try {
    const [categoria, guia] = ESTILOS_IA[Math.floor(Math.random() * ESTILOS_IA.length)];
    const r = await pedirJSON([`Crea UN reto nuevo y original de tipo «${categoria}» en castellano de España para alguien de ${edad} años.
${guia}
Requisitos: divertido, ingenioso, resoluble en menos de un minuto, con UNA única respuesta correcta indiscutible y 3 opciones incorrectas plausibles (máximo 6 palabras cada una). No uses retos muy conocidos de los ejemplos.
Comprueba tú mismo que la respuesta es correcta antes de responder.
Devuelve JSON: {"pregunta": string, "opciones": [4 strings], "correcta": string idéntica a una opción, "pista": string corta que ayude sin desvelar, "explicacion": string corta}`],
      "Eres KeKoMeMos, un creador de acertijos premium (estilo Profesor Layton, Paul Sloane y Mensa) para adolescentes que quieren descubrir el menú del día.");
    if (!r?.pregunta || !Array.isArray(r.opciones) || r.opciones.length < 3 || !r.opciones.includes(r.correcta)) throw new Error("acertijo mal formado");
    // Comprobación a ciegas: la IA resuelve el reto sin ver la respuesta; si no coincide, se descarta
    const sol = await pedirJSON([`Resuelve este reto con cuidado, razonando paso a paso por dentro.
Reto: ${r.pregunta}
Opciones: ${r.opciones.map((o, i) => `${i + 1}) ${o}`).join("  ")}
Devuelve JSON: {"respuesta": "el texto exacto de la opción correcta", "segura": true|false}`], "Eres un experto en acertijos, lógica y cultura general. Eres riguroso.");
    const limpio = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    if (!sol?.segura || limpio(sol.respuesta) !== limpio(r.correcta)) throw new Error("reto dudoso descartado");
    return { categoria, pregunta: r.pregunta, opciones: barajar([...r.opciones]), correcta: r.correcta, pista: r.pista || "", explicacion: r.explicacion || "", ia: true };
  } catch (e) {
    console.warn("Reto del banco:", e);
    return retoDelBanco();
  }
}

// Ideas para el cocinero indeciso
export async function ideasCocina({ tipo, hayEnCasa = [], recientes = [], conocidas = [] }) {
  const mes = new Date().toLocaleDateString("es-ES", { month: "long" });
  const r = await pedirJSON([`Propón 4 ideas de ${tipo === "cena" ? "cena" : "comida"} para hoy (${mes}) para una familia española de 5 (2 adultos y 3 adolescentes).
Ingredientes que ya hay en casa: ${hayEnCasa.slice(0, 40).join(", ") || "(desconocido)"}.
Platos de los últimos días (no los repitas): ${recientes.join(", ") || "(ninguno)"}.
Recetas que ya conocen (puedes proponer variaciones, no las mismas): ${conocidas.slice(0, 40).join(", ") || "(ninguna)"}.
Mezcla: una aprovechando lo que hay en casa, una rápida (menos de 30 minutos), una de temporada y una diferente para sorprender. ${tipo === "cena" ? "Que sean cenas más ligeras." : ""}
Devuelve JSON: {"ideas": [{"titulo": string, "descripcion": string de una frase apetecible, "minutos": number, "motivo": "aprovecha lo de casa" | "rápida" | "de temporada" | "para sorprender"}]}`],
    "Eres KeKoMeMos, un cocinero casero español práctico y con buen gusto.");
  return (r.ideas || []).filter((i) => i?.titulo).slice(0, 4);
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
        ${CON_GEMINI ? `<button class="btn" data-c="live" id="c-live" title="Conversación con voz natural de Gemini">Voz natural</button>` : ""}
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
