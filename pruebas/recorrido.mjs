// Recorrido de la app con un navegador real, contra los emuladores (local)
// o contra la web publicada (URL=https://keko-memos.web.app, solo pantallas sin sesión).
import { chromium } from "playwright";
import { mkdirSync, appendFileSync } from "node:fs";

const URL = process.env.URL || "http://127.0.0.1:5000";
const EN_VIVO = !URL.includes("127.0.0.1") && !URL.includes("localhost");
const DIR = process.env.SALIDA || "informe";
mkdirSync(`${DIR}/capturas`, { recursive: true });

const resultados = [];
const erroresPagina = [];
let n = 0;
const nota = (ok, texto) => { resultados.push(`${ok ? "✅" : "❌"} ${texto}`); console.log(ok ? "OK " : "FALLO ", texto); };
async function paso(texto, fn) {
  try { await fn(); nota(true, texto); } catch (e) { nota(false, `${texto} — ${String(e.message).split("\n")[0]}`); }
}
const captura = (page, nombre) => page.screenshot({ path: `${DIR}/capturas/${String(++n).padStart(2, "0")}-${nombre}.png` });

function vigilar(page, quien) {
  page.on("pageerror", (e) => erroresPagina.push(`[${quien}] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") erroresPagina.push(`[${quien}] consola: ${m.text().slice(0, 300)}`); });
}

// Responde hasta acertar (cada fallo genera un reto nuevo) y espera a que se revele el menú
async function resolverReto(p, nombre, foto) {
  await p.locator(".reto-opciones").waitFor({ timeout: 30000 });
  if (foto) await captura(p, foto);
  for (let i = 0; i < 20; i++) {
    if (await p.getByText(`¡Bien, ${nombre}!`).count()) return;
    const op = p.locator(".reto-opciones button:not([disabled])").first();
    if (await op.count()) await op.click().catch(() => {});
    await p.waitForTimeout(1400);
  }
  await p.getByText(`¡Bien, ${nombre}!`).waitFor({ timeout: 5000 });
}

const navegador = await chromium.launch();

// ---------- ADULTO EN LA TABLET ----------
const tablet = await navegador.newContext({ viewport: { width: 1280, height: 800 }, locale: "es-ES", timezoneId: "Europe/Madrid", deviceScaleFactor: 1 });
const t = await tablet.newPage();
vigilar(t, "tablet");

await paso("La pantalla de entrada carga", async () => {
  await t.goto(URL, { waitUntil: "load" });
  await t.getByRole("button", { name: "Entrar con Google" }).waitFor({ timeout: 20000 });
  await captura(t, "entrada");
});

if (!EN_VIVO) {
  await paso("Entrar con el código familiar (anónimo) y unirse al hogar", async () => {
    await t.getByRole("button", { name: "Entrar con el código familiar" }).click();
    await t.locator('input[name="codigo"]').first().waitFor();
    await captura(t, "unirse");
    const f = t.locator('form[data-form="unirse"]');
    await f.locator('input[name="codigo"]').fill("PRUEBA");
    await f.locator('input[name="nombre"]').fill("Rubén");
    await f.locator('input[name="nacimiento"]').fill("1980-06-01");
    await f.getByRole("button", { name: "Unirme" }).click();
    await t.locator("#nav").getByRole("button", { name: "Semana" }).waitFor({ timeout: 20000 });
  });

  await paso("Modo tablet activado", async () => {
    await t.evaluate(() => localStorage.setItem("modoTablet", "1"));
    await t.reload();
    await t.locator("#nav").getByRole("button", { name: "Hoy" }).waitFor({ timeout: 20000 });
  });

  await paso("Hoy: muestra los platos del día y la cocinera habitual", async () => {
    await t.getByText("Fideos a la cazuela").first().waitFor();
    await t.getByText("Pizza casera").first().waitFor();
    await t.getByText("Hoy cocina Marta").waitFor();
    await captura(t, "tablet-hoy");
  });

  await paso("Tareas: marcar que Lucía ha puesto la mesa suma puntos", async () => {
    await t.getByRole("button", { name: /^Poner la mesa/ }).click();
    await captura(t, "tablet-tarea-quien");
    await t.locator(".selector-cocinero").getByRole("button", { name: "Lucía" }).click();
    await t.getByText("ha puesto la mesa").waitFor();
    await t.getByText("95 pts").waitFor({ timeout: 10000 });
  });

  await paso("Aviso rápido «Poned la mesa» se envía", async () => {
    await t.getByRole("button", { name: "Poned la mesa" }).click();
    await t.getByText("Aviso enviado a la familia").waitFor();
  });

  await paso("Cambiar quién cocina solo para hoy", async () => {
    await t.getByRole("button", { name: /Hoy cocina Marta/ }).click();
    await captura(t, "tablet-quien-cocina");
    await t.locator(".selector-cocinero").getByRole("button", { name: "Rubén" }).click();
    await t.getByText("Hoy cocina Rubén").waitFor();
    await t.getByRole("button", { name: /Hoy cocina Rubén/ }).click();
    await t.locator(".selector-cocinero").getByRole("button", { name: "Marta" }).click();
    await t.getByText("Hoy cocina Marta").waitFor();
  });

  await paso("Tablet: un peque pregunta a KeKoMeMos y supera el reto", async () => {
    await t.getByRole("button", { name: /Los chicos preguntan a KeKoMeMos/ }).click();
    await t.locator(".selector-cocinero").getByRole("button", { name: "Pablo" }).click();
    await resolverReto(t, "Pablo", "tablet-reto-peque");
    await captura(t, "tablet-menu-revelado");
    await t.getByRole("button", { name: "¡Genial!" }).click();
    await t.getByText("45 pts").waitFor({ timeout: 10000 });
  });

  await paso("Recetas: la opción «Pedir a KeKoMeMos» está disponible", async () => {
    await t.locator("#nav").getByRole("button", { name: "Recetas" }).click();
    await t.getByRole("button", { name: /Pedir a KeKoMeMos/ }).click();
    await t.locator("#modal").getByRole("button", { name: "Fideos a la cazuela", exact: true }).click();
    await captura(t, "tablet-pedir-receta");
    await t.getByRole("button", { name: "Cerrar" }).click();
    await t.locator("#nav").getByRole("button", { name: "Hoy" }).click();
  });

  await paso("Semana: se ve la planificación", async () => {
    await t.locator("#nav").getByRole("button", { name: "Semana" }).click();
    await t.getByText("Lentejas estofadas").first().waitFor();
    await captura(t, "tablet-semana");
  });

  await paso("Semana: intercambiar dos días", async () => {
    await t.locator(".hueco", { hasText: "Lentejas estofadas" }).click();
    await t.getByRole("button", { name: "Mover o intercambiar con otro día" }).click();
    await t.locator(".hueco", { hasText: "Tortilla de patatas" }).click();
    await t.getByText("Intercambiados").waitFor();
  });

  await paso("Recetas: lista, filtro y detalle", async () => {
    await t.locator("#nav").getByRole("button", { name: "Recetas" }).click();
    await t.getByText("Curry de garbanzos").waitFor();
    await captura(t, "tablet-recetas");
    await t.locator(".chips-scroll").getByRole("button", { name: "Especiales" }).click();
    await t.getByText("Canelones de Navidad").waitFor();
    await t.getByText("Fideos a la cazuela").waitFor({ state: "detached" }).catch(() => {});
    await t.locator(".chips-scroll").getByRole("button", { name: "Todas" }).click();
    await t.locator(".receta-tarjeta", { hasText: "Fideos a la cazuela" }).click();
    await t.getByText("Dora la costilla").waitFor();
    await captura(t, "tablet-receta");
  });

  await paso("Recetas: crear una receta nueva", async () => {
    await t.locator("#nav").getByRole("button", { name: "Recetas" }).click();
    await t.getByRole("button", { name: "+ Escribirla yo" }).click();
    await t.locator('input[name="titulo"]').fill("Crema de calabaza");
    await t.locator('textarea[name="ingredientes"]').fill("1 kg calabaza\n1 cebolla\n200 ml nata para cocinar");
    await t.locator('textarea[name="pasos"]').fill("Pocha la cebolla.\nAñade la calabaza y cubre de agua.\nTritura con la nata.");
    await captura(t, "tablet-editor");
    await t.getByRole("button", { name: "Guardar receta" }).click();
    await t.getByText("Receta guardada").waitFor();
    await t.getByText("Tritura con la nata.").waitFor();
  });

  await paso("Modo cocina: abre y avanza de paso", async () => {
    await t.locator("#nav").getByRole("button", { name: "Hoy" }).click();
    await t.getByRole("button", { name: /Empezar a cocinar/ }).click();
    await t.locator("#cocina").getByText(/Paso 1 de \d/).waitFor();
    await t.locator("#cocina").getByRole("button", { name: "Siguiente" }).click();
    await t.locator("#cocina").getByText(/Paso 2 de \d/).waitFor();
    await captura(t, "tablet-modo-cocina");
    await t.locator("#cocina").getByRole("button", { name: "Salir" }).click();
  });

  await paso("Compra: añadir, marcar y guardar en casa", async () => {
    await t.locator("#nav").getByRole("button", { name: "Compra" }).click();
    await t.locator("#nuevo-item").fill("leche");
    await t.getByRole("button", { name: "Añadir", exact: true }).click();
    await t.locator(".lista li", { hasText: "leche" }).waitFor();
    await t.getByRole("checkbox", { name: "Marcar leche" }).click();
    await captura(t, "tablet-compra");
    t.once("dialog", (d) => d.dismiss());
    await t.getByRole("button", { name: /Ya está en casa/ }).click();
    await t.locator("section", { hasText: "Hay en casa" }).getByText("leche").waitFor();
  });

  await paso("Perfil: QR, código y los 5 temas", async () => {
    await t.locator("#nav").getByRole("button", { name: "Yo" }).click();
    await t.getByText("PRUEBA").waitFor();
    await t.locator(".qr svg").waitFor({ timeout: 10000 });
    await captura(t, "tablet-perfil");
    for (const [id, nombre] of [["azulejo", "Azulejo"], ["nordico", "Nórdico"], ["diner", "Diner retro"], ["cielo", "Cielo"], ["pizarra", "Pizarra clara"]]) {
      await t.getByRole("button", { name: nombre }).click();
      await t.locator("#nav").getByRole("button", { name: "Hoy" }).click();
      await t.getByText("Fideos a la cazuela").first().waitFor();
      await captura(t, `tema-${id}`);
      await t.locator("#nav").getByRole("button", { name: "Yo" }).click();
    }
  });

  // ---------- MENOR EN EL MÓVIL ----------
  const movil = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-ES", timezoneId: "Europe/Madrid" });
  const m = await movil.newPage();
  vigilar(m, "móvil menor");

  await paso("Móvil: un menor se une con el código", async () => {
    await m.goto(URL, { waitUntil: "load" });
    await m.getByRole("button", { name: "Entrar con el código familiar" }).click();
    const f = m.locator('form[data-form="unirse"]');
    await f.locator('input[name="codigo"]').fill("PRUEBA");
    await f.locator('input[name="nombre"]').fill("Hugo");
    await f.locator('input[name="nacimiento"]').fill("2009-02-01");
    await f.getByRole("button", { name: "Unirme" }).click();
    await m.locator("#nav").getByRole("button", { name: "Hoy" }).waitFor({ timeout: 20000 });
  });

  await paso("Móvil menor: el menú está oculto hasta resolver el reto", async () => {
    if (await m.locator("#nav").getByRole("button", { name: "Semana" }).count()) throw new Error("el menor ve la pestaña Semana");
    await m.getByRole("button", { name: /Pregunta a KeKoMeMos/ }).first().waitFor();
    await captura(m, "movil-menor-hoy");
    await m.getByRole("button", { name: /Pregunta a KeKoMeMos/ }).first().click();
    await resolverReto(m, "Hugo", "movil-menor-reto");
    await captura(m, "movil-menor-menu-revelado");
    await m.getByRole("button", { name: "¡Genial!" }).click();
    await m.getByText("Fideos a la cazuela").first().waitFor({ timeout: 5000 });
    await captura(m, "movil-menor-menu-visible");
  });

  await paso("Móvil menor: puede añadir a la compra pero no borrar", async () => {
    await m.locator("#nav").getByRole("button", { name: "Compra" }).click();
    await m.locator("#nuevo-item").fill("yogures");
    await m.getByRole("button", { name: "Añadir", exact: true }).click();
    await m.locator(".lista li", { hasText: "yogures" }).waitFor();
    if (await m.getByRole("button", { name: /^Quitar/ }).count()) throw new Error("el menor ve botones de borrar");
    await captura(m, "movil-menor-compra");
  });

  await paso("La tablet recibe el aviso que envía el móvil", async () => {
    await m.locator("#nav").getByRole("button", { name: "Hoy" }).click();
    await m.getByRole("button", { name: "¿Cuánto falta?" }).click();
    await t.locator(".aviso", { hasText: "Hugo" }).waitFor({ timeout: 10000 });
    await captura(t, "tablet-aviso-recibido");
  });

  // ---------- ADULTO EN EL MÓVIL ----------
  const movil2 = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-ES", timezoneId: "Europe/Madrid" });
  const a = await movil2.newPage();
  vigilar(a, "móvil adulto");
  await paso("Móvil adulto: vistas principales", async () => {
    await a.goto(URL, { waitUntil: "load" });
    await a.getByRole("button", { name: "Entrar con el código familiar" }).click();
    const f = a.locator('form[data-form="unirse"]');
    await f.locator('input[name="codigo"]').fill("PRUEBA");
    await f.locator('input[name="nombre"]').fill("Javi");
    await f.locator('input[name="nacimiento"]').fill("1979-04-04");
    await f.getByRole("button", { name: "Unirme" }).click();
    await a.getByText("Fideos a la cazuela").first().waitFor({ timeout: 20000 });
    await captura(a, "movil-adulto-hoy");
    await a.locator("#nav").getByRole("button", { name: "Semana" }).click();
    await a.getByText("Lentejas estofadas").first().waitFor();
    await captura(a, "movil-adulto-semana");
    await a.locator("#nav").getByRole("button", { name: "Recetas" }).click();
    await a.getByText("Curry de garbanzos").waitFor();
    await captura(a, "movil-adulto-recetas");
  });
}

await navegador.close();

const ignorar = /fonts\.g|favicon|ERR_BLOCKED|recaptcha|appCheck|app-check|firebaseinstallations|messaging|generativelanguage|firebasevertexai|firebaseml|Gemini|AI\/|Acertijo|Foto con/i;
const errores = erroresPagina.filter((e) => !ignorar.test(e));
const fallos = resultados.filter((r) => r.startsWith("❌")).length;
const texto = [
  `## Recorrido ${EN_VIVO ? "en la web publicada" : "con emuladores"} (${URL})`,
  "", ...resultados, "",
  `**${resultados.length - fallos} de ${resultados.length} pasos correctos.**`,
  "", errores.length ? "### Errores de la página\n" + [...new Set(errores)].map((e) => "- " + e).join("\n") : "Sin errores de JavaScript en la página.", ""
].join("\n");
appendFileSync(`${DIR}/resultado.md`, texto + "\n");
console.log(texto);
process.exit(fallos ? 1 : 0);
