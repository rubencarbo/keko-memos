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
const paginas = [];
async function paso(texto, fn) {
  try { await fn(); nota(true, texto); } catch (e) {
    const lineas = String(e.message).split("\n").map((l) => l.trim()).filter(Boolean);
    const donde = lineas.filter((l) => /waiting for|intercepts|outside of the viewport|not visible|not stable|resolved|attempting|retrying/.test(l)).slice(-3).join(" | ");
    nota(false, `${texto} — ${lineas[0]}${donde ? " · " + donde.slice(0, 500) : ""}`);
    for (const [p, quien] of paginas) {
      await captura(p, `FALLO-${quien}`).catch(() => {});
      const encima = await p.evaluate(() => [[innerWidth / 2, innerHeight / 2], [60, innerHeight - 40]].map(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}.${e.className}#${e.id}` : "-"; }).join(" , ")).catch(() => "?");
      nota(false, `   (${quien}: encima → ${encima})`);
    }
  }
}
const captura = (page, nombre) => page.screenshot({ path: `${DIR}/capturas/${String(++n).padStart(2, "0")}-${nombre}.png` });

function vigilar(page, quien) {
  paginas.push([page, quien.replace(/\W+/g, "-")]);
  page.on("pageerror", (e) => erroresPagina.push(`[${quien}] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") erroresPagina.push(`[${quien}] consola: ${m.text().slice(0, 300)}`); });
}

// Si mañana cae en la semana siguiente (hoy domingo), pasa a esa semana para ver los platos de mañana
async function verManana(p) {
  await p.waitForTimeout(400);
  if (!(await p.getByText("Lentejas estofadas").count())) await p.getByRole("button", { name: "Semana siguiente" }).click();
}

// Responde hasta acertar (cada fallo genera un reto nuevo) y espera a que se revele el menú
// Resuelve el reto abierto: primero falla a propósito una vez (para ver la bomba) y luego acierta
async function resolverReto(p, nombre, foto, fotoBomba) {
  await p.locator(".modal-reto .reto-pregunta").waitFor({ timeout: 30000 });
  if (foto) await captura(p, foto);
  const reto = await p.evaluate(() => window.__S.retoInline?.reto);
  const tipo = reto.tipo || "opciones";
  const esperar = async () => { await p.locator(".bomba").waitFor({ state: "detached", timeout: 15000 }).catch(() => {}); };
  // un fallo a propósito
  if (tipo === "opciones") {
    const mala = reto.opciones.findIndex((o) => o !== reto.correcta);
    await p.locator(`.modal-reto [data-accion="responder-reto"][data-i="${mala}"]`).click();
  } else if (tipo === "parejas") {
    const a = reto.pares[0].a, malo = reto.pares[1].b;
    await p.locator(`.modal-reto [data-lado="a"][data-v="${a}"]`).click();
    await p.locator(`.modal-reto [data-lado="b"][data-v="${malo}"]`).click();
  } else {
    const mal = reto.mezclados.findIndex((v) => v !== reto.elementos[0]);
    await p.locator(`.modal-reto [data-accion="orden"][data-i="${mal}"]`).click();
  }
  await p.locator(".bomba").waitFor({ timeout: 5000 });
  if (fotoBomba) await captura(p, fotoBomba);
  await esperar();
  // ahora bien
  if (tipo === "opciones") {
    await p.locator(`.modal-reto [data-accion="responder-reto"][data-i="${reto.opciones.indexOf(reto.correcta)}"]`).click();
  } else if (tipo === "parejas") {
    for (const { a, b } of reto.pares) {
      await p.locator(`.modal-reto [data-lado="a"][data-v="${a}"]`).click();
      await p.locator(`.modal-reto [data-lado="b"][data-v="${b}"]`).click();
    }
  } else {
    const usados = new Set();
    for (const el of reto.elementos) {
      const i = reto.mezclados.findIndex((v, k) => v === el && !usados.has(k));
      usados.add(i);
      await p.locator(`.modal-reto [data-accion="orden"][data-i="${i}"]`).click();
    }
  }
  await p.getByText(`¡Bien, ${nombre}!`).waitFor({ timeout: 8000 });
}

// Unirse con el código: elegir «nuevo» o un perfil existente
async function unirse(p, { nombre, nacimiento, existente = false }, foto) {
  await p.getByRole("button", { name: "Entrar con el código familiar" }).click();
  await p.locator('form[data-form="union-codigo"] input[name="codigo"]').fill("PRUEBA");
  await p.getByRole("button", { name: "Continuar" }).click();
  await p.getByText("¿Quién eres?").waitFor({ timeout: 20000 });
  if (foto) await captura(p, foto);
  if (existente) {
    await p.locator(".selector-cocinero").getByRole("button", { name: nombre }).click();
    await p.locator('form[data-form="union-soy"] input[name="nacimientoTexto"]').fill(nacimiento.split("-").reverse().join("/"));
    await p.getByRole("button", { name: "Entrar" }).click();
  } else {
    await p.getByRole("button", { name: "Soy nuevo/a en la familia" }).click();
    const f = p.locator('form[data-form="union-nuevo"]');
    await f.locator('input[name="nombre"]').fill(nombre);
    await f.locator('input[name="nacimientoTexto"]').fill(nacimiento.split("-").reverse().join("/"));
    await f.getByRole("button", { name: "Unirme" }).click();
  }
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
    await unirse(t, { nombre: "Rubén", nacimiento: "1980-06-01" }, "unirse-quien-eres");
    await t.locator("#nav").getByRole("button", { name: "Menús" }).waitFor({ timeout: 20000 });
  });

  await paso("Modo tablet activado", async () => {
    await t.evaluate(() => localStorage.setItem("modoTablet", "1"));
    await t.reload();
    await t.getByText("¿Quién eres?").waitFor({ timeout: 20000 });
    await captura(t, "tablet-quien-eres");
    await t.locator(".quien-eres").getByRole("button", { name: "Rubén" }).click();
    await t.getByText("Soy Rubén").waitFor();
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
    await t.getByRole("button", { name: "¡A la mesa!" }).click();
    await t.getByText("42 pts").waitFor({ timeout: 10000 });
  });

  await paso("Recetas: el asistente «Añadir receta» ofrece internet, IA y a mano", async () => {
    await t.locator("#nav").getByRole("button", { name: "Recetas" }).click();
    await t.getByRole("button", { name: "+ Añadir receta" }).click();
    await t.locator('#modal input[name="consulta"]').fill("Fideos a la cazuela");
    await t.getByRole("button", { name: /Buscar la receta en internet|Traerla de internet/ }).waitFor();
    await t.getByRole("button", { name: /Que la cree KeKoMeMos/ }).waitFor();
    await captura(t, "tablet-anadir-receta");
    await t.getByRole("button", { name: "Cerrar" }).click();
    await t.locator("#nav").getByRole("button", { name: "Hoy" }).click();
  });

  await paso("Hoy: botón «No sé qué cocinar · ¡Dame ideas!»", async () => {
    await t.locator("#nav").getByRole("button", { name: "Hoy" }).click();
    await t.getByRole("button", { name: /No sé qué cocinar/ }).click();
    await t.getByText("De vuestras recetas").waitFor();
    await t.waitForTimeout(1500);
    await captura(t, "tablet-ideas");
    await t.getByRole("button", { name: "Cerrar" }).click();
  });

  await paso("Semana: se ve la planificación", async () => {
    await t.locator("#nav").getByRole("button", { name: "Menús" }).click();
    await verManana(t);
    await t.getByText("Lentejas estofadas").first().waitFor();
    await captura(t, "tablet-semana");
  });

  await paso("Semana: intercambiar dos días", async () => {
    await t.locator(".hueco", { hasText: "Lentejas estofadas" }).click();
    await t.getByRole("button", { name: "Mover o intercambiar con otro día" }).click();
    await t.locator(".hueco", { hasText: "Tortilla de patatas" }).click();
    await t.getByText("Intercambiados").waitFor();
  });

  await paso("Menús: rellenar huecos sin repetir plato en 4 días", async () => {
    await t.getByRole("button", { name: "Semana siguiente" }).click();
    await t.getByRole("button", { name: /Rellenar huecos/ }).click();
    await t.waitForTimeout(2500);
    await captura(t, "tablet-semana-rellenada");
    const filas = await t.locator(".semana .dia").evaluateAll((ds) => ds.map((d, i) => ({ i, platos: [...d.querySelectorAll(".hueco span")].map((x) => x.textContent.trim()) })));
    const ultima = {};
    for (const { i, platos } of filas) {
      for (const p of platos) {
        if (!p || p.startsWith("+") || p === "—") continue;
        if (ultima[p] !== undefined && i - ultima[p] < 4) throw new Error(`«${p}» se repite a los ${i - ultima[p]} días`);
        ultima[p] = i;
      }
    }
    await t.getByRole("button", { name: "Semana anterior" }).click();
  });

  await paso("Menús: vista mensual", async () => {
    await t.locator(".chips").getByRole("button", { name: "Mes" }).click();
    await t.locator(".mes .mes-dia").first().waitFor();
    await captura(t, "tablet-mes");
    await t.locator(".mes-dia.es-hoy").click();
    await t.locator("#modal .hueco").first().waitFor();
    await captura(t, "tablet-mes-dia");
    await t.getByRole("button", { name: "Cerrar" }).click();
    await t.locator(".chips").getByRole("button", { name: "Semana" }).click();
  });

  await paso("Menús: crear una receta nueva directamente en un día vacío", async () => {
    await t.locator(".hueco.vacio-hueco").first().click();
    await t.getByRole("button", { name: /Receta nueva/ }).waitFor();
    await captura(t, "tablet-que-ponemos");
    await t.getByRole("button", { name: /Receta nueva/ }).click();
    await t.locator('#modal input[name="consulta"]').fill("Gazpacho");
    await t.getByRole("button", { name: "Escribirla yo" }).click();
    await t.getByText("Al guardar se añadirá al menú").waitFor();
    await t.locator('input[name="titulo"]').fill("Gazpacho");
    await t.locator('textarea[name="ingredientes"]').fill("1 kg tomate\n1 pepino\n1 diente ajo");
    await t.locator('textarea[name="pasos"]').fill("Tritura todo.\nEnfría en la nevera.");
    await t.getByRole("button", { name: "Guardar receta" }).click();
    await t.getByText("añadida al menú").waitFor();
    await t.locator(".hueco", { hasText: "Gazpacho" }).waitFor();
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
    await t.getByRole("button", { name: "+ Añadir receta" }).click();
    await t.locator('#modal input[name="consulta"]').fill("Crema de calabaza");
    await t.getByRole("button", { name: "Escribirla yo" }).click();
    if ((await t.locator('input[name="titulo"]').inputValue()) !== "Crema de calabaza") throw new Error("el nombre no pasa al editor");
    await t.locator('fieldset.tipos input[value="comida"]').uncheck();
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
    await t.locator(".codigo-hogar", { hasText: "PRUEBA" }).waitFor();
    await t.locator(".qr svg").waitFor({ timeout: 10000 });
    await captura(t, "tablet-perfil");
    for (const [id, nombre] of [["azulejo", "Azulejo"], ["nordico", "Nórdico"], ["diner", "Diner retro"], ["cielo", "Zellige"], ["pizarra", "Pizarra clara"]]) {
      await t.getByRole("button", { name: nombre }).click();
      await t.locator("#nav").getByRole("button", { name: "Hoy" }).click();
      await t.getByText("Fideos a la cazuela").first().waitFor();
      await captura(t, `tema-${id}`);
      await t.locator("#nav").getByRole("button", { name: "Yo" }).click();
    }
  });

  await paso("Rubén cambia el nombre de un miembro", async () => {
    await t.locator("#nav").getByRole("button", { name: "Yo" }).click();
    await t.getByRole("button", { name: "Cambiar el nombre de Irene" }).click();
    await t.locator('#modal input[name="nombre"]').fill("Irenita");
    await t.locator("#modal").getByRole("button", { name: "Guardar" }).click();
    await t.getByText("Irenita").first().waitFor();
  });

  await paso("Recetas: exportar a JSON e importar sin duplicar", async () => {
    await t.locator("#nav").getByRole("button", { name: "Recetas" }).click();
    await t.getByRole("button", { name: /Copia/ }).click();
    const [descarga] = await Promise.all([t.waitForEvent("download"), t.getByRole("button", { name: /Exportar las/ }).click()]);
    const ruta = await descarga.path();
    const json = JSON.parse((await import("node:fs")).readFileSync(ruta, "utf8"));
    if (!json.recetas?.length) throw new Error("la copia está vacía");
    await t.locator('input[data-input="importar-recetas"]').setInputFiles(ruta);
    await t.getByText(/No hay recetas nuevas que importar/).waitFor();
    await t.getByRole("button", { name: "Cerrar" }).click().catch(() => {});
  });

  await paso("Rubén: panel «Reiniciar» (prueba con los avisos)", async () => {
    await t.locator("#nav").getByRole("button", { name: "Yo" }).click();
    await t.locator(".zona-reinicio").scrollIntoViewIfNeeded();
    await captura(t, "tablet-reiniciar");
    await t.locator(".zona-reinicio").getByRole("button", { name: /Avisos/ }).click();
    await t.locator('#modal input[name="confirmar"]').fill("BORRAR");
    await t.getByRole("button", { name: /Reiniciar avisos/ }).click();
    await t.getByText(/avisos borrados/).waitFor();
  });

  // ---------- MENOR EN EL MÓVIL ----------
  const movil = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-ES", timezoneId: "Europe/Madrid" });
  const m = await movil.newPage();
  vigilar(m, "móvil menor");

  await paso("Móvil: un menor se une con el código", async () => {
    await m.goto(URL, { waitUntil: "load" });
    await unirse(m, { nombre: "Hugo", nacimiento: "2009-02-01" });
    await m.locator("#nav").getByRole("button", { name: "Hoy" }).waitFor({ timeout: 20000 });
  });

  await paso("Móvil menor: el menú está oculto hasta resolver el reto", async () => {
    if (await m.locator("#nav").getByRole("button", { name: "Menús" }).count()) throw new Error("el menor ve la pestaña Semana");
    if (await m.locator("#nav").getByRole("button", { name: "Recetas" }).count()) throw new Error("el menor ve la pestaña Recetas");
    await m.locator(".hero-titulo", { hasText: /KEKO|KECE/ }).waitFor();
    if (await m.locator(".plato").count()) throw new Error("el menor ve el plato antes de acertar");
    await captura(m, "movil-menor-kekomemos");
    await m.locator(".boton-fisico").click();
    await m.locator(".modal-reto .reto-pregunta").waitFor({ timeout: 30000 });
    await m.waitForTimeout(800);
    await captura(m, "movil-menor-reto");
    // no se puede saltar: al salir y volver a entrar, el mismo reto vuelve a aparecer
    const pregunta = await m.locator(".modal-reto .reto-pregunta").innerText();
    await m.waitForTimeout(1500);
    await m.reload();
    await m.locator(".modal-reto .reto-pregunta").waitFor({ timeout: 30000 });
    if ((await m.locator(".modal-reto .reto-pregunta").innerText()) !== pregunta) throw new Error("al volver a entrar ha cambiado el reto");
    await m.keyboard.press("Escape");
    await m.mouse.click(5, 5);
    if (!(await m.locator(".modal-reto").count())) throw new Error("el reto se ha podido cerrar sin acertar");
    await resolverReto(m, "Hugo", null, "movil-menor-bomba");
    await m.getByText("¡Bien, Hugo!").waitFor({ timeout: 5000 });
    await m.waitForTimeout(800);
    await captura(m, "movil-menor-regalo");
    await m.waitForTimeout(1800);
    await captura(m, "movil-menor-revelado");
    await m.getByRole("button", { name: "¡A la mesa!" }).click();
    await m.locator(".hero-keko").waitFor({ state: "detached", timeout: 5000 });
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

  await paso("Un menor marca una tarea y queda pendiente hasta que Rubén la verifica", async () => {
    await m.locator("#nav").getByRole("button", { name: "Hoy" }).click();
    await m.getByRole("button", { name: /^Quitar la mesa/ }).click();
    await m.locator(".selector-cocinero").getByRole("button", { name: "Hugo" }).click();
    await m.getByText(/se suman cuando lo verifique/).waitFor();
    await m.getByText("por verificar").waitFor();
    await t.getByText("Tareas por verificar").waitFor({ timeout: 15000 });
    await captura(t, "tablet-verificar");
    await t.locator("#modal").getByRole("button", { name: "Confirmar" }).first().click();
    await t.locator("#modal").waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  });

  const cerrarAvisos = async (p) => {
    for (const b of await p.locator("#avisos-flotantes .aviso").getByRole("button", { name: "Cerrar" }).all()) await b.click().catch(() => {});
  };

  await paso("Misiones: Rubén ve el panel de adultos, añade un premio y encarga una misión", async () => {
    await t.locator("#nav").getByRole("button", { name: "Misiones" }).click();
    await t.getByText("Panel de adultos").waitFor();
    await t.getByText("Objetivo familiar").waitFor();
    await captura(t, "tablet-misiones");
    await t.getByRole("button", { name: /Configurar/ }).click();
    const f = t.locator('#modal form[data-form="premio"]');
    await f.locator('input[name="emoji"]').fill("🍬");
    await f.locator('input[name="nombre"]').fill("Una chuche");
    await f.locator('input[name="coste"]').fill("5");
    await f.getByRole("button", { name: "Añadir" }).click();
    await t.locator("#modal").getByText("Una chuche").waitFor();
    await captura(t, "tablet-config-misiones");
    await t.locator("#modal").getByRole("button", { name: "Cerrar" }).click();
    await t.getByRole("button", { name: /Encargar misión/ }).click();
    await t.locator("#modal label.elegible", { hasText: "Hugo" }).click();
    await t.locator('#modal select[name="tarea"]').selectOption("tender");
    await t.locator("#modal").getByRole("button", { name: "Encargar y avisar" }).click();
    await t.getByText("Misión encargada a Hugo").waitFor();
  });

  await paso("Misiones: Hugo cumple su encargo, Rubén le da «¡Perfecto!» y se celebra en su móvil", async () => {
    await m.locator("#nav").getByRole("button", { name: "Misiones" }).click();
    await m.getByText("Tus misiones de hoy").waitFor();
    await cerrarAvisos(m);
    await captura(m, "movil-menor-misiones");
    await m.getByRole("button", { name: "Marcar hecha: Tender la lavadora" }).click();
    await m.getByText(/se suman cuando lo verifique/).waitFor();
    await t.getByText("Tareas por verificar").waitFor({ timeout: 15000 });
    await t.locator("#modal").getByRole("button", { name: "Perfecto" }).first().click();
    await m.locator(".celebracion").waitFor({ timeout: 15000 });
    await m.waitForTimeout(900);
    await captura(m, "movil-menor-celebracion");
    await m.locator(".celebracion").click();
    await m.getByRole("button", { name: "Hecha: Tender la lavadora" }).waitFor();
  });

  await paso("Tienda: Hugo canjea un premio y Rubén se lo entrega", async () => {
    await cerrarAvisos(m);
    m.once("dialog", (d) => d.accept());
    await m.locator(".ticket", { hasText: "Una chuche" }).getByRole("button", { name: "Canjear" }).click();
    await m.getByText(/¡Pedido!/).waitFor();
    await t.locator("#modal").getByText("Premios por entregar").waitFor({ timeout: 15000 });
    await captura(t, "tablet-entregar-premio");
    await t.locator("#modal").getByRole("button", { name: "Entregar" }).first().click();
    await t.getByText(/Entregado a Hugo/).waitFor();
    await m.locator(".celebracion").waitFor({ timeout: 15000 });
    await m.waitForTimeout(900);
    await captura(m, "movil-menor-premio");
    await m.locator(".celebracion").click();
  });

  await paso("Rubén resta puntos a un menor", async () => {
    await t.locator("#nav").getByRole("button", { name: "Hoy" }).click();
    await t.getByRole("button", { name: /Restar puntos/ }).click();
    await t.locator("#modal label.elegible", { hasText: "Pablo" }).click();
    await captura(t, "tablet-restar");
    await t.locator("#modal").getByRole("button", { name: "Restar puntos" }).click();
    await t.getByText(/−5 puntos para Pablo/).waitFor();
  });

  await paso("La tablet recibe el aviso que envía el móvil", async () => {
    await m.locator("#nav").getByRole("button", { name: "Hoy" }).click();
    await m.getByRole("button", { name: "¿Cuánto falta?" }).click();
    await t.locator(".aviso", { hasText: "Hugo" }).waitFor({ timeout: 10000 });
    await captura(t, "tablet-aviso-recibido");
  });

  await paso("Sin duplicados: Hugo entra desde otro móvil y elige su perfil", async () => {
    const otro = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-ES", timezoneId: "Europe/Madrid" });
    const h = await otro.newPage();
    vigilar(h, "móvil 2 de Hugo");
    await h.goto(URL, { waitUntil: "load" });
    await unirse(h, { nombre: "Hugo", nacimiento: "2009-02-01", existente: true }, "otro-movil-elige-perfil");
    await h.getByText("¡Hola, Hugo!").waitFor({ timeout: 20000 });
    // ya había acertado el reto en el otro móvil: no se le vuelve a pedir
    if (await h.locator(".hero-keko").count()) throw new Error("el reto ya resuelto vuelve a aparecer");
    await captura(h, "otro-movil-mismo-perfil");
    // intentar crear otra vez a Hugo como «nuevo» tampoco duplica
    const otro2 = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES" });
    const h2 = await otro2.newPage();
    await h2.goto(URL, { waitUntil: "load" });
    await unirse(h2, { nombre: "hugo", nacimiento: "2009-02-01" });
    await h2.getByText("¡Hola, Hugo!").waitFor({ timeout: 20000 });
    await t.locator("#nav").getByRole("button", { name: "Hoy" }).click();
    await t.waitForTimeout(1500);
    const n = await t.locator(".ranking-fila", { hasText: "Hugo" }).count();
    if (n !== 1) throw new Error(`Hugo aparece ${n} veces en la liga`);
    await otro.close(); await otro2.close();
  });

  // ---------- ADULTO EN EL MÓVIL ----------
  const movil2 = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-ES", timezoneId: "Europe/Madrid" });
  const a = await movil2.newPage();
  vigilar(a, "móvil adulto");
  await paso("Móvil adulto: vistas principales", async () => {
    await a.goto(URL, { waitUntil: "load" });
    await unirse(a, { nombre: "Javi", nacimiento: "1979-04-04" });
    await a.getByText("Fideos a la cazuela").first().waitFor({ timeout: 20000 });
    await captura(a, "movil-adulto-hoy");
    await a.locator("#nav").getByRole("button", { name: "Menús" }).click();
    await verManana(a);
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
