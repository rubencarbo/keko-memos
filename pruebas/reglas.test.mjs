// Pruebas de las reglas de seguridad de Firestore (se ejecutan en el emulador)
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, collection, addDoc } from "firebase/firestore";

let env;
const H = "hogar1";

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "keko-memos",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 }
  });
});
after(() => env.clearFirestore().then(() => env.cleanup()));

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "hogares", H), { nombre: "Casa", codigo: "ABC234", admin: "ana", cocineraHabitual: "ana" });
    await setDoc(doc(db, "codigos", "ABC234"), { hogarId: H });
    await setDoc(doc(db, "hogares", H, "miembros", "ana"), { nombre: "Ana", rol: "adulto", codigo: "ABC234" });
    await setDoc(doc(db, "hogares", H, "miembros", "leo"), { nombre: "Leo", rol: "menor", codigo: "ABC234" });
    await setDoc(doc(db, "hogares", H, "recetas", "r1"), { titulo: "Pizza" });
    await setDoc(doc(db, "hogares", H, "despensa", "d1"), { nombre: "pan", estado: "falta" });
  });
});
const como = (uid) => env.authenticatedContext(uid).firestore();

test("un extraño no puede leer el hogar ni sus recetas", async () => {
  const db = como("extrano");
  await assertFails(getDoc(doc(db, "hogares", H)));
  await assertFails(getDoc(doc(db, "hogares", H, "recetas", "r1")));
});

test("sin sesión no se puede consultar un código", async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "codigos", "ABC234")));
});

test("unirse con el código correcto funciona", async () => {
  const db = como("nuevo");
  await assertSucceeds(getDoc(doc(db, "codigos", "ABC234")));
  const b = writeBatch(db);
  b.set(doc(db, "hogares", H, "miembros", "nuevo"), { nombre: "Nuevo", rol: "adulto", codigo: "ABC234" });
  b.set(doc(db, "usuarios", "nuevo"), { hogarId: H });
  await assertSucceeds(b.commit());
});

test("unirse con un código falso falla", async () => {
  await assertFails(setDoc(doc(como("nuevo"), "hogares", H, "miembros", "nuevo"), { nombre: "X", rol: "adulto", codigo: "ZZZZZZ" }));
});

test("crear una familia nueva necesita una invitación de Rubén (y solo sirve una vez)", async () => {
  const sinInv = como("eva");
  const b0 = writeBatch(sinInv);
  b0.set(doc(sinInv, "hogares", "h0"), { nombre: "Sin invitación", codigo: "SIN000", admin: "eva", cocineraHabitual: "eva" });
  await assertFails(b0.commit());

  const ruben = env.authenticatedContext("ruben", { email: "rubencarbo@gmail.com", email_verified: true }).firestore();
  await assertSucceeds(setDoc(doc(ruben, "invitaciones", "inv1"), { creadaPor: "ruben", creadaMs: 1, nota: "Familia Eva", usada: false }));
  await assertFails(setDoc(doc(como("eva"), "invitaciones", "inv2"), { creadaPor: "eva", usada: false }));

  const db = como("eva");
  const b = writeBatch(db);
  b.set(doc(db, "hogares", "h2"), { nombre: "Otra", codigo: "QWE789", admin: "eva", cocineraHabitual: "eva", invitacion: "inv1" });
  b.update(doc(db, "invitaciones", "inv1"), { usada: true, hogarId: "h2", familia: "Otra", usadaPor: "eva", usadaEmail: "", usadaMs: 2 });
  b.set(doc(db, "codigos", "QWE789"), { hogarId: "h2" });
  b.set(doc(db, "hogares", "h2", "miembros", "eva"), { nombre: "Eva", rol: "adulto", codigo: "QWE789" });
  b.set(doc(db, "usuarios", "eva"), { hogarId: "h2" });
  await assertSucceeds(b.commit());

  // la misma invitación no vale otra vez
  const otro = como("leo3");
  const b2 = writeBatch(otro);
  b2.set(doc(otro, "hogares", "h3"), { nombre: "Copia", codigo: "ZXC456", admin: "leo3", cocineraHabitual: "leo3", invitacion: "inv1" });
  b2.update(doc(otro, "invitaciones", "inv1"), { hogarId: "h3", usadaPor: "leo3" });
  await assertFails(b2.commit());
});

test("misiones: el menor no se da puntos ni estrellas, solo pide; el adulto verifica y entrega", async () => {
  await assertFails(addDoc(collection(como("leo"), "hogares", H, "tareas"), { tarea: "hacer_cama", uid: "leo", por: "leo", estado: "ok", puntos: 5 }));
  await assertSucceeds(addDoc(collection(como("leo"), "hogares", H, "tareas"), { tarea: "hacer_cama", uid: "leo", por: "leo", estado: "pendiente", puntos: 5 }));
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "hogares", H, "tareas", "enc1"), { tarea: "tender", uid: "leo", por: "ana", estado: "asignada", encargo: true, puntos: 15 });
  });
  await assertFails(updateDoc(doc(como("leo"), "hogares", H, "tareas", "enc1"), { estado: "ok" }));
  await assertFails(updateDoc(doc(como("leo"), "hogares", H, "tareas", "enc1"), { estado: "pendiente", puntos: 500 }));
  await assertSucceeds(updateDoc(doc(como("leo"), "hogares", H, "tareas", "enc1"), { estado: "pendiente", hechoMs: 1 }));
  await assertFails(updateDoc(doc(como("leo"), "hogares", H, "miembros", "leo"), { gastado: -100 }));
  await assertFails(updateDoc(doc(como("leo"), "hogares", H, "miembros", "leo"), { "logros.cien": "2026-11-03" }));
  await assertSucceeds(addDoc(collection(como("leo"), "hogares", H, "canjes"), { uid: "leo", por: "leo", estado: "pendiente", coste: 40, nombre: "Pantalla" }));
  await assertFails(addDoc(collection(como("leo"), "hogares", H, "canjes"), { uid: "leo", por: "leo", estado: "entregado", coste: 40 }));
  await assertFails(addDoc(collection(como("leo"), "hogares", H, "canjes"), { uid: "ana", por: "leo", estado: "pendiente", coste: 40 }));
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "hogares", H, "canjes", "c1"), { uid: "leo", por: "leo", estado: "pendiente", coste: 40 });
  });
  await assertFails(updateDoc(doc(como("leo"), "hogares", H, "canjes", "c1"), { estado: "entregado" }));
  await assertSucceeds(updateDoc(doc(como("ana"), "hogares", H, "canjes", "c1"), { estado: "entregado" }));
  await assertSucceeds(updateDoc(doc(como("ana"), "hogares", H, "miembros", "leo"), { gastado: 40 }));
});

test("los menores no pueden verificar sus tareas; los adultos sí", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "hogares", H, "tareas", "t1"), { tarea: "poner_mesa", uid: "leo", por: "leo", estado: "pendiente", puntos: 10 });
  });
  await assertFails(updateDoc(doc(como("leo"), "hogares", H, "tareas", "t1"), { estado: "ok" }));
  await assertSucceeds(updateDoc(doc(como("ana"), "hogares", H, "tareas", "t1"), { estado: "ok" }));
});

test("no se puede secuestrar un código de otro hogar", async () => {
  await assertFails(setDoc(doc(como("malo"), "codigos", "ABC234"), { hogarId: "otro" }));
});

test("un menor lee recetas pero no las edita ni borra", async () => {
  const db = como("leo");
  await assertSucceeds(getDoc(doc(db, "hogares", H, "recetas", "r1")));
  await assertFails(updateDoc(doc(db, "hogares", H, "recetas", "r1"), { titulo: "X" }));
  await assertFails(deleteDoc(doc(db, "hogares", H, "recetas", "r1")));
});

test("un menor no puede planificar menús", async () => {
  await assertFails(setDoc(doc(como("leo"), "hogares", H, "menus", "2026-10-20_comida"), { recetaId: "r1" }));
});

test("un menor añade y marca la compra pero no la borra", async () => {
  const db = como("leo");
  await assertSucceeds(setDoc(doc(db, "hogares", H, "despensa", "d2"), { nombre: "nata", estado: "falta" }));
  await assertSucceeds(updateDoc(doc(db, "hogares", H, "despensa", "d1"), { estado: "comprado" }));
  await assertFails(deleteDoc(doc(db, "hogares", H, "despensa", "d1")));
});

test("un menor no puede hacerse adulto", async () => {
  await assertFails(updateDoc(doc(como("leo"), "hogares", H, "miembros", "leo"), { rol: "adulto" }));
  await assertSucceeds(updateDoc(doc(como("leo"), "hogares", H, "miembros", "leo"), { nombre: "Leíto" }));
});

test("un adulto planifica, edita recetas y cambia quién cocina", async () => {
  const db = como("ana");
  await assertSucceeds(setDoc(doc(db, "hogares", H, "menus", "2026-10-20_comida"), { recetaId: "r1" }));
  await assertSucceeds(updateDoc(doc(db, "hogares", H, "recetas", "r1"), { titulo: "Pizza casera" }));
  await assertSucceeds(updateDoc(doc(db, "hogares", H), { cocinaHoy: { fecha: "2026-10-20", uid: "leo" } }));
});

test("el titular solo pasa a otro adulto y el código no cambia", async () => {
  await assertFails(updateDoc(doc(como("ana"), "hogares", H), { admin: "leo" }));
  await assertFails(updateDoc(doc(como("ana"), "hogares", H), { admin: "nadie" }));
  await assertFails(updateDoc(doc(como("ana"), "hogares", H), { codigo: "NUEVO1" }));
});

test("los avisos se firman con el propio usuario", async () => {
  const db = como("leo");
  await assertSucceeds(setDoc(doc(collection(db, "hogares", H, "avisos")), { de: "leo", texto: "¿Cuánto falta?" }));
  await assertFails(setDoc(doc(collection(db, "hogares", H, "avisos")), { de: "ana", texto: "falso" }));
});

test("cualquier miembro registra tareas de casa", async () => {
  await assertSucceeds(setDoc(doc(collection(como("leo"), "hogares", H, "tareas")), { tarea: "poner_mesa", uid: "leo", por: "leo", fecha: "2026-10-20" }));
});

test("un adulto puede borrar un perfil duplicado, pero nadie al administrador", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "hogares", H, "miembros", "javi"), { nombre: "Javi", rol: "adulto", codigo: "ABC234" });
    await setDoc(doc(c.firestore(), "hogares", H, "miembros", "leo2"), { nombre: "Leo", rol: "menor", codigo: "ABC234" });
  });
  await assertSucceeds(deleteDoc(doc(como("javi"), "hogares", H, "miembros", "leo2")));
  await assertFails(deleteDoc(doc(como("javi"), "hogares", H, "miembros", "ana")));
  await assertFails(deleteDoc(doc(como("leo"), "hogares", H, "miembros", "javi")));
});

test("fusionar al titular: pasa a otro adulto y se borra el duplicado en el mismo paso", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "hogares", H, "miembros", "ana2"), { nombre: "Ana", rol: "adulto", codigo: "ABC234" });
  });
  const db = como("ana");
  const b = writeBatch(db);
  b.update(doc(db, "hogares", H), { admin: "ana2" });
  b.delete(doc(db, "hogares", H, "miembros", "ana"));
  await assertSucceeds(b.commit());
});
