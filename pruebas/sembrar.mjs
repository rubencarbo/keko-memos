// Datos de ejemplo en el emulador (no toca los datos reales)
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Solo se ejecuta contra el emulador");
initializeApp({ projectId: "keko-memos" });
const db = getFirestore();

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const mes = iso(new Date()).slice(0, 7);

const H = "hogar-prueba";
const recetas = {
  fideos: { titulo: "Fideos a la cazuela", categoria: "favoritos", minutos: 50, raciones: 5,
    ingredientes: [{ nombre: "fideo grueso", cantidad: 400, unidad: "g" }, { nombre: "costilla de cerdo", cantidad: 500, unidad: "g" }, { nombre: "ajo", cantidad: 2, unidad: "diente" }, { nombre: "tomate", cantidad: 2, unidad: "ud" }],
    pasos: ["Dora la costilla en la cazuela con un poco de aceite.", "Añade el ajo y el tomate rallado y sofríe 10 minutos.", "Cubre con caldo caliente y cuece 15 minutos.", "Añade los fideos y cuece 10 minutos más."] },
  pizza: { titulo: "Pizza casera", categoria: "especiales", subcategoria: "Fin de semana", minutos: 90, raciones: 5,
    ingredientes: [{ nombre: "harina", cantidad: 500, unidad: "g" }, { nombre: "mozzarella", cantidad: 250, unidad: "g" }], pasos: ["Amasa.", "Deja reposar 1 hora.", "Hornea a 250 grados 12 minutos."] },
  lentejas: { titulo: "Lentejas estofadas", categoria: "favoritos", minutos: 60, raciones: 5, ingredientes: [{ nombre: "lenteja", cantidad: 400, unidad: "g" }], pasos: ["Cuece todo junto a fuego lento."] },
  tortilla: { titulo: "Tortilla de patatas", categoria: "favoritos", minutos: 35, raciones: 5, ingredientes: [{ nombre: "huevo", cantidad: 6, unidad: "ud" }, { nombre: "patata", cantidad: 1, unidad: "kg" }], pasos: ["Fríe las patatas.", "Mezcla con el huevo y cuaja."] },
  curry: { titulo: "Curry de garbanzos", categoria: "quiero_probar", minutos: 40, raciones: 5, ingredientes: [{ nombre: "garbanzo cocido", cantidad: 800, unidad: "g" }], pasos: ["Sofríe, añade especias y garbanzos."] },
  canelones: { titulo: "Canelones de Navidad", categoria: "especiales", subcategoria: "Navidad", minutos: 120, raciones: 8, ingredientes: [], pasos: [] }
};

const b = db.batch();
b.set(db.doc(`hogares/${H}`), { nombre: "Casa Carbó", codigo: "PRUEBA", admin: "marta", cocineraHabitual: "marta" });
b.set(db.doc("codigos/PRUEBA"), { hogarId: H });
const miembros = [
  ["marta", "Marta", "adulto", "1978-03-02", 120],
  ["lucia", "Lucía", "menor", "2009-05-10", 85],
  ["pablo", "Pablo", "menor", "2010-09-21", 40],
  ["irene", "Irene", "menor", "2012-01-15", 25]
];
for (const [id, nombre, rol, nacimiento, pts] of miembros) {
  b.set(db.doc(`hogares/${H}/miembros/${id}`), { nombre, rol, nacimiento, codigo: "PRUEBA", tema: "pizarra", puntos: { [mes]: pts }, tokens: [] });
}
for (const [id, r] of Object.entries(recetas)) b.set(db.doc(`hogares/${H}/recetas/${id}`), r);
const plan = [[0, "comida", "fideos"], [0, "cena", "pizza"], [1, "comida", "lentejas"], [1, "cena", "tortilla"], [2, "comida", "curry"]];
for (const [n, tipo, id] of plan) b.set(db.doc(`hogares/${H}/menus/${dia(n)}_${tipo}`), { fecha: dia(n), tipo, recetaId: id, titulo: recetas[id].titulo });
for (const [nombre, estado] of [["pan", "falta"], ["nata para cocinar", "falta"], ["arroz", "comprado"], ["huevo", "hay"], ["aceite de oliva", "hay"]]) {
  b.set(db.collection(`hogares/${H}/despensa`).doc(), { nombre, estado, cantidad: "" });
}
await b.commit();
console.log("Datos de ejemplo cargados");
