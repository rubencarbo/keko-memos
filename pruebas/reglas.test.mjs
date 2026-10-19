// Pruebas de las reglas de seguridad de Firestore (se ejecutan en el emulador)
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, collection } from "firebase/firestore";

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

test("crear un hogar nuevo con su código funciona", async () => {
  const db = como("eva");
  const b = writeBatch(db);
  b.set(doc(db, "hogares", "h2"), { nombre: "Otra", codigo: "QWE789", admin: "eva", cocineraHabitual: "eva" });
  b.set(doc(db, "codigos", "QWE789"), { hogarId: "h2" });
  b.set(doc(db, "hogares", "h2", "miembros", "eva"), { nombre: "Eva", rol: "adulto", codigo: "QWE789" });
  b.set(doc(db, "usuarios", "eva"), { hogarId: "h2" });
  await assertSucceeds(b.commit());
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

test("nadie puede cambiar el administrador ni el código del hogar", async () => {
  await assertFails(updateDoc(doc(como("ana"), "hogares", H), { admin: "leo" }));
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
