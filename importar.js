const admin = require('firebase-admin');
const fs = require('fs'); // Módulo para leer archivos

const serviceAccount = require("./tu-clave-privada.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// LEER EL JSON QUE CREASTE
const productosParaSubir = JSON.parse(fs.readFileSync('./productos.json', 'utf8'));

async function subirDatos() {
    for (const doc of productosParaSubir) {
        // Asegúrate de que el campo 'stock' tenga un valor numérico
        doc.stock = Number(doc.stock) || 0; 
        doc.precio = Number(doc.precio) || 0;

        await db.collection('productos').doc(doc.id.toString()).set(doc);
        console.log(`Subido: ${doc.nombre}`);
    }
    console.log("✅ ¡Carga masiva completada!");
}

subirDatos();