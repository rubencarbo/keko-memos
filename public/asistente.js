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
// ---------- Banco de retos (revisados a mano: divertidos, rápidos y con una sola respuesta) ----------
// Tipos: "opciones" (elige la buena), "parejas" (une cada cosa con su pareja) y "orden" (toca en el orden correcto)
const O = (id, categoria, pregunta, correcta, malas, pista, explicacion) => ({ tipo: "opciones", id, categoria, pregunta, correcta, opciones: [correcta, ...malas], pista, explicacion });
const P = (id, pregunta, pares, explicacion = "") => ({ tipo: "parejas", id, categoria: "Parejas", pregunta, pares: pares.map(([a, b]) => ({ a, b })), pista: "Empieza por la que tengas más clara.", explicacion });
const OR = (id, categoria, pregunta, elementos, pista, explicacion = "") => ({ tipo: "orden", id, categoria, pregunta, elementos, pista, explicacion });

export const BANCO_RETOS = [
  // Adivinanzas y preguntas con chispa
  O("peine", "Adivinanza", "Tengo dientes pero nunca muerdo. ¿Qué soy?", "Un peine", ["Un tiburón", "Un cocodrilo", "Tu hermano"], "Lo usas por la mañana… en el pelo.", "El peine tiene muchos dientes y no muerde a nadie."),
  O("toalla", "Adivinanza", "¿Qué se moja mientras seca?", "Una toalla", ["Un paraguas", "El sol", "Una esponja"], "Está en el baño.", "La toalla te seca a ti… y se moja ella."),
  O("agujero", "Adivinanza", "¿Qué cosa, cuanto más le quitas, más grande se hace?", "Un agujero", ["Una tarta", "Un globo", "Una pizza"], "Piensa en una pala y la arena.", "Cuanta más tierra sacas, más grande es el agujero."),
  O("escalera", "Adivinanza", "¿Qué sube y baja, pero nunca se mueve?", "Una escalera", ["Un ascensor", "Un yoyó", "Una pelota"], "Está en casi todos los edificios.", "La escalera sube y baja… quieta en su sitio."),
  O("letra-m", "Adivinanza", "Aparezco una vez en un minuto, dos veces en un momento y nunca en cien años. ¿Qué soy?", "La letra M", ["Un segundo", "Un reloj", "Una estrella fugaz"], "Fíjate en cómo se escriben las palabras.", "«Minuto» tiene una M, «momento» dos y «cien años» ninguna."),
  O("nombre", "Adivinanza", "Es tuyo, pero los demás lo usan mucho más que tú. ¿Qué es?", "Tu nombre", ["Tu móvil", "Tu cama", "Tu mochila"], "Te llaman con él.", "Los demás dicen tu nombre mucho más que tú."),
  O("peras", "Adivinanza popular", "Blanca por dentro, verde por fuera. Si quieres que te lo diga, espera.", "La pera", ["El melón", "El kiwi", "La sandía"], "Lee despacio la última frase.", "«Espera» suena a «es pera»."),
  O("platano", "Adivinanza popular", "Oro parece, plata no es. Quien no lo adivine, bien tonto es.", "El plátano", ["El limón", "La naranja", "El oro"], "Junta dos palabras de la adivinanza.", "«Plata no es» → plá-ta-no."),
  O("ajo", "Adivinanza popular", "Tiene dientes y no come, tiene cabeza y no es hombre.", "El ajo", ["El peine", "El tenedor", "La cebolla"], "Está en muchas recetas de casa.", "Una cabeza de ajos tiene dientes de ajo."),
  // Preguntas trampa
  O("gallo", "Pregunta trampa", "Un gallo pone un huevo en lo alto de un tejado. ¿Hacia qué lado cae?", "Los gallos no ponen huevos", ["Hacia la izquierda", "Hacia la derecha", "Se queda arriba"], "¿Quién pone los huevos en un corral?", "Los huevos los ponen las gallinas, no los gallos."),
  O("kilo", "Pregunta trampa", "¿Qué pesa más: un kilo de patatas o un kilo de plumas?", "Pesan lo mismo", ["Las patatas", "Las plumas", "Depende del viento"], "Mira bien las palabras.", "Un kilo es un kilo, sea de lo que sea."),
  O("huevo", "Pregunta trampa", "¿Cuántos huevos puedes comerte con el estómago vacío?", "Uno", ["Ninguno", "Tres", "Los que quieras"], "Después del primero…", "Después del primero ya no tienes el estómago vacío."),
  O("maria", "Pregunta trampa", "El padre de María tiene cinco hijas: Nana, Nene, Nini y Nono. ¿Cómo se llama la quinta?", "María", ["Nunu", "Nina", "Nena"], "Vuelve a leer el principio.", "Es el padre de María, así que la quinta es María."),
  O("meses", "Pregunta trampa", "¿Cuántos meses del año tienen 28 días?", "Los 12", ["Solo febrero", "Dos", "Ninguno"], "No dice «solo 28».", "Todos los meses tienen, como mínimo, 28 días."),
  O("ovejas", "Pregunta trampa", "Un granjero tiene 17 ovejas. Se le escapan todas menos 9. ¿Cuántas le quedan?", "9", ["8", "17", "0"], "«Todas menos…»", "Si se escapan todas menos 9, le quedan 9."),
  O("escalon", "Pensamiento lateral", "Un hombre se cae de una escalera de 10 metros y no se hace ni un rasguño. ¿Cómo?", "Se cayó del primer escalón", ["Llevaba casco", "Cayó en una piscina", "Es un superhéroe"], "¿Desde qué altura se cayó?", "La escalera medía 10 metros… pero él estaba en el primer escalón."),
  O("croquetas", "Lógica", "Si 5 cocineros hacen 5 tortillas en 5 minutos, ¿cuánto tardan 10 cocineros en hacer 10 tortillas?", "5 minutos", ["10 minutos", "20 minutos", "1 minuto"], "Cada cocinero hace su tortilla.", "Cada uno tarda 5 minutos en hacer la suya, da igual cuántos sean."),
  // El intruso
  O("intruso-legumbres", "El intruso", "¿Cuál es el intruso? Lentejas · Garbanzos · Alubias · Plátano", "Plátano", ["Lentejas", "Garbanzos", "Alubias"], "Tres de ellos van en el cocido…", "Lentejas, garbanzos y alubias son legumbres; el plátano es una fruta."),
  O("intruso-frutas", "El intruso", "¿Cuál es el intruso? Manzana · Pera · Zanahoria · Melocotón", "Zanahoria", ["Manzana", "Pera", "Melocotón"], "Uno crece bajo tierra.", "La zanahoria es una hortaliza; las demás son frutas."),
  O("intruso-cubiertos", "El intruso", "¿Cuál es el intruso? Tenedor · Cuchara · Cuchillo · Sartén", "Sartén", ["Tenedor", "Cuchara", "Cuchillo"], "Tres se ponen en la mesa.", "Tenedor, cuchara y cuchillo son cubiertos; la sartén es para cocinar."),
  // Emojis
  O("emoji-tortilla", "Emoji-plato", "🥔 + 🥚 + 🧅 + 🍳 = ?", "Tortilla de patatas", ["Huevos rotos", "Patatas bravas", "Ensaladilla rusa"], "Redonda y se le da la vuelta con un plato.", "Patata, huevo y cebolla en la sartén: tortilla."),
  O("emoji-paella", "Emoji-plato", "🍚 + 🦐 + 🍋 + 🥘 = ?", "Paella", ["Risotto", "Arroz con leche", "Sushi"], "Se llama igual que el recipiente.", "Arroz, gambas y limón en paellera: paella."),
  O("emoji-gazpacho", "Emoji-plato", "🍅 + 🥒 + 🫑 + 🧄 + 🧊 = ?", "Gazpacho", ["Pisto", "Ensalada", "Sopa de cebolla"], "Se toma frío en verano.", "Tomate, pepino, pimiento y ajo bien frío: gazpacho."),
  O("emoji-carbonara", "Emoji-plato", "🍝 + 🥓 + 🥚 + 🧀 = ?", "Espaguetis a la carbonara", ["Lasaña", "Macarrones con tomate", "Pizza"], "Viene de Roma.", "Pasta, panceta, huevo y queso: carbonara."),
  O("emoji-hawaiana", "Emoji-plato", "🍕 + 🍍 + 🥓 = ?", "Pizza hawaiana", ["Pizza margarita", "Macedonia", "Piña colada"], "La pizza más polémica del mundo.", "Pizza con piña y jamón: hawaiana."),
  O("emoji-tacos", "Emoji-plato", "🌮 + 🥑 + 🌶️ = ?", "Comida mexicana", ["Comida japonesa", "Comida italiana", "Comida china"], "¡Ándale!", "Tacos, aguacate y chile: México."),
  // ¿Verdad o bulo?
  O("baya", "¿Verdad o bulo?", "¿Cuál de estas frutas es, para un botánico, una baya?", "El plátano", ["La fresa", "La frambuesa", "La cereza"], "La que menos lo parece.", "El plátano es una baya; la fresa y la frambuesa no lo son."),
  O("tomate", "¿Verdad o bulo?", "¿De dónde viene el tomate?", "De América", ["De Italia", "De España", "De la India"], "Llegó a Europa en barco hace 500 años.", "El tomate viene de América y llegó a Europa en el siglo XVI."),
  O("aceite", "¿Verdad o bulo?", "¿Qué pesa más: un litro de aceite o un litro de agua?", "El litro de agua", ["El litro de aceite", "Pesan igual", "Depende del día"], "¿Qué flota sobre qué?", "El aceite es más ligero que el agua: por eso flota."),
  O("letras", "Secuencia", "¿Qué letra sigue? U, D, T, C, C, S, S, …", "O", ["N", "D", "S"], "Cuenta en voz alta.", "Uno, dos, tres, cuatro, cinco, seis, siete… ¡ocho!"),
  O("triangulares", "Secuencia", "¿Qué número sigue? 1, 3, 6, 10, …", "15", ["12", "14", "16"], "Mira cuánto sube cada vez.", "Suma 2, luego 3, luego 4… y ahora 5: 10 + 5 = 15."),

  // Parejas
  P("paises", "Une cada plato con su país", [["Pizza", "Italia"], ["Sushi", "Japón"], ["Tacos", "México"], ["Paella", "España"]]),
  P("animales", "Une cada animal con lo que nos da", [["Vaca", "Leche"], ["Gallina", "Huevos"], ["Abeja", "Miel"], ["Oveja", "Lana"]]),
  P("utensilios", "Une cada utensilio con para qué sirve", [["Rallador", "Rallar queso"], ["Colador", "Escurrir pasta"], ["Batidora", "Triturar"], ["Sacacorchos", "Abrir botellas"]]),
  P("colores", "Une cada fruta con su color", [["Plátano", "Amarillo"], ["Fresa", "Rojo"], ["Kiwi", "Verde"], ["Arándano", "Azul"]]),
  P("emojis", "Une cada emoji con su palabra", [["🧀", "Queso"], ["🥕", "Zanahoria"], ["🍯", "Miel"], ["🍄", "Champiñón"]]),
  P("ingredientes", "Une cada ingrediente principal con su plato", [["Arroz", "Paella"], ["Patata", "Tortilla"], ["Garbanzos", "Cocido"], ["Pan duro", "Torrijas"]]),
  P("dobles", "Une cada número con su doble", [["6", "12"], ["9", "18"], ["15", "30"], ["25", "50"]]),
  P("contrarios", "Une cada palabra con su contrario", [["Frío", "Caliente"], ["Dulce", "Salado"], ["Crudo", "Cocinado"], ["Lleno", "Vacío"]]),

  // Ordenar
  OR("tortilla", "Ordena", "Ordena los pasos para hacer una tortilla", ["Pelar las patatas", "Freír las patatas", "Batir los huevos", "Mezclar y cuajar"], "¿Qué haces antes de freír?"),
  OR("tamanos", "Ordena", "Ordena de más pequeño a más grande", ["Hormiga", "Ratón", "Perro", "Elefante"], "Empieza por el que cabe en tu mano… y sobra sitio."),
  OR("pera", "Palabra secreta", "Toca las letras en orden para formar una fruta", ["P", "E", "R", "A"], "Verde por fuera, blanca por dentro."),
  OR("limon", "Palabra secreta", "Toca las letras en orden para formar una fruta muy ácida", ["L", "I", "M", "Ó", "N"], "Amarillo y te hace poner caras raras."),
  OR("pasta", "Palabra secreta", "Toca las letras en orden para formar algo que se come con tenedor", ["P", "A", "S", "T", "A"], "Italia la adora."),
  OR("menu", "Ordena", "Ordena un menú de restaurante", ["Entrante", "Primer plato", "Segundo plato", "Postre"], "El postre siempre al final."),
  OR("comidas", "Ordena", "Ordena las comidas del día", ["Desayuno", "Comida", "Merienda", "Cena"], "Empieza al despertarte."),
  OR("fracciones", "Ordena", "Ordena de menor a mayor cantidad de tarta", ["Un cuarto", "Media", "Tres cuartos", "Entera"], "La entera es la que más llena.")
];

function preparar(r) {
  const x = JSON.parse(JSON.stringify(r));
  if (x.tipo === "opciones") x.opciones = barajar([...x.opciones]);
  if (x.tipo === "parejas") { x.izquierda = barajar(x.pares.map((p) => p.a)); x.derecha = barajar(x.pares.map((p) => p.b)); }
  if (x.tipo === "orden") {
    let m = barajar([...x.elementos]);
    for (let i = 0; i < 5 && m.join("|") === x.elementos.join("|"); i++) m = barajar([...x.elementos]);
    x.mezclados = m;
  }
  return x;
}
function retoDelBanco(tipo) {
  let vistos = [];
  try { vistos = JSON.parse(localStorage.getItem("retosVistos") || "[]"); } catch { /* nada */ }
  const delTipo = BANCO_RETOS.filter((r) => !tipo || r.tipo === tipo);
  let libres = delTipo.filter((r) => !vistos.includes(r.id));
  if (!libres.length) { vistos = vistos.filter((v) => !delTipo.some((r) => r.id === v)); libres = delTipo; }
  const r = libres[Math.floor(Math.random() * libres.length)];
  try { localStorage.setItem("retosVistos", JSON.stringify([...vistos, r.id])); } catch { /* nada */ }
  return preparar(r);
}

const ESTILOS_IA = [
  ["Adivinanza", "Adivinanza corta y graciosa con juego de palabras, como «Tengo dientes pero nunca muerdo» → «Un peine»."],
  ["Pregunta trampa", "Pregunta muy corta con truco divertido, como «Un gallo pone un huevo en un tejado, ¿hacia dónde cae?» → «Los gallos no ponen huevos»."],
  ["El intruso", "Cuatro cosas de cocina o comida donde una no encaja, como «Lentejas · Garbanzos · Alubias · Plátano» → «Plátano»."],
  ["Emoji-plato", "Un plato conocido con 3–4 emojis, como «🍕 + 🍍 + 🥓» → «Pizza hawaiana»."]
];

export async function generarAcertijo(edad = 16) {
  const x = Math.random();
  if (x < 0.22) return retoDelBanco("parejas");
  if (x < 0.44) return retoDelBanco("orden");
  if (x < 0.82) return retoDelBanco("opciones");
  try {
    const [categoria, guia] = ESTILOS_IA[Math.floor(Math.random() * ESTILOS_IA.length)];
    const r = await pedirJSON([`Crea UN reto nuevo de tipo «${categoria}» en castellano de España para alguien de ${edad} años.
${guia}
Requisitos: muy divertido y con humor, FÁCIL de resolver en menos de 30 segundos, con UNA única respuesta correcta indiscutible y 3 opciones incorrectas graciosas pero claramente erróneas (máximo 5 palabras cada una). No copies los ejemplos.
Devuelve JSON: {"pregunta": string, "opciones": [4 strings], "correcta": string idéntica a una opción, "pista": string corta, "explicacion": string corta y simpática}`],
      "Eres KeKoMeMos, un creador de retos divertidos y sencillos para adolescentes que quieren descubrir el menú del día.");
    if (!r?.pregunta || !Array.isArray(r.opciones) || r.opciones.length < 3 || !r.opciones.includes(r.correcta)) throw new Error("acertijo mal formado");
    // Comprobación a ciegas: la IA resuelve el reto sin ver la respuesta; si no coincide, se descarta
    const sol = await pedirJSON([`Resuelve este reto con cuidado.
Reto: ${r.pregunta}
Opciones: ${r.opciones.map((o, i) => `${i + 1}) ${o}`).join("  ")}
Devuelve JSON: {"respuesta": "el texto exacto de la opción correcta", "segura": true|false}`], "Eres un experto en acertijos. Eres riguroso.");
    const limpio = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
    if (!sol?.segura || limpio(sol.respuesta) !== limpio(r.correcta)) throw new Error("reto dudoso descartado");
    return preparar({ tipo: "opciones", categoria, pregunta: r.pregunta, opciones: r.opciones, correcta: r.correcta, pista: r.pista || "", explicacion: r.explicacion || "", ia: true });
  } catch (e) {
    console.warn("Reto del banco:", e);
    return retoDelBanco("opciones");
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
