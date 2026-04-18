
// --- AGREGA ESTO AQUÍ ---
firebase.firestore().enablePersistence()
  .catch((err) => {
      if (err.code == 'failed-precondition') {
          // Probablemente tienes muchas pestañas abiertas de la tienda
          console.warn("Persistencia falló: múltiples pestañas abiertas");
      } else if (err.code == 'unimplemented') {
          // El navegador es muy viejo y no lo soporta
          console.warn("El navegador no soporta persistencia");
      }
  });

// 3. Variable global para el resto de tus scripts
let productos = [];

// 4. Función para traer los datos reales de la nube
async function cargarProductosDesdeFirebase() {
    try {
        // Traemos solo 50 ordenados por los últimos que tocaste
        const snapshot = await db.collection('productos')
            .orderBy("ultimaActualizacion", "desc")
            .limit(50)
            .get();

        productos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("✅ Productos cargados (Límite 50):", productos.length);

        if (typeof iniciarTienda === 'function') iniciarTienda();
        if (typeof iniciarCheckout === 'function') iniciarCheckout();

    } catch (error) {
        console.error("Error al cargar productos:", error);
    }
}

cargarProductosDesdeFirebase();