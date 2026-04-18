const db = window.db;
const auth = window.auth || firebase.auth();

// --- 1. SEGURIDAD Y LOGIN ---
const admins = ["davis86seni@gmail.com", "elenaisabelceballos@gmail.com"];

firebase.auth().onAuthStateChanged((user) => {
    if (user && admins.includes(user.email)) {
        console.log("✅ Acceso concedido a:", user.email);
        cargarProductosAdmin(); 
    } else {
        console.warn("❌ Acceso denegado");
        // Redirige inmediatamente si NO es admin
        window.location.href = "index.html";
    }
});

// 1. VARIABLES GLOBALES PARA PAGINACIÓN
let productosLocal = [];
let ultimoDocAdmin = null; // Guarda el último producto cargado
let cargandoAdmin = false;
let productosEditados = new Set();
let indiceBusquedaCompleto = []; // Guardará nombre e ID de todos los productos
const btnGuardarTodo = document.querySelector("#btn-guardar-todo");

const tablaCuerpo = document.querySelector("#tabla-cuerpo");
const buscadorAdmin = document.querySelector("#busqueda-admin");


// 2. GENERADOR DE ID AUTOMÁTICO (Optimizado para no gastar cuota)
async function obtenerSiguienteIdProducto() {
    try {
        // Pedimos solo el documento con el ID más alto, no todos.
        const snapshot = await db.collection("productos")
            .orderBy(firebase.firestore.FieldPath.documentId(), "desc")
            .limit(1)
            .get();

        if (snapshot.empty) return "10579";

        const ultimoId = parseInt(snapshot.docs[0].id);
        return isNaN(ultimoId) ? "10579" : (ultimoId + 1).toString();
    } catch (error) {
        console.error("Error obteniendo ID:", error);
        return Date.now().toString(); // Fallback seguro
    }
}

// 3. CARGA INICIAL Y PAGINADA
async function cargarProductosAdmin(esCargaMas = false) {
    if (cargandoAdmin) return;
    cargandoAdmin = true;

    const status = document.querySelector("#status-carga");
    if (status) status.innerText = "⏳ Cargando productos...";

    try {
        let query = db.collection("productos")
            .orderBy("ultimaActualizacion", "desc")
            .limit(15);

        // Si es "Cargar más", empezamos después del último documento
        if (esCargaMas && ultimoDocAdmin) {
            query = query.startAfter(ultimoDocAdmin);
        } else {
            productosLocal = []; // Reiniciamos si es carga inicial
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            if (status) status.innerText = "✅ No hay más productos.";
            cargandoAdmin = false;
            return;
        }

        // Guardamos el último para la próxima carga
        ultimoDocAdmin = snapshot.docs[snapshot.docs.length - 1];

        snapshot.forEach(doc => {
            productosLocal.push({ id: doc.id, ...doc.data() });
        });

        mostrarProductosAdmin(productosLocal);
        
        if (status) status.innerText = `✅ Mostrando ${productosLocal.length} productos.`;
    } catch (error) {
        console.error("Error:", error);
    } finally {
        cargandoAdmin = false;
    }
}

// 4. MOSTRAR PRODUCTOS Y BOTÓN "VER MÁS"
function mostrarProductosAdmin(lista) {
    if (!tablaCuerpo) return;
    tablaCuerpo.innerHTML = "";
    
    lista.forEach(p => {
        const tr = document.createElement("tr");
        
        // --- LÓGICA DE COLORES PARA EL STOCK ---
        let estiloStock = "";
        const cantidad = Number(p.stock || 0);
        if (cantidad === 0) {
            estiloStock = "background-color: #f8d7da; border: 1px solid black; font-weight: bold;"; 
        } else if (cantidad >= 1 && cantidad <= 3) {
            estiloStock = "background-color: #ffe5b4; border: 1px solid black; font-weight: bold;"; 
        } else {
            estiloStock = "background-color: #ffffff; border: 1px solid black;"; 
        }

        const nombreSeguro = (p.nombre || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");

        // --- ESTRUCTURA MEJORADA PARA VISIBILIDAD ---
        tr.innerHTML = `
            <td data-label="ID" style="font-size: 10px; color: #666;">${p.id}</td>
            <td data-label="Producto">
                <textarea class="input-edit" 
    style="font-weight: bold; width: 100%; min-height: 50px; resize: none; border: 1px solid #ccc; padding: 5px; font-family: inherit;" 
    data-id="${p.id}" data-campo="nombre">${p.nombre || ''}</textarea>
            </td>
            <td data-label="Detalle">
                <textarea class="input-edit" 
                    style="font-size: 12px; width: 100%; min-height: 50px; resize: none; border: 1px solid #ccc; padding: 5px; font-family: inherit;" 
                    data-id="${p.id}" data-campo="detalle" 
                    placeholder="Color, talle...">${p.detalle || ''}</textarea>
            </td>
            <td data-label="Categoría">
                <select class="input-edit" data-id="${p.id}" data-campo="categoria" style="width: 100%; height: 40px;">
                    <option value="BAZAR" ${p.categoria === 'BAZAR' ? 'selected' : ''}>BAZAR</option>
                    <option value="BLANCOS" ${p.categoria === 'BLANCOS' ? 'selected' : ''}>BLANCOS</option>
                    <option value="ELECTRO" ${p.categoria === 'ELECTRO' ? 'selected' : ''}>ELECTRO</option>
                    <option value="ESCOLAR" ${p.categoria === 'ESCOLAR' ? 'selected' : ''}>ESCOLAR</option>
                    <option value="JUGUETERIA" ${p.categoria === 'JUGUETERIA' ? 'selected' : ''}>JUGUETERIA</option>
                    <option value="INDUMENTARIA" ${p.categoria === 'INDUMENTARIA' ? 'selected' : ''}>INDUMENTARIA</option>
                    <option value="OTROS" ${p.categoria === 'OTROS' ? 'selected' : ''}>OTROS</option>
                </select>
            </td>
            <td data-label="Stock">
                <input type="number" class="input-edit" style="width: 80px; text-align: center; height: 40px; ${estiloStock}" 
                       data-id="${p.id}" data-campo="stock" value="${p.stock || 0}">
            </td>
            <td data-label="Costo">
                <input type="number" class="input-edit" data-id="${p.id}" data-campo="costo" value="${p.costo || 0}" style="width: 90px; height: 40px;">
            </td>
            <td data-label="Venta">
                <input type="number" class="input-edit" data-id="${p.id}" data-campo="precio" value="${p.precio || 0}" style="width: 90px; height: 40px;">
            </td>
            <td data-label="Foto">
                <div style="display: flex; gap: 5px; align-items: center; justify-content: flex-end;">
                    <input type="text" class="input-edit" data-id="${p.id}" data-campo="imagen" 
                           id="url-${p.id}" value="${p.imagen || ''}" style="width: 80px; font-size: 10px; height: 35px;">
                    <label for="file-${p.id}" style="cursor: pointer; background: #28a745; color: white; padding: 8px; border-radius: 4px;">
                        📷 <input type="file" id="file-${p.id}" accept="image/*" capture="environment" 
                                   style="display: none;" onchange="subirFotoFila('${p.id}')">
                    </label>
                </div>
            </td>
            <td data-label="Acciones">
                <button onclick="eliminarProducto('${p.id}', '${nombreSeguro}')" 
                        style="background:#dc3545; color:white; border:none; padding:10px; width: 100%; border-radius:4px; height: 40px;">🗑️ Eliminar</button>
            </td>
        `;
        tablaCuerpo.appendChild(tr);
    });

    // Botón Cargar Más unificado
    const filaBoton = document.createElement("tr");
    filaBoton.innerHTML = `<td colspan="9" style="text-align:center; padding: 20px;"><button id="btn-cargar-mas" style="width: 100%; padding: 15px; background: #6c757d; color: white; border: none; border-radius: 8px;">⬇️ Cargar 50 más</button></td>`;
    tablaCuerpo.appendChild(filaBoton);
    document.querySelector("#btn-cargar-mas").addEventListener("click", () => cargarProductosAdmin(true));
    
    vincularEventosInputs();
}

// 5. EVENTOS DE EDICIÓN
function vincularEventosInputs() {
    const inputs = document.querySelectorAll('.input-edit');
    inputs.forEach(input => {
        input.addEventListener('input', (e) => {
            productosEditados.add(e.target.dataset.id);
            e.target.style.backgroundColor = "#fff3cd"; 
        });
    });
}

// 6. GUARDADO MASIVO (CORREGIDO)
if (btnGuardarTodo) {
    btnGuardarTodo.addEventListener("click", async () => {
        if (productosEditados.size === 0) return alert("No hay cambios para guardar.");
        
        const batch = db.batch();
        
        productosEditados.forEach(id => {
            const docRef = db.collection('productos').doc(id.toString());

            // Capturamos los valores
            const inputNombre = document.querySelector(`textarea[data-id="${id}"][data-campo="nombre"]`);
            const nuevoNombre = inputNombre ? inputNombre.value.trim().toUpperCase() : "";
            
            const nuevaCategoria = document.querySelector(`select[data-id="${id}"][data-campo="categoria"]`)?.value || "";
            const nuevoStock = Number(document.querySelector(`input[data-id="${id}"][data-campo="stock"]`)?.value || 0);
            const nuevoCosto = Number(document.querySelector(`input[data-id="${id}"][data-campo="costo"]`)?.value || 0);
            const nuevoPrecio = Number(document.querySelector(`input[data-id="${id}"][data-campo="precio"]`)?.value || 0);
            const nuevaImg = document.querySelector(`input[data-id="${id}"][data-campo="imagen"]`)?.value || "";
            const nuevoDetalle = document.querySelector(`textarea[data-id="${id}"][data-campo="detalle"]`)?.value || "";

            // OBJETO DE DATOS A ACTUALIZAR
            const datosAActualizar = {
                categoria: nuevaCategoria,
                stock: nuevoStock,
                costo: nuevoCosto,
                precio: nuevoPrecio,
                imagen: nuevaImg,
                detalle: nuevoDetalle,
                ultimaActualizacion: Date.now()
            };

            // PROTECCIÓN: Solo incluimos el nombre si NO está vacío
            if (nuevoNombre !== "") {
                datosAActualizar.nombre = nuevoNombre;
            }

            batch.update(docRef, datosAActualizar);
        });

        try {
            await batch.commit();
            alert("✅ ¡Cambios guardados con éxito!");
            productosEditados.clear(); // Limpiamos el set
            location.reload();
        } catch (error) {
            console.error("Error al guardar:", error);
            alert("Error al guardar. Revisa la consola.");
        }
    });
}

// 7. BUSCADOR INTELIGENTE (Cualquier ubicación, sin acentos, instantáneo)
if (buscadorAdmin) {
    buscadorAdmin.addEventListener("input", async (e) => {
        const terminoRaw = e.target.value.trim();
        const status = document.querySelector("#status-carga");
        
        // Función para normalizar: quita acentos y pasa a minúsculas
        const limpiar = (t) => 
            t.toString().toLowerCase()
             .normalize("NFD")
             .replace(/[\u0300-\u036f]/g, "");

        if (terminoRaw === "") {
            mostrarProductosAdmin(productosLocal);
            if (status) status.innerText = `✅ Mostrando productos recientes.`;
            return;
        }

        const busquedaLimpia = limpiar(terminoRaw);

        // FILTRADO TOTAL: Busca en el índice precargado (Cualquier posición)
        const coincidencias = indiceBusquedaCompleto.filter(p => {
            const nombreLimpio = limpiar(p.nombre);
            const idLimpio = p.id.toString();
            return nombreLimpio.includes(busquedaLimpia) || idLimpio.includes(busquedaLimpia);
        });

        if (coincidencias.length > 0) {
            if (status) status.innerText = `🔍 Encontrados ${coincidencias.length} productos...`;

            // Traemos los datos completos (precio, stock, etc) de los primeros 40 resultados
            const idsParaCargar = coincidencias.slice(0, 40).map(c => c.id);
            
            try {
                const promesas = idsParaCargar.map(id => db.collection("productos").doc(id).get());
                const docsResult = await Promise.all(promesas);
                
                const resultadosFinales = docsResult.map(doc => ({ id: doc.id, ...doc.data() }));
                mostrarProductosAdmin(resultadosFinales);
                
                // Ocultamos el botón "Cargar más" durante la búsqueda para evitar confusiones
                const btnMas = document.querySelector("#btn-cargar-mas");
                if (btnMas) btnMas.style.display = "none";
                
            } catch (err) {
                console.error("Error al traer detalles de búsqueda:", err);
            }
        } else {
            if (status) status.innerText = "❌ Sin coincidencias.";
            tablaCuerpo.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color: red;">No se encontró nada con "${terminoRaw}"</td></tr>`;
        }
    });
}

// 8. INICIO: Configuración de eventos cuando el HTML está listo
document.addEventListener("DOMContentLoaded", () => {
    // IMPORTANTE: Quitamos cargarProductosAdmin() de aquí. 
    // Ahora solo se ejecuta si el login es exitoso (ver paso 1 de tu admin.js).
    
    precargarIndiceBusqueda(); 

    const formNuevo = document.querySelector("#form-nuevo-producto");
    const statusCarga = document.getElementById('status-carga');

    if (formNuevo) {
        formNuevo.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            // Referencias a inputs
            const btnSubmit = formNuevo.querySelector('button[type="submit"]');
            const nombre = document.querySelector("#nuevo-nombre").value.trim();
            const categoria = document.querySelector("#nueva-categoria").value;
            const stock = Number(document.querySelector("#nuevo-stock").value);
            const costo = Number(document.querySelector("#nuevo-costo").value);
            const venta = Number(document.querySelector("#nuevo-venta").value);
            const link = document.querySelector("#nuevo-link").value.trim();

            try {
                // 1. Estado de "Cargando"
                btnSubmit.disabled = true;
                btnSubmit.innerText = "⏳ Guardando...";
                if (statusCarga) statusCarga.innerText = "Procesando nuevo producto...";

                // 2. Generar ID y armar objeto
                const nuevoId = await obtenerSiguienteIdProducto();
                const nuevoProducto = {
                    nombre: nombre.toUpperCase(),
                    categoria: categoria,
                    stock: stock,
                    costo: costo,
                    precio: venta,
                    imagen: link || "https://via.placeholder.com/150",
                    ultimaActualizacion: Date.now()
                };

                // 3. Guardar en Firestore
                await db.collection("productos").doc(nuevoId).set(nuevoProducto);
                
                // 4. Actualizar el índice de búsqueda local para que el buscador lo encuentre al instante
                indiceBusquedaCompleto.push({ id: nuevoId, nombre: nuevoProducto.nombre });

                // 5. Éxito: Limpiar y cerrar
                alert(`✅ Producto ${nuevoId} agregado correctamente.`);
                
                formNuevo.reset(); // Limpia los campos del formulario
                
                // Cerrar el panel si existe la función o el elemento
                const panelCarga = document.getElementById('container-nuevo-producto');
                if (panelCarga) panelCarga.style.display = 'none';

                // Recargar la tabla para mostrar el nuevo producto arriba
                cargarProductosAdmin(); 

            } catch (error) {
                console.error("Error al añadir producto:", error);
                alert("❌ Hubo un error al guardar. Revisa la consola.");
            } finally {
                // 6. Restaurar botón
                btnSubmit.disabled = false;
                btnSubmit.innerText = "AÑADIR A INVENTARIO";
                if (statusCarga) statusCarga.innerText = "✅ Operación finalizada.";
            }
        });
    }
});

// NUEVA FUNCIÓN: Trae nombres e IDs de toda la base de datos (Ligero)
async function precargarIndiceBusqueda() {
    try {
        const snap = await db.collection("productos").get();
        indiceBusquedaCompleto = snap.docs.map(doc => ({
            id: doc.id,
            nombre: doc.data().nombre || ""
        }));
        console.log("⚡ Buscador global listo.");
    } catch (e) {
        console.error("Error cargando índice:", e);
    }
}

async function eliminarProducto(id, nombre) {
    if (confirm(`¿Eliminar "${nombre}"?`)) {
        await db.collection("productos").doc(id).delete();
        location.reload();
    }
}

// 1. DECLARAMOS LA VARIABLE PRIMERO
const filtroStockAdmin = document.querySelector("#filtro-stock-admin");

// 2. SOLO EJECUTAMOS SI EL ELEMENTO EXISTE EN EL HTML
if (filtroStockAdmin) {
    filtroStockAdmin.addEventListener("change", (e) => {
        const valor = e.target.value;
        const status = document.querySelector("#status-carga");
        const btnMas = document.querySelector("#btn-cargar-mas");

        if (valor === "todos") {
            mostrarProductosAdmin(productosLocal);
            if (btnMas) btnMas.style.display = "block";
            if (status) status.innerText = `✅ Mostrando ${productosLocal.length} productos recientes.`;
            return;
        }

        if (btnMas) btnMas.style.display = "none";
        if (status) status.innerText = "🔍 Filtrando localmente...";

        let resultadosFiltrados = [];

        if (valor === "sin-stock") {
            resultadosFiltrados = productosLocal.filter(p => Number(p.stock || 0) === 0);
        } else if (valor === "stock-bajo") {
            resultadosFiltrados = productosLocal.filter(p => {
                const s = Number(p.stock || 0);
                return s >= 1 && s <= 3;
            });
        }

        if (resultadosFiltrados.length === 0) {
            // Asegúrate de que tablaCuerpo esté definido globalmente
            const tabla = document.querySelector("#tabla-cuerpo");
            if (tabla) {
                tabla.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px; color: #666;">No hay productos con esta condición.</td></tr>`;
            }
            if (status) status.innerText = "✅ Sin resultados.";
        } else {
            resultadosFiltrados.sort((a, b) => Number(a.stock) - Number(b.stock));
            mostrarProductosAdmin(resultadosFiltrados);
            if (status) status.innerText = `⚠️ Se encontraron ${resultadosFiltrados.length} productos.`;
        }
    });
}

// Lógica para subir la foto del producto NUEVO a Cloudinary
const inputFotoNuevo = document.getElementById('foto-archivo-nuevo');
if (inputFotoNuevo) {
    inputFotoNuevo.addEventListener('change', async (e) => {
        const archivo = e.target.files[0];
        const inputUrl = document.getElementById('nuevo-link');
        const statusCarga = document.getElementById('status-carga');

        if (!archivo) return;

        statusCarga.innerText = "⏳ Subiendo a Cloudinary...";
        statusCarga.style.color = "orange";

        try {
            const cloudName = 'dl5smwsbb'; 
            const uploadPreset = 'lindohogar';

            const formData = new FormData();
            formData.append('file', archivo);
            formData.append('upload_preset', uploadPreset);

            const respuesta = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
                method: 'POST',
                body: formData
            });
            
            if (!respuesta.ok) throw new Error("Error en Cloudinary");

            const datos = await respuesta.json();
            const urlOriginal = datos.secure_url;

            // --- APLICAMOS LA MISMA OPTIMIZACIÓN AQUÍ ---
            const urlOptimizada = urlOriginal.replace('/upload/', '/upload/w_800,c_limit,q_auto,f_auto/');

            // Ponemos la URL OPTIMIZADA en el input del formulario
            inputUrl.value = urlOptimizada;
            
            statusCarga.innerText = "✅ Imagen lista para añadir";
            statusCarga.style.color = "#28a745";

        } catch (error) {
            console.error(error);
            statusCarga.innerText = "❌ Error al subir a Cloudinary";
            statusCarga.style.color = "red";
        }
    });
}

async function subirFotoFila(idProducto) {
    const fileInput = document.getElementById(`file-${idProducto}`);
    const inputTexto = document.getElementById(`url-${idProducto}`);
    const archivo = fileInput.files[0];

    if (!archivo) return;

    // Feedback visual en el input de la tabla
    inputTexto.value = "⏳ Subiendo...";

    try {
        // --- CONFIGURACIÓN CLOUDINARY ---
        const cloudName = 'dl5smwsbb'; 
        const uploadPreset = 'lindohogar'; // Debe ser "Unsigned" en Cloudinary

        const formData = new FormData();
        formData.append('file', archivo);
        formData.append('upload_preset', uploadPreset);

        // 1. Subir imagen a Cloudinary
        const respuesta = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
            method: 'POST',
            body: formData
        });

        if (!respuesta.ok) throw new Error("Error en la subida a Cloudinary");

        const datos = await respuesta.json();
const urlOriginal = datos.secure_url;

// --- AQUÍ ESTÁ LA MAGIA DE LA OPTIMIZACIÓN ---
// Esto le dice a Cloudinary: 
// 1. w_800: Achica el ancho máximo a 800 píxeles.
// 2. c_limit: Si la foto original es más chica, no la estires.
// 3. q_auto: Comprime automáticamente manteniendo buena calidad visual.
// 4. f_auto: Elige automáticamente el formato más liviano (WebP, por ejemplo).
const urlOptimizada = urlOriginal.replace('/upload/', '/upload/w_800,c_limit,q_auto,f_auto/');

// 2. Actualizar el input de texto con la URL OPTIMIZADA
inputTexto.value = urlOptimizada;

// 3. Guardar el cambio en Firebase Firestore inmediatamente con la URL OPTIMIZADA
await db.collection('productos').doc(idProducto.toString()).update({
    imagen: urlOptimizada, // Guardamos la versión liviana
    ultimaActualizacion: Date.now()
});

        // Feedback de éxito
        inputTexto.style.backgroundColor = "#d4edda"; 
        alert("✅ Foto actualizada correctamente en Cloudinary y Firebase.");

    } catch (error) {
        console.error("Error Cloudinary:", error);
        alert("❌ Error al subir. Verifica que el preset 'lindohogar' esté como 'Unsigned' en Cloudinary.");
        inputTexto.value = ""; 
    }
}

// ...existing code...

async function cargarPedidosPendientes() {
    try {
        const snapshot = await db.collection("pedidos")
            .where("estado", "==", "fiado")
            .orderBy("creadoAt", "desc")
            .get();

        const contenedor = document.getElementById("contenedor-pedidos-admin");
        if (!contenedor) return;

        if (snapshot.empty) {
            contenedor.innerHTML = "<p class='text-center text-muted'>Sin pedidos pendientes</p>";
            return;
        }

        contenedor.innerHTML = snapshot.docs.map(doc => {
            const pedido = doc.data();
            return `
                <div class="card mb-3 shadow-sm">
                    <div class="card-body">
                        <div class="row align-items-center">
                            <div class="col-md-6">
                                <h6 class="fw-bold">${pedido.clienteNombre}</h6>
                                <small class="text-muted">${pedido.clienteEmail}</small>
                                <ul class="list-unstyled small mt-2">
                                    ${pedido.items.map(item => 
                                        `<li>• ${item.cantidad}x ${item.nombre}</li>`
                                    ).join("")}
                                </ul>
                            </div>
                            <div class="col-md-3 text-center">
                                <p class="fw-bold mb-0">$${pedido.total.toLocaleString()}</p>
                                <small class="text-muted">PENDIENTE</small>
                            </div>
                            <div class="col-md-3 d-flex gap-2">
                                <button class="btn btn-success btn-sm w-100"
                                        onclick="confirmarPedido('${doc.id}')">
                                    ✅ CONFIRMAR
                                </button>
                                <button class="btn btn-danger btn-sm w-100"
                                        onclick="rechazarPedido('${doc.id}')">
                                    ❌ RECHAZAR
                                </button>
                            </div>
                        </div>
                    </div>
                </div>`;
        }).join("");

    } catch (error) {
        console.error("Error cargando pedidos:", error);
    }
}

async function confirmarPedido(pedidoId) {
    if (!confirm("¿Confirmar este pedido?")) return;

    try {
        await db.collection("pedidos").doc(pedidoId).update({
            estado: "finalizada",
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert("✅ Pedido confirmado");
        cargarPedidosPendientes();
    } catch (error) {
        console.error(error);
    }
}

async function rechazarPedido(pedidoId) {
    if (!confirm("¿Rechazar este pedido? Se devolverá el stock.")) return;

    try {
        const pedidoRef = db.collection("pedidos").doc(pedidoId);
        const pedidoSnap = await pedidoRef.get();
        
        if (!pedidoSnap.exists) return alert("Pedido no encontrado");

        const pedido = pedidoSnap.data();
        const batch = db.batch();

        // Rechazar pedido
        batch.update(pedidoRef, {
            estado: "rechazada",
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Devolver stock
        pedido.items.forEach(item => {
            const prodRef = db.collection("productos").doc(item.id.toString());
            batch.update(prodRef, {
                stock: firebase.firestore.FieldValue.increment(item.cantidad)
            });
        });

        await batch.commit();

        alert("❌ Pedido rechazado y stock devuelto");
        cargarPedidosPendientes();
    } catch (error) {
        console.error(error);
    }
}

async function resetearStockATodo() {
    const confirmar = confirm("⚠️ ¿Estás seguro? Esto pondrá el stock de TODOS los productos en 0.");
    if (!confirmar) return;

    try {
        const snapshot = await db.collection("productos").get();
        const batch = db.batch();

        snapshot.forEach((doc) => {
            const docRef = db.collection("productos").doc(doc.id);
            batch.update(docRef, { stock: 0 });
        });

        await batch.commit();
        alert("✅ ¡Listo! Todos los productos ahora tienen stock 0.");
        location.reload(); // Recarga para ver los cambios
    } catch (error) {
        console.error("Error al resetear stock:", error);
        alert("Hubo un error al procesar el cambio masivo.");
    }
}

// Descomenta la línea de abajo para que se ejecute al cargar la página:
//resetearStockATodo();

