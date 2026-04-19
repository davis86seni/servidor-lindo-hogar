const db = window.db;
const auth = window.auth || firebase.auth();
const admins = ["davis86seni@gmail.com", "elenaisabelceballos@gmail.com"];

// --- 1. SEGURIDAD Y LOGIN ---
firebase.auth().onAuthStateChanged((user) => {
    if (user && admins.includes(user.email)) {
        console.log("✅ Acceso concedido a:", user.email);
        obtenerProductosIniciales();
        cargarClientes();
        cargarPedidosPendientes();  // ← AGREGAR ESTA LÍNEA
    } else {
        console.warn("❌ Acceso denegado");
        window.location.href = "index.html";
    }
});

const tablaClientes = document.querySelector("#tabla-clientes");
const formCliente = document.querySelector("#form-nuevo-cliente");
let productosSeleccionados = []; 

// Cambiamos el nombre para que no choque con otros archivos
let misProductosParaVenta = [];

async function obtenerProductosIniciales() {
    try {
        const snap = await db.collection('productos').limit(100).get();
        // Guardamos en la variable correcta
        misProductosParaVenta = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("✅ Productos cargados para ventas:", misProductosParaVenta.length);
    } catch (error) {
        console.error("❌ Error cargando productos iniciales:", error);
    }
}

// --- REGISTRO DE GASTOS DE ENVÍO ---
document.addEventListener("click", async (e) => {
    if (e.target && e.target.id === "btn-guardar-gasto") {
        const monto = Number(document.getElementById("monto-gasto").value);
        const desc = document.getElementById("desc-gasto").value;
        if (!monto || !desc) return alert("Ingresa monto y descripción.");
        const ahora = new Date();
        const hoy = ahora.getFullYear() + '-' + 
            String(ahora.getMonth() + 1).padStart(2, '0') + '-' + 
            String(ahora.getDate()).padStart(2, '0');
        try {
            await db.collection("gastos_compras").add({
                fecha: hoy,
                monto: monto,
                descripcion: desc,
                timestamp: Date.now()
            });
            alert("✅ Gasto registrado.");
            document.getElementById("monto-gasto").value = "";
            document.getElementById("desc-gasto").value = "";
        } catch (error) { console.error(error); }
    }
});

// --- CARGAR CLIENTES ---
async function cargarClientes() {
    try {
        const tablaClientes = document.getElementById("tabla-clientes");
        const buscarTexto = (document.getElementById("buscar-cliente")?.value || "").toLowerCase().trim();
        const filtroEstado = document.getElementById("filtro-estado")?.value || "todos";

        if (filtroEstado === "todos" && buscarTexto.length < 3) {
            tablaClientes.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:30px; color:#999;'>Escribí al menos 3 letras o elegí un estado...</td></tr>";
            return;
        }

        const snapshot = await db.collection('clientes').orderBy("nombre", "asc").get();
        tablaClientes.innerHTML = "";
        let encontrados = 0;

        snapshot.docs.forEach(doc => {
            const c = doc.data();
            const clienteId = doc.id;
            const nombre = (c.nombre || "").toLowerCase();
            const dni = (c.dni || "").toString();
            const saldo = c.saldoPendiente || 0;
            const tieneDeuda = saldo > 0;

            // Filtrado lógico
            if (filtroEstado === "solo-fiados" && !tieneDeuda) return;
            if (filtroEstado === "solo-al-dia" && tieneDeuda) return;
            if (buscarTexto !== "" && !nombre.includes(buscarTexto) && !dni.includes(buscarTexto)) return;

            encontrados++;

            const cartelFiado = tieneDeuda 
                ? `<div style="background: #fff3cd; color: #856404; border: 1px solid #ffeeba; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-top: 8px; display: inline-block;">⚠️ FIADO: $${saldo.toLocaleString()}</div>` 
                : `<div style="color: #28a745; font-size: 11px; font-weight: bold; margin-top: 8px;">✅ AL DÍA</div>`;
            const emailCliente = (c.email || "").toString().trim();
            const cartelVinculo = emailCliente
                ? `<div style="margin-top:6px; font-size: 11px; color:#2c3e50;">📧 ${emailCliente}</div>`
                : `<div style="margin-top:6px; font-size: 11px; color:#999;">📧 Sin Gmail vinculado</div>`;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td data-label="Nombre"><strong>${c.nombre}</strong></td>
                <td data-label="DNI">${c.dni || '-'}</td> 
                <td data-label="WhatsApp">${c.telefono || '-'}</td>
                <td data-label="Dirección">${c.direccion || '-'}</td>
                <td data-label="Acciones">
                    <div style="display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end;">
                        <button onclick="abrirModalVenta('${clienteId}', '${c.nombre}')" style="background: #28a745; color: white; border: none; padding: 10px; cursor: pointer; border-radius: 5px; flex: 1;">➕ Venta</button>
                        <button onclick="verHistorial('${clienteId}')" style="background: #007bff; color: white; border: none; padding: 10px; cursor: pointer; border-radius: 5px; flex: 1;">📋 Ver</button>
                        <button onclick="vincularClienteConGmail('${clienteId}')" style="background: #6f42c1; color: white; border: none; padding: 10px; cursor: pointer; border-radius: 5px; flex: 1;">🔗 Gmail</button>
                        <button onclick="eliminarCliente('${clienteId}')" style="background: #dc3545; color: white; border: none; padding: 10px; cursor: pointer; border-radius: 5px;">🗑️</button>
                    </div>
                    ${cartelFiado}
                    ${cartelVinculo}
                </td>`;
            tablaClientes.appendChild(tr);
        });

        if (encontrados === 0) {
            tablaClientes.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:20px;'>No se encontraron resultados.</td></tr>";
        }
    } catch (error) {
        console.error("Error cargando clientes:", error);
        if (error.code === 'permission-denied') {
            alert("No tienes permiso para leer clientes. Revisa las reglas de Firestore.");
        }
    }
}

// FUNCIÓN AUXILIAR PARA EL BOTÓN DE WHATSAPP
async function compartirUltimaVenta(clienteId, nombre, telefono) {
    try {
        const ventasSnap = await db.collection('ventas_globales')
            .where('clienteId', '==', clienteId) 
            .get();

        let detalleDeuda = "";
        let totalGeneralPendiente = 0;

        ventasSnap.forEach(doc => {
            const v = doc.data();
            
            if (v.estado === "fiado") {
                // LÓGICA CORREGIDA:
                // En tu base de datos, el 'total' YA ES el saldo después de entregas.
                // Solo debemos restar el 'descuentoAplicado' si existe.
                const saldoEnBaseDeDatos = Number(v.total) || 0;
                const descuento = Number(v.descuentoAplicado) || 0;

                const saldoRealParaMensaje = saldoEnBaseDeDatos - descuento;
                
                if (saldoRealParaMensaje > 0) {
                    detalleDeuda += `\n• *${v.detalle}*\n  Saldo: $${saldoRealParaMensaje.toLocaleString()}\n`;
                    totalGeneralPendiente += saldoRealParaMensaje;
                }
            }
        });

        if (totalGeneralPendiente > 0) {
            const mensaje = encodeURIComponent(
                `Hola *${nombre}*, te escribo de *Lindo Hogar* 🏠.\n\n` +
                `Te envío el resumen de tus saldos pendientes:\n` +
                `${detalleDeuda}\n` +
                `*TOTAL A PAGAR: $${totalGeneralPendiente.toLocaleString()}*\n\n` 
            );

            const link = `https://wa.me/${telefono.replace(/\D/g,'')}?text=${mensaje}`;
            window.open(link, '_blank');
        } else {
            alert("Este cliente no tiene saldos pendientes.");
        }

    } catch (error) {
        console.error("Error:", error);
        alert("Error al conectar con la base de datos.");
    }
}

// --- MODAL DE VENTA ---
function abrirModalVenta(clienteId, nombreCliente) {
    productosSeleccionados = []; 
    const modalHTML = `
        <div id="modal-venta" class="modal" style="display:block; position: fixed; z-index: 2000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7);">
            <div class="modal-contenido" style="background: white; margin: 2% auto; padding: 20px; width: 90%; max-width: 550px; border-radius: 10px; max-height: 90vh; overflow-y: auto;">
                <span style="float:right; cursor:pointer; font-size:24px;" onclick="this.parentElement.parentElement.remove()">&times;</span>
                <h3>Venta para: ${nombreCliente}</h3>
                
                <label>Buscar Producto:</label>
                <input type="text" id="busqueda-prod-modal" placeholder="Escribe para buscar..." style="width:100%; padding:10px; margin-bottom:5px;">
                
                <!-- IMPORTANTE: El select donde aparecen los productos -->
                <select id="prod-sel" size="6" style="width:100%; padding:10px; border-radius:5px; border: 1px solid #ccc;"></select>
                
                <button onclick="agregarAListaVenta()" style="width:100%; background:#6c757d; color:white; border:none; padding:12px; margin-top:10px; border-radius:5px; font-weight:bold; cursor:pointer;">
                    ➕ AÑADIR A LA LISTA
                </button>

                <div id="lista-previa-venta" style="margin-top:15px; background:#f8f9fa; padding:10px; border-radius:8px; border:1px solid #ddd;">
                    <ul id="items-venta" style="list-style:none; padding:0;"></ul>
                    <div style="display:flex; justify-content: space-between; align-items: center; border-top:1px solid #ccc; padding-top:10px;">
                        <span>Descuento ($):</span>
                        <input type="number" id="descuento-venta" value="0" oninput="actualizarVistaLista()" style="width:80px; padding:5px;">
                    </div>
                    <p style="text-align:right; font-weight:bold; margin-top:5px;">Total: <strong id="total-venta-modal" style="color: #28a745;">$0</strong></p>
                </div>

                <div style="background: #eee; padding: 15px; border-radius: 8px; margin: 15px 0; text-align:center;">
                    <input type="radio" id="r-pago" name="est" value="pagado" checked> <label for="r-pago">✅ Contado</label>
                    <input type="radio" id="r-fiado" name="est" value="fiado" style="margin-left:15px;"> <label for="r-fiado">🚩 Fiado</label>
                </div>

                <button onclick="confirmarVentaMasiva('${clienteId}')" style="width:100%; padding:15px; background:#007bff; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;">
                    REGISTRAR TODA LA VENTA
                </button>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Escuchador de teclado para el buscador
    const inputBusqueda = document.getElementById('busqueda-prod-modal');
    inputBusqueda.addEventListener('input', (e) => {
        filtrarProductosModal(e.target.value);
    });

    // ¡ESTA LÍNEA ES LA CLAVE! Carga la lista apenas se abre el modal
    filtrarProductosModal(""); 
}

async function filtrarProductosModal(t) {
    const selectProds = document.getElementById('prod-sel');
    if (!selectProds) return;

    const busqueda = t.toLowerCase().trim();
    if (busqueda.length < 2 && t !== "") return; // Espera a que escriba al menos 2 letras

    try {
        // Consultamos directamente a la colección para asegurarnos de traer lo último
        const snap = await db.collection('productos').get();
        let productosCargados = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        let filtrados = productosCargados.filter(p => {
            const nombreProd = (p.nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const busquedaLimpia = busqueda.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return nombreProd.includes(busquedaLimpia);
        });

        if (filtrados.length === 0) {
            selectProds.innerHTML = `<option disabled>❌ No se encontró "${t}"</option>`;
        } else {
            selectProds.innerHTML = filtrados.map(p => `
                <option value="${p.id}">
                    ${p.nombre.toUpperCase()} - $${(p.precio || 0).toLocaleString()} (Stock: ${p.stock || 0})
                </option>`).join('');
            selectProds.selectedIndex = 0;
        }
    } catch (error) {
        console.error("Error en búsqueda:", error);
    }
}

async function agregarAListaVenta() {
    const select = document.getElementById('prod-sel');
    if (!select.value || select.value.includes("No se encontró")) return alert("Selecciona un producto válido");
    
    try {
        // Traemos el producto exacto de Firebase para evitar errores de variable
        const doc = await db.collection('productos').doc(select.value).get();
        if (doc.exists) {
            const pReal = { id: doc.id, ...doc.data() };
            productosSeleccionados.push(pReal);
            actualizarVistaLista();
            // Limpiamos el buscador para la siguiente prenda
            document.getElementById('busqueda-prod-modal').value = "";
        }
    } catch (e) {
        console.error(e);
    }
}

function actualizarVistaLista() {
    const listaUI = document.getElementById('items-venta');
    const totalUI = document.getElementById('total-venta-modal');
    const descuento = parseFloat(document.getElementById('descuento-venta').value) || 0;

    listaUI.innerHTML = productosSeleccionados.map((p, index) => `
        <li style="display:flex; justify-content:space-between; margin-bottom:5px;">
            ${p.nombre} - $${p.precio}
            <button onclick="productosSeleccionados.splice(${index},1); actualizarVistaLista()" style="color:red; border:none; background:none; cursor:pointer;">❌</button>
        </li>`).join('');

    const subtotal = productosSeleccionados.reduce((acc, p) => acc + p.precio, 0);
    totalUI.innerText = `$${(subtotal - descuento).toLocaleString()}`;
}

async function confirmarVentaMasiva(clienteId) {
    if (productosSeleccionados.length === 0) return alert("No hay productos");
    
    const estado = document.querySelector('input[name="est"]:checked').value;
    const descuento = parseFloat(document.getElementById('descuento-venta').value) || 0;
    const subtotal = productosSeleccionados.reduce((acc, p) => acc + p.precio, 0);
    const totalVenta = subtotal - descuento;

    // --- NUEVO: Manejo de entrega inicial para fiados ---
    let montoEntregaInicial = 0;
    if (estado === "pagado") {
        montoEntregaInicial = totalVenta;
    } else {
        const respuesta = prompt("¿Cuánto entrega de seña/inicial? (Escribe 0 si no entrega nada)", "0");
        montoEntregaInicial = parseFloat(respuesta) || 0;
    }

    try {
        const clienteRef = db.collection('clientes').doc(clienteId);
        const clienteSnap = await clienteRef.get();
        if (!clienteSnap.exists) {
            return alert("No se encontró el cliente. No se registró la venta.");
        }

        const batch = db.batch();
        const refCompraGlobal = db.collection('ventas_globales').doc();
        const refCompraCliente = clienteRef.collection('compras').doc(refCompraGlobal.id);

        const ahora = Date.now(); 
        const fechaLegible = new Date().toLocaleString(); // Fecha y hora para el historial

        const historialInicial = [];
        if (montoEntregaInicial > 0) {
            historialInicial.push({
                fecha: fechaLegible,
                monto: montoEntregaInicial,
                timestamp: ahora,
                detalle: estado === "pagado" ? "Pago total contado" : "Entrega inicial / Seña"
            });
        }

        const ventaData = {
            clienteId: clienteId,
            nombreCliente: document.querySelector("h3").innerText.replace("Venta para: ", ""), 
            productosDetalle: productosSeleccionados.map(p => ({ id: p.id, nombre: p.nombre, precio: p.precio, costo: p.costo || 0, cantidad: Number(p.cantidad || 1) })),
            detalle: productosSeleccionados.map(p => `${p.cantidad || 1}x ${p.nombre} ($${p.precio})`).join(", "),
            subtotal: subtotal,
            descuentoAplicado: descuento,
            total: totalVenta,
            costoTotal: productosSeleccionados.reduce((acc, p) => acc + (p.costo || 0), 0),
            entregaParcial: montoEntregaInicial, 
            historialPagos: historialInicial, 
            timestamp: ahora, 
            fecha: new Date().toLocaleDateString(), 
            fechaObjeto: firebase.firestore.Timestamp.now(), 
            estado: estado
        };

        // GUARDAR EN AMBOS LADOS: ventas_globales Y clientes/{id}/compras
        batch.set(refCompraGlobal, ventaData);
        batch.set(refCompraCliente, ventaData);

        if (estado === "fiado") {
            const saldoRestante = totalVenta - montoEntregaInicial;
            console.log("[venta] saldoRestante:", saldoRestante);
            batch.update(clienteRef, { 
                saldoPendiente: firebase.firestore.FieldValue.increment(saldoRestante) 
            });
        }

        productosSeleccionados.forEach(sel => {
            const refProd = db.collection('productos').doc(sel.id);
            console.log("[venta] disminuir stock producto:", sel.id);
            batch.update(refProd, { stock: firebase.firestore.FieldValue.increment(-1) });
        });

        console.log("[venta] guardando venta en cliente y globales...");
        
        // PRIMERO: Guardar EN CLIENTE (lo más importante)
        try {
            const clienteBatch = db.batch();
            clienteBatch.set(refCompraCliente, ventaData);
            
            if (estado === "fiado") {
                const saldoRestante = totalVenta - montoEntregaInicial;
                clienteBatch.update(clienteRef, { 
                    saldoPendiente: firebase.firestore.FieldValue.increment(saldoRestante) 
                });
            }

            productosSeleccionados.forEach(sel => {
                const cantidad = Number(sel.cantidad || 1);
                const refProd = db.collection('productos').doc(sel.id);
                clienteBatch.update(refProd, { 
                    stock: firebase.firestore.FieldValue.increment(-cantidad),
                    ultimaActualizacion: Date.now()
                });
            });

            await clienteBatch.commit();
            console.log("[venta] ✅ Venta guardada en cliente");
            
            // SEGUNDO: Intentar guardar en ventas_globales (sin bloquear si falla)
            try {
                await refCompraGlobal.set(ventaData);
                console.log("[venta] ✅ Venta registrada en ventas_globales");
            } catch (eGlobal) {
                console.warn("[venta] ⚠️ No se pudo guardar en ventas_globales (no es crítico):", eGlobal.message);
            }
        } catch (e) {
            console.error("[venta] ❌ Error crítico:", e);
            throw e;
        }
        alert("✅ Venta registrada y stock actualizado");
        
        const modal = document.getElementById('modal-venta');
        if (modal) modal.remove();
        productosSeleccionados = [];
        
    } catch (e) { 
        console.error("Error en la venta:", e); 
        alert("Hubo un error al procesar la venta.");
    }
}

// --- HISTORIAL ---
async function verHistorial(clienteId) {
    try {
        const clienteDoc = await db.collection('clientes').doc(clienteId).get();
        const datosCliente = clienteDoc.data();
        
        const telefonoCliente = datosCliente.whatsapp || datosCliente.telefono || "";

        // Cargar SOLO de clientes/{id}/compras (más confiable, sin índices)
        const snapshotCompras = await db.collection('clientes').doc(clienteId)
            .collection('compras').orderBy("fechaObjeto", "desc").limit(50).get();

        const historialCompleto = [];
        
        snapshotCompras.forEach(doc => {
            historialCompleto.push({
                id: doc.id,
                datos: doc.data(),
                origen: 'compras'
            });
        });
        
        console.log("[historial] Compras del cliente cargadas:", snapshotCompras.size);

        let historialHTML = `
            <div id="modal-historial" class="modal" style="display:block; position: fixed; z-index: 2100; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8);">
                <div class="modal-contenido" style="background: white; margin: 2% auto; padding: 20px; width: 95%; max-width: 700px; border-radius: 12px; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                    <span style="float:right; cursor:pointer; font-size:30px; font-weight:bold; color:#999;" onclick="this.parentElement.parentElement.remove()">&times;</span>
                    <h2 style="margin-bottom:10px; color:#2c3e50; font-family:sans-serif;">Historial: ${datosCliente.nombre}</h2> 
                    
                    <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <button onclick="abrirModalEditarCliente('${clienteId}')" style="background:#f1c40f; color:#2c3e50; border:none; padding:10px 15px; border-radius:6px; cursor:pointer; font-weight:bold; display:flex; align-items:center; gap:8px;">
                            ✏️ EDITAR DATOS
                        </button>
                        <div style="background:#ebf5fb; padding:10px 15px; border-radius:8px; border:1px solid #aed6f1;">
                            <span style="font-size:13px; color:#5d6d7e;">DEUDA ACTUAL:</span>
                            <strong style="font-size:18px; color:#c0392b; margin-left:10px;">$${(datosCliente.saldoPendiente || 0).toLocaleString()}</strong>
                        </div>
                    </div>

                    <table style="width:100%; border-collapse: collapse; font-family: sans-serif; font-size: 14px;">
                        <thead>
                            <tr style="background:#34495e; color:white; text-align:left;">
                                <th style="padding:12px; border-bottom:2px solid #2c3e50;">Fecha / Detalle</th>
                                <th style="padding:12px; border-bottom:2px solid #2c3e50;">Pagos / Entregas</th>
                                <th style="padding:12px; border-bottom:2px solid #2c3e50;">Saldo Venta</th>
                                <th style="padding:12px; border-bottom:2px solid #2c3e50; text-align:center;">Acción</th>
                            </tr>
                        </thead>
                        <tbody>`;

        if (historialCompleto.length === 0) {
            historialHTML += `<tr><td colspan="4" style="text-align:center; padding:40px; color:#95a5a6;">No hay movimientos registrados.</td></tr>`;
        }

        historialCompleto.forEach(registro => {
            const c = registro.datos;
            const docId = registro.id;
            const sourceId = `${registro.origen}-${docId}`;
            const esFiado = c.estado === "fiado" || c.estado === "fiado_confirmado";
            const pagos = c.historialPagos || [];
            
            // Limpiamos el detalle de comillas y saltos de línea para evitar errores de JS
            const detalleSeguro = (c.detalle || "Sin detalles").replace(/['"`]/g, '').replace(/\r?\n|\r/g, ' ');

            historialHTML += `
                <tr style="border-bottom:1px solid #dcdde1; background: ${esFiado ? '#fffdf2' : 'white'};">
                    <td style="padding:12px; vertical-align:top;">
                        <div style="font-size:11px; color:#7f8c8d; margin-bottom:4px;">${c.fecha || "Sin fecha"}</div>
                        <div style="font-weight:bold; color:#2c3e50;">${c.detalle || "Sin detalles"}</div>
                        ${c.descuentoAplicado > 0 ? `<div style="color:#e74c3c; font-size:11px; margin-top:3px;">🔻 Desc: -$${c.descuentoAplicado.toLocaleString()}</div>` : ''}
                    </td>
                    <td style="padding:12px; vertical-align:top;">
                        ${pagos.length > 0 ? 
                            pagos.map(p => `<div style="font-size:11px; color:#27ae60; margin-bottom:2px;">• ${p.fecha.split(',')[0]}: <strong>$${p.monto.toLocaleString()}</strong></div>`).join('') 
                            : '<span style="color:#bdc3c7; font-size:11px;">Sin entregas parciales</span>'
                        }
                    </td>
                    <td style="padding:12px; font-weight:bold; font-size:16px; color:${esFiado ? '#c0392b' : '#27ae60'}; vertical-align:top;">
                        $${c.total.toLocaleString()}
                        <div style="font-size:10px; font-weight:normal; color:#95a5a6;">${esFiado ? 'PENDIENTE' : 'PAGADO'}</div>
                    </td>
                    <td style="padding:12px; text-align:center; vertical-align:middle;">
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            ${esFiado ? 
                                `<button onclick="cobrarDeuda('${clienteId}', '${sourceId}')" style="background:#27ae60; color:white; border:none; padding:8px; border-radius:5px; font-weight:bold; cursor:pointer; font-size:12px;">COBRAR</button>
                                 
                                 <button onclick="enviarWhatsappVenta('${datosCliente.nombre}', '${telefonoCliente}', '${detalleSeguro}', ${c.total})" 
                                         style="background:#25D366; color:white; border:none; padding:8px; border-radius:5px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                                    <svg width="18" height="18" viewBox="0 0 32 32" aria-hidden="true" focusable="false" style="display:block; fill:white;">
                                        <path d="M19.11 17.17c-.29-.15-1.72-.85-1.99-.95-.27-.1-.46-.15-.66.15-.2.29-.76.95-.93 1.14-.17.2-.34.22-.63.07-.29-.15-1.22-.45-2.33-1.44-.86-.76-1.44-1.7-1.61-1.99-.17-.29-.02-.44.13-.59.13-.13.29-.34.44-.51.15-.17.2-.29.29-.49.1-.2.05-.37-.02-.51-.07-.15-.66-1.58-.9-2.16-.24-.58-.48-.5-.66-.51h-.56c-.2 0-.51.07-.78.37-.27.29-1.02.99-1.02 2.41 0 1.41 1.04 2.78 1.19 2.97.15.2 2.04 3.12 4.95 4.38.69.29 1.22.47 1.64.6.69.22 1.32.19 1.82.12.56-.08 1.72-.7 1.97-1.37.24-.66.24-1.22.17-1.34-.07-.12-.27-.2-.56-.34z"/>
                                        <path d="M16.02 3.2c-7.05 0-12.78 5.73-12.78 12.78 0 2.25.59 4.45 1.72 6.39L3.2 28.8l6.58-1.72c1.87 1.02 3.98 1.56 6.24 1.56h.01c7.05 0 12.78-5.73 12.78-12.78S23.07 3.2 16.02 3.2zm7.45 20.21c-.32.9-1.57 1.72-2.56 1.94-.68.15-1.56.27-5.08-1.08-4.5-1.72-7.41-6.18-7.63-6.47-.22-.29-1.83-2.43-1.83-4.64s1.16-3.29 1.57-3.75c.41-.46.9-.58 1.2-.58.29 0 .61 0 .88.02.28.01.66-.11 1.03.78.39.93 1.32 3.2 1.44 3.43.12.24.2.51.05.8-.15.29-.22.51-.44.78-.22.27-.46.6-.66.8-.22.22-.44.46-.19.9.24.44 1.09 1.8 2.34 2.92 1.61 1.44 2.97 1.89 3.41 2.11.44.22.7.2.96-.12.27-.32 1.1-1.28 1.39-1.72.29-.44.58-.37.98-.22.39.15 2.48 1.17 2.9 1.39.41.22.68.32.78.49.1.17.1.98-.22 1.87z"/>
                                    </svg>
                                 </button>` 
                                : 
                                `<span style="background:#d4efdf; color:#1e8449; padding:5px; border-radius:4px; font-size:11px; font-weight:bold;">COMPLETO</span>`
                            }
                            <button onclick="eliminarCompraHistorial('${clienteId}', '${sourceId}', '${registro.origen}')" style="border:none; color:#e74c3c; background:none; cursor:pointer; font-size:20px;" title="Eliminar registro">🗑️</button>
                        </div>
                    </td>
                </tr>`;
        });

        historialHTML += `</tbody></table></div></div>`;
        document.body.insertAdjacentHTML('beforeend', historialHTML);
    } catch (e) { 
        console.error("Error historial:", e);
        alert("⚠️ Error al cargar el historial:\n" + (e.message || e));
    }
}


// FUNCION AUXILIAR PARA EL ENVIO
function enviarWhatsappVenta(nombre, telefono, detalle, saldo) {
    if (!telefono) {
        alert("El cliente no tiene teléfono registrado.");
        return;
    }
    const mensaje = encodeURIComponent(
        `Hola *${nombre}*, te escribimos de *Lindo Hogar* 🏠.\n\n` +
        `Te compartimos el detalle de tu saldo pendiente:\n` +
        `• *${detalle}*\n` +
        `*Saldo actual: $${saldo.toLocaleString()}*\n\n` 
    );
    window.open(`https://wa.me/${telefono.replace(/\D/g,'')}?text=${mensaje}`, '_blank');
}

// --- FUNCIÓN PARA EDITAR CLIENTE (LA QUE TE DABA ERROR EN ROJO) ---
async function abrirModalEditarCliente(id) {
    try {
        const doc = await db.collection('clientes').doc(id).get();
        if (!doc.exists) return alert("Cliente no encontrado");
        const c = doc.data();

        const modalEditarHTML = `
            <div id="modal-editar-cliente" class="modal" style="display:block; position: fixed; z-index: 3000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8);">
                <div class="modal-contenido" style="background: white; margin: 10% auto; padding: 25px; width: 90%; max-width: 400px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                    <span style="float:right; cursor:pointer; font-size:28px;" onclick="this.parentElement.parentElement.remove()">&times;</span>
                    <h3 style="margin-top:0;">Actualizar Cliente</h3>
                    
                    <div style="margin-bottom:15px;">
                        <label style="display:block; font-size:13px; font-weight:bold; margin-bottom:5px;">Nombre Completo:</label>
                        <input type="text" id="edit-nombre" value="${c.nombre || ''}" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:5px; box-sizing:border-box;">
                    </div>
                    
                    <div style="margin-bottom:15px;">
                        <label style="display:block; font-size:13px; font-weight:bold; margin-bottom:5px;">DNI:</label>
                        <input type="text" id="edit-dni" value="${c.dni || ''}" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:5px; box-sizing:border-box;">
                    </div>
                    
                    <div style="margin-bottom:15px;">
                        <label style="display:block; font-size:13px; font-weight:bold; margin-bottom:5px;">Teléfono / WhatsApp:</label>
                        <input type="text" id="edit-tel" value="${c.telefono || ''}" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:5px; box-sizing:border-box;">
                    </div>
                    
                    <div style="margin-bottom:20px;">
                        <label style="display:block; font-size:13px; font-weight:bold; margin-bottom:5px;">Dirección:</label>
                        <input type="text" id="edit-dir" value="${c.direccion || ''}" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:5px; box-sizing:border-box;">
                    </div>
                    
                    <button onclick="guardarCambiosCliente('${id}')" style="width:100%; background:#27ae60; color:white; border:none; padding:14px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:16px;">
                        💾 GUARDAR CAMBIOS
                    </button>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalEditarHTML);
    } catch (error) {
        console.error("Error al abrir edición:", error);
    }
}

async function cobrarDeuda(clienteId, compraId) {
    const montoEntregaStr = prompt("¿Cuánto entregó el cliente?");
    if (!montoEntregaStr || isNaN(montoEntregaStr)) return;
    const montoEntrega = parseFloat(montoEntregaStr);
    const ahora = Date.now();
    const fechaHoy = new Date().toLocaleString(); 

    try {
        // Detectar si compraId viene en el formato "origen-docId" (del historial) o simple ID (antiguo)
        let origen = 'compras';
        let docId = compraId;
        
        if (compraId.includes('-')) {
            const partes = compraId.split('-');
            origen = partes[0]; // 'compras' o 'ventas_globales'
            docId = partes.slice(1).join('-'); // El resto es el docId
        }

        const clienteRef = db.collection('clientes').doc(clienteId);
        let compraRef, compraDoc;

        if (origen === 'compras') {
            compraRef = clienteRef.collection('compras').doc(docId);
            compraDoc = await compraRef.get();
        } else if (origen === 'ventas_globales') {
            compraRef = db.collection('ventas_globales').doc(docId);
            compraDoc = await compraRef.get();
        }

        if (!compraDoc.exists) return alert("No se encontró la venta.");
        const d = compraDoc.data();

        // Calculamos cuánto faltaba pagar ANTES de este cobro
        let saldoAntes = d.saldoRestanteVenta !== undefined ? d.saldoRestanteVenta : (d.total - (d.entregaParcial || 0));
        let nuevoSaldoRestante = saldoAntes - montoEntrega;
        
        // Si el saldo llega a 0 o menos, la venta está pagada
        let nuevoEstado = (nuevoSaldoRestante <= 0) ? "pagado" : "fiado";

        const updateData = {
            estado: nuevoEstado,
            saldoRestanteVenta: nuevoSaldoRestante,
            entregaParcial: firebase.firestore.FieldValue.increment(montoEntrega),
            historialPagos: firebase.firestore.FieldValue.arrayUnion({ 
                fecha: fechaHoy, 
                monto: montoEntrega,
                timestamp: ahora,
                detalle: "Cobro de cuota"
            })
        };

        // ACTUALIZAMOS BATCH
        const batch = db.batch();
        batch.update(compraRef, updateData);
        
        batch.update(clienteRef, { saldoPendiente: firebase.firestore.FieldValue.increment(-montoEntrega) });

        // Si es de ventas_globales, verificar si hay también en compras y actualizar
        if (origen === 'ventas_globales') {
            const comprasRef = clienteRef.collection('compras').doc(docId);
            const comprasSnap = await comprasRef.get();
            if (comprasSnap.exists) {
                batch.update(comprasRef, updateData);
            }
        } else {
            // Si es de compras, actualizar también ventas_globales si existe
            const globalRef = db.collection('ventas_globales').doc(docId);
            const globalSnap = await globalRef.get();
            if (globalSnap.exists) {
                batch.update(globalRef, updateData);
            }
        }

        await batch.commit();
        
        alert(`✅ Cobro de $${montoEntrega} registrado. Saldo restante: $${nuevoSaldoRestante}`);
        if(document.querySelector("#modal-historial")) document.querySelector("#modal-historial").remove();
        cargarClientes();
    } catch (e) { 
        console.error("Error al cobrar:", e);
        alert("Error al procesar el cobro: " + e.message); 
    }
}

// --- DEUDA GLOBAL ---
async function actualizarDeudaGlobalReal() {
    const contenedor = document.querySelector("#deuda-global-container");
    if (!contenedor) return;

    contenedor.innerHTML = `
        <button onclick="consultarDeudaGlobal()" style="width:100%; padding:8px; background:#f8f9fa; color:#333; border:1px solid #ccc; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">
            🔵 CONSULTAR TOTAL FIADO REAL
        </button>
    `;
}

// Esta es la que realmente gasta lecturas
async function consultarDeudaGlobal() {
    const contenedor = document.querySelector("#deuda-global-container");
    contenedor.innerHTML = "Calculando... (gastando lecturas)";
    
    try {
        const snapshot = await db.collection('clientes').where("saldoPendiente", ">", 0).get();
        let total = 0;
        snapshot.forEach(doc => { total += (doc.data().saldoPendiente || 0); });
        
        contenedor.innerHTML = `
            <div style="background: #f8d7da; color: #721c24; padding: 15px; border-radius: 8px; border: 1px solid #f5c6cb; text-align: center;">
                <h2 style="margin:0;">💰 TOTAL FIADO REAL: $${total.toLocaleString()}</h2>
                <small onclick="actualizarDeudaGlobalReal()" style="cursor:pointer; text-decoration:underline;">Ocultar</small>
            </div>`;
    } catch (error) { console.error(error); }
}

// --- WHATSAPP ---
function enviarTicketVentaWA(telefono, nombre, productosVendidos, total, estado, descuento) {
    if (!telefono || telefono === "-") return alert("No hay teléfono.");
    let listaTexto = productosVendidos.map(p => `- ${p.nombre}: *$${p.precio}*`).join('\n');
    const mensaje = `*LINDO HOGAR* 🏠\nHola *${nombre}*!\n${listaTexto}\n${descuento > 0 ? `Desc: -$${descuento}\n` : ''}*TOTAL: $${total}*\n*ESTADO:* ${estado.toUpperCase()}\n¡Gracias!`;
    window.open(`https://wa.me/${telefono.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`, '_blank');
}

// --- ELIMINAR CLIENTE ---
async function eliminarCliente(id) {
    if (confirm("¿Eliminar cliente y deudas?")) {
        await db.collection('clientes').doc(id).delete();
        cargarClientes();
    }
}

// --- REPORTES ---
document.getElementById("btn-calcular")?.addEventListener("click", generarReporteExacto);

async function generarReporteExacto() {
    const inicioStr = document.getElementById("fecha-desde").value;
    const finStr = document.getElementById("fecha-hasta").value;
    if (!inicioStr || !finStr) return alert("⚠️ Selecciona el rango de fechas.");

    const inicioMS = new Date(inicioStr + "T00:00:00").getTime();
    const finMS = new Date(finStr + "T23:59:59").getTime();
    
    let efectivoTotalRecibido = 0; 
    let ventasFinalizadasMonto = 0;
    let costoMercaderiaTotal = 0;
    let totalGastosFlete = 0;

    try {
        const snapVentas = await db.collection('ventas_globales').get();

        snapVentas.forEach(doc => {
            const d = doc.data();
            const fechaVenta = d.timestamp || 0;

            // --- 1. EFECTIVO REAL (Basado en CUÁNDO entró el dinero) ---
            if (d.historialPagos && Array.isArray(d.historialPagos)) {
                d.historialPagos.forEach(pago => {
                    if (pago.timestamp >= inicioMS && pago.timestamp <= finMS) {
                        efectivoTotalRecibido += Number(pago.monto || 0);
                    }
                });
            } else {
                // Salvavidas: Si no hay historial, usamos la fecha de creación (Ventas viejas)
                if (fechaVenta >= inicioMS && fechaVenta <= finMS) {
                    efectivoTotalRecibido += Number(d.entregaParcial || d.total || 0);
                }
            }

            // --- 2. GANANCIAS (Operaciones cerradas en este rango) ---
            // Solo sumamos el costo si la venta se completó (estado pagado) 
            // O si prefieres: si la venta se ORIGINÓ en este rango (tú eliges la política)
            if (fechaVenta >= inicioMS && fechaVenta <= finMS) {
                if (d.estado === "pagado") {
                    ventasFinalizadasMonto += Number(d.total || 0);
                    
                    // Priorizamos costoTotal, sino sumamos productos
                    if (d.costoTotal !== undefined) {
                        costoMercaderiaTotal += Number(d.costoTotal);
                    } else if (d.productosDetalle) {
                        d.productosDetalle.forEach(p => costoMercaderiaTotal += Number(p.costo || 0));
                    }
                }
            }
        });

        // --- 3. GASTOS DE FLETE (Ya lo tenías bien) ---
        const snapGastos = await db.collection("gastos_compras")
            .where("timestamp", ">=", inicioMS)
            .where("timestamp", "<=", finMS)
            .get();

        snapGastos.forEach(g => totalGastosFlete += Number(g.data().monto || 0));

        // --- 4. CÁLCULOS FINALES ---
        const gananciaLimpia = ventasFinalizadasMonto - costoMercaderiaTotal - totalGastosFlete;

        // Mostrar resultados
        alert(`📊 REPORTE LINDO HOGAR\n` +
              `------------------------------------------\n` +
              `💰 EFECTIVO EN CAJA: $${efectivoTotalRecibido.toLocaleString()}\n` +
              `   (Dinero que entró físicamente hoy)\n\n` +
              `✅ VENTAS CERRADAS:$${ventasFinalizadasMonto.toLocaleString()}\n` +
              `📉 COSTO DE ELLAS: -$${costoMercaderiaTotal.toLocaleString()}\n` +
              `🚚 FLETES/GASTOS: -$${totalGastosFlete.toLocaleString()}\n` +
              `------------------------------------------\n` +
              `💵 UTILIDAD NETA: $${gananciaLimpia.toLocaleString()}`);

    } catch (error) {
        console.error("Error:", error);
        alert("Error al generar reporte.");
    }
}

// --- INICIO ---
formCliente.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nuevo = {
        nombre: document.querySelector("#cli-nombre").value.toUpperCase(),
        dni: document.querySelector("#cli-dni").value || "-",
        telefono: document.querySelector("#cli-telefono").value || "-",
        direccion: document.querySelector("#cli-direccion").value || "-",
        saldoPendiente: 0,
        fechaRegistro: new Date().toLocaleDateString()
    };
    await db.collection("clientes").add(nuevo);
    formCliente.reset();
    cargarClientes();
});

async function guardarCambiosCliente(id) {
    // 1. Obtenemos los nuevos valores de los inputs del modal
    const nuevoNombre = document.getElementById('edit-nombre').value.trim();
    const nuevoDni = document.getElementById('edit-dni').value.trim();
    const nuevoTel = document.getElementById('edit-tel').value.trim();
    const nuevaDir = document.getElementById('edit-dir').value.trim();

    if (!nuevoNombre) return alert("El nombre es obligatorio");

    try {
        // 2. Actualizamos en Firebase
        await db.collection('clientes').doc(id).update({
            nombre: nuevoNombre,
            dni: nuevoDni,
            telefono: nuevoTel,
            direccion: nuevaDir
        });

        alert("✅ Datos actualizados correctamente");

        // 3. Cerramos los modales
        const modalEditar = document.getElementById('modal-editar-cliente');
        const modalHistorial = document.getElementById('modal-historial');
        
        if (modalEditar) modalEditar.remove();
        if (modalHistorial) modalHistorial.remove();

        // 4. Recargamos la lista
        cargarClientes(); 

    } catch (error) {
        console.error("Error al actualizar:", error);
        alert("Hubo un error al intentar guardar los cambios");
    }
}

// Arrancamos
obtenerProductosIniciales(); // Carga productos en memoria (0 costo)
actualizarDeudaGlobalReal(); // Solo pone el botón de "Consultar", no gasta lecturas aún.

async function filtrarPorProducto() {
    const texto = document.getElementById("buscar-producto").value.toLowerCase().trim();
    const tablaBody = document.getElementById("tabla-clientes");
    
    // Si borra todo el texto, volvemos a cargar la lista normal
    if (texto === "") {
        cargarClientes();
        return;
    }

    try {
        const snapClientes = await db.collection('clientes').get();
        let hallados = [];

        // Usamos Promise.all para que la búsqueda sea ultra rápida
        await Promise.all(snapClientes.docs.map(async (cliDoc) => {
            const clienteData = cliDoc.data();
            const snapCompras = await cliDoc.ref.collection('compras').get();
            
            let tieneElProducto = false;
            let detalleEncontrado = "";

            snapCompras.forEach(compra => {
                const c = compra.data();
                if (c.detalle && c.detalle.toLowerCase().includes(texto)) {
                    tieneElProducto = true;
                    detalleEncontrado = c.detalle;
                }
            });

            if (tieneElProducto) {
                hallados.push({ id: cliDoc.id, ...clienteData, productoMatch: detalleEncontrado });
            }
        }));

        // Dibujamos la tabla con los resultados
        tablaBody.innerHTML = "";
        if (hallados.length === 0) {
            tablaBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px;">No hay clientes que compraron "${texto}"</td></tr>`;
        } else {
            hallados.forEach(c => {
                const fila = `
                    <tr>
                        <td>
                            <strong>${c.nombre}</strong><br>
                            <small style="color: #007bff;">🔍 Coincidencia: ${c.productoMatch}</small>
                        </td>
                        <td>${c.dni || "-"}</td>
                        <td>${c.telefono || "-"}</td>
                        <td>${c.direccion || "-"}</td>
                        <td>
                            <button onclick="abrirModalVenta('${c.id}', '${c.nombre}')" style="background:#28a745; color:white; border:none; padding:5px; cursor:pointer; border-radius:3px;">+ Venta</button>
                            <button onclick="verHistorial('${c.id}')" style="background:#007bff; color:white; border:none; padding:5px; cursor:pointer; border-radius:3px;">📜 Historial</button>
                        </td>
                    </tr>`;
                tablaBody.insertAdjacentHTML('beforeend', fila);
            });
        }
    } catch (error) {
        console.error("Error al filtrar por producto:", error);
    }
}

// --- FUNCIÓN PARA MOSTRAR LA TABLA DE FLETES ---
async function cargarListaFletes() {
    const fechaDesde = document.getElementById("fecha-desde").value;
    const fechaHasta = document.getElementById("fecha-hasta").value;
    const tablaBody = document.getElementById("tabla-gastos-body");

    if (!fechaDesde || !fechaHasta) {
        alert("Por favor, seleccioná ambas fechas.");
        return;
    }

    tablaBody.innerHTML = "<tr><td colspan='4' style='text-align:center;'>Buscando...</td></tr>";

    try {
        // CONVERSIÓN A TIMESTAMP (Número)
        const inicio = new Date(fechaDesde + "T00:00:00").getTime();
        const fin = new Date(fechaHasta + "T23:59:59").getTime();

        // Traemos TODOS los gastos ordenados, filtrar en cliente para evitar requerir índice compuesto
        const snap = await db.collection('gastos_compras')
            .orderBy("timestamp", "desc")
            .get();

        // Filtramos en cliente por rango de fechas
        const gastosFiltrados = snap.docs.filter(doc => {
            const ts = doc.data().timestamp || 0;
            return ts >= inicio && ts <= fin;
        });

        tablaBody.innerHTML = "";

        if (gastosFiltrados.length === 0) {
            tablaBody.innerHTML = "<tr><td colspan='4' style='text-align:center; padding:15px;'>No se encontraron fletes en este rango.</td></tr>";
            return;
        }

        gastosFiltrados.forEach(doc => {
            const gasto = doc.data();
            
            // Convertimos el timestamp de vuelta a una fecha legible para mostrar
            const fechaLegible = new Date(gasto.timestamp).toLocaleDateString();

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="padding:10px; border:1px solid #ddd;">${fechaLegible}</td>
                <td style="padding:10px; border:1px solid #ddd;">${gasto.descripcion || 'Sin descripción'}</td>
                <td style="padding:10px; border:1px solid #ddd; font-weight:bold;">$${(gasto.monto || 0).toLocaleString()}</td>
                <td style="padding:10px; border:1px solid #ddd; text-align:center;">
                    <button onclick="eliminarGasto('${doc.id}')" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">🗑️ Eliminar</button>
                </td>
            `;
            tablaBody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error al cargar fletes:", error);
        tablaBody.innerHTML = "<tr><td colspan='4' style='text-align:center; color:red;'>Error al consultar la base de datos.</td></tr>";
    }
}

// --- FUNCIÓN PARA ELIMINAR UN FLETE ---
async function eliminarGasto(id) {
    if (confirm("¿Estás seguro de eliminar este registro de flete?")) {
        try {
            await db.collection("gastos_compras").doc(id).delete();
            alert("✅ Flete eliminado");
            cargarListaFletes(); // Recargamos la tabla para que desaparezca el renglón
        } catch (error) {
            console.error("Error al eliminar flete:", error);
        }
    }
}

async function eliminarCompraHistorial(clienteId, sourceId, origen) {
    if (!confirm("¿Estás seguro de que deseas eliminar este registro?")) return;

    try {
        // sourceId viene en el formato "compras-{docId}" o "ventas_globales-{docId}"
        const docId = sourceId.split('-').slice(1).join('-'); // Toma todo después del primer guion
        
        if (origen === 'compras') {
            // Eliminar de subcolección clientes/{id}/compras
            const batch = db.batch();
            const compraRef = db.collection('clientes').doc(clienteId).collection('compras').doc(docId);
            const compraSnap = await compraRef.get();

            if (!compraSnap.exists) return alert("Compra no encontrada");

            const compra = compraSnap.data();
            batch.delete(compraRef);

            // Si era fiada, restar del saldoPendiente
            if (compra.estado === "fiado") {
                const clienteRef = db.collection('clientes').doc(clienteId);
                const saldoRestante = compra.total - (compra.entregaParcial || 0);
                batch.update(clienteRef, {
                    saldoPendiente: firebase.firestore.FieldValue.increment(-saldoRestante)
                });
            }

            // Devolver stock si existen productos
            if (compra.productosDetalle && Array.isArray(compra.productosDetalle)) {
                compra.productosDetalle.forEach(prod => {
                    const cantidad = Number(prod.cantidad || 1);
                    if (prod.id) {
                        const productoRef = db.collection('productos').doc(prod.id);
                        batch.update(productoRef, {
                            stock: firebase.firestore.FieldValue.increment(cantidad),
                            ultimaActualizacion: Date.now()
                        });
                    }
                });
            }

            await batch.commit();
        } else if (origen === 'ventas_globales') {
            // Eliminar de ventas_globales
            const batch = db.batch();
            const ventaRef = db.collection('ventas_globales').doc(docId);
            const ventaSnap = await ventaRef.get();

            if (!ventaSnap.exists) return alert("Venta no encontrada");

            const venta = ventaSnap.data();
            batch.delete(ventaRef);

            // Si era fiada, restar del saldoPendiente
            if (venta.estado === "fiado" || venta.estado === "fiado_confirmado") {
                const clienteRef = db.collection('clientes').doc(clienteId);
                const saldoRestante = venta.total - (venta.entregaParcial || 0);
                batch.update(clienteRef, {
                    saldoPendiente: firebase.firestore.FieldValue.increment(-saldoRestante)
                });
            }

            // Devolver stock si existen productos
            if (venta.productosDetalle && Array.isArray(venta.productosDetalle)) {
                venta.productosDetalle.forEach(prod => {
                    const cantidad = Number(prod.cantidad || 1);
                    if (prod.id) {
                        const productoRef = db.collection('productos').doc(prod.id);
                        batch.update(productoRef, {
                            stock: firebase.firestore.FieldValue.increment(cantidad),
                            ultimaActualizacion: Date.now()
                        });
                    }
                });
            }

            await batch.commit();
        }

        alert("✅ Registro eliminado y stock devuelto");
        document.getElementById('modal-historial')?.remove();
    } catch (error) {
        console.error("Error al eliminar:", error);
        alert("❌ Error al eliminar el registro: " + error.message);
    }
}

async function eliminarCompra(clienteId, compraId) {
    if (!confirm("¿Estás seguro de eliminar esta venta? Se devolverá el saldo y el stock de los productos.")) return;

    try {
        const batch = db.batch();
        const clienteRef = db.collection('clientes').doc(clienteId);
        const compraRef = clienteRef.collection('compras').doc(compraId);
        const compraGlobalRef = db.collection('ventas_globales').doc(compraId);

        const docSnap = await compraRef.get();
        if (!docSnap.exists) {
            alert("No se encontró el registro.");
            return;
        }
        
        const datosCompra = docSnap.data();

        // --- 1. DEVOLVER SALDO SI ERA FIADO ---
        if (datosCompra.estado === "fiado") {
            const montoARestar = datosCompra.total || 0;
            batch.update(clienteRef, {
                saldoPendiente: firebase.firestore.FieldValue.increment(-montoARestar)
            });
        }

        // --- 2. DEVOLVER STOCK (LO NUEVO) ---
        // Asumimos que guardaste 'productosDetalle' como un array de objetos con {id, nombre...}
        if (datosCompra.productosDetalle && Array.isArray(datosCompra.productosDetalle)) {
            datosCompra.productosDetalle.forEach(prod => {
                const cantidad = Number(prod.cantidad || 1);
                if (prod.id) { 
                    const productoRef = db.collection('productos').doc(prod.id);
                    batch.update(productoRef, {
                        stock: firebase.firestore.FieldValue.increment(cantidad),
                        ultimaActualizacion: Date.now()
                    });
                }
            });
        }

        // --- 3. BORRAR REGISTROS ---
        batch.delete(compraRef);
        batch.delete(compraGlobalRef);

        // EJECUTAR TODO EN UN SOLO VIAJE
        await batch.commit();

        alert("✅ Venta eliminada y stock devuelto.");
        
        const modalHistorial = document.getElementById('modal-historial');
        if (modalHistorial) modalHistorial.remove();
        
        cargarClientes(); 

    } catch (error) {
        console.error("Error al eliminar compra:", error);
        alert("Error al procesar la eliminación.");
    }
}

async function registrarClienteManual() {
    const nombre = document.getElementById('cli-nombre').value.trim();
    const dni = document.getElementById('cli-dni').value.trim();
    const telefono = document.getElementById('cli-telefono').value.trim();
    const direccion = document.getElementById('cli-direccion').value.trim();

    if (!nombre) return alert("El nombre es obligatorio");

    try {
        await db.collection('clientes').add({
            nombre: nombre,
            dni: dni,
            telefono: telefono,
            direccion: direccion,
            email: "",
            uid: "",
            saldoPendiente: 0,
            fechaRegistro: new Date()
        });

        alert("✅ Cliente registrado con éxito");

        // Ocultar el panel después de registrar
        document.getElementById('container-nuevo-cliente').style.display = 'none';
        
        // Limpiar los campos
        document.getElementById('cli-nombre').value = '';
        document.getElementById('cli-dni').value = '';
        document.getElementById('cli-telefono').value = '';
        document.getElementById('cli-direccion').value = '';

        cargarClientes(); 
    } catch (error) {
        console.error("Error al registrar:", error);
        alert("Error al guardar en la base de datos");
    }
}

async function vincularClienteConGmail(clienteId) {
    const emailIngresado = prompt("Ingresá el Gmail del cliente (ej: cliente@gmail.com):");
    if (emailIngresado === null) return;

    const email = emailIngresado.trim().toLowerCase();
    const esEmailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!esEmailValido) {
        alert("Ingresá un Gmail válido.");
        return;
    }

    try {
        const clienteRef = db.collection('clientes').doc(clienteId);
        const [clienteSnap, clienteConMismoEmail, pedidoConEmail] = await Promise.all([
            clienteRef.get(),
            db.collection('clientes').where('email', '==', email).limit(1).get(),
            db.collection('pedidos').where('clienteEmail', '==', email).limit(1).get()
        ]);

        if (!clienteSnap.exists) {
            alert("No se encontró el cliente.");
            return;
        }

        let uidDetectado = "";
        if (!clienteConMismoEmail.empty) {
            const data = clienteConMismoEmail.docs[0].data();
            uidDetectado = (data.uid || "").toString().trim();
        }

        if (!uidDetectado && !pedidoConEmail.empty) {
            const dataPedido = pedidoConEmail.docs[0].data();
            uidDetectado = (dataPedido.uid || dataPedido.clienteId || "").toString().trim();
        }

        const payload = {
            email,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (uidDetectado) payload.uid = uidDetectado;

        await clienteRef.set(payload, { merge: true });
        alert(uidDetectado
            ? "✅ Cliente vinculado con Gmail y UID detectado."
            : "✅ Gmail vinculado. El UID se completará cuando el cliente opere en la tienda.");
        cargarClientes();
    } catch (error) {
        console.error("Error vinculando Gmail:", error);
        alert("No se pudo vincular el Gmail.");
    }
}

async function asegurarClientePorPedido(pedido) {
    const clienteRef = db.collection('clientes').doc(pedido.clienteId);
    const clienteSnap = await clienteRef.get();

    if (clienteSnap.exists) {
        return clienteRef;
    }

    if (pedido.clienteEmail) {
        const query = await db.collection('clientes').where('email', '==', pedido.clienteEmail).limit(1).get();
        if (!query.empty) {
            return query.docs[0].ref;
        }
    }

    const nuevoClienteRef = pedido.clienteId ? clienteRef : db.collection('clientes').doc();
    await nuevoClienteRef.set({
        nombre: pedido.clienteNombre || pedido.clienteEmail || 'Cliente',
        email: pedido.clienteEmail || '',
        uid: pedido.clienteId || '',
        saldoPendiente: 0,
        fechaRegistro: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return nuevoClienteRef;
}

function timestampPedidoParaOrden(pedido) {
    const raw = pedido.creadoAt || pedido.updatedAt || pedido.mpPaymentApprovedAt;
    if (raw?.toMillis) return raw.toMillis();
    if (raw?.toDate) return raw.toDate().getTime();
    if (typeof raw === "number") return raw;
    return 0;
}

async function cargarPedidosPendientes() {
    try {
        let snapFiado = { docs: [] };
        try {
            snapFiado = await db.collection("pedidos")
                .where("estado", "==", "fiado")
                .orderBy("creadoAt", "desc")
                .get();
        } catch (_e) {
            snapFiado = await db.collection("pedidos").where("estado", "==", "fiado").get();
        }

        let snapMpPagado = { docs: [] };
        try {
            snapMpPagado = await db.collection("pedidos")
                .where("estado", "==", "pagado")
                .where("medioPago", "==", "mercado_pago")
                .get();
        } catch (e2) {
            console.warn("[pedidos admin] consulta MP pagados:", e2);
        }

        const contenedor = document.getElementById("contenedor-pedidos-admin");
        if (!contenedor) return;

        const porId = new Map();
        [...snapFiado.docs, ...snapMpPagado.docs].forEach((d) => {
            porId.set(d.id, d);
        });
        const docsOrdenados = Array.from(porId.values()).sort((a, b) => {
            const ta = timestampPedidoParaOrden(a.data());
            const tb = timestampPedidoParaOrden(b.data());
            return tb - ta;
        });

        if (docsOrdenados.length === 0) {
            contenedor.innerHTML = "<p style='text-align:center; color:#999; padding:30px;'>✅ Sin pedidos pendientes</p>";
            return;
        }

        contenedor.innerHTML = docsOrdenados.map(doc => {
            const pedido = doc.data();
            const pedidoId = doc.id;
            const pedidoCodigoVisible = (pedido.pedidoCodigo || pedido.codigoPedido || pedidoId || "").toString();
            const fecha = pedido.creadoAt?.toDate ? pedido.creadoAt.toDate().toLocaleDateString() : "Sin fecha";
            const esMpPagado = pedido.estado === "pagado" && pedido.medioPago === "mercado_pago";
            const bordeColor = esMpPagado ? "#198754" : "#ffc107";
            const etiquetaEstado = esMpPagado
                ? `<p style="margin: 5px 0; font-size: 13px; color: #198754; font-weight: bold;">💳 PAGADO (Mercado Pago)</p>`
                : `<p style="margin: 5px 0; font-size: 13px; color: #ffc107; font-weight: bold;">⏳ FIADO</p>`;

            const bloqueAcciones = esMpPagado
                ? `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <button onclick="confirmarEntregaMercadoPago('${pedidoId}')" 
                                style="background: #0d6efd; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px; grid-column: 1 / -1;">
                            📦 CONFIRMAR ENTREGA
                        </button>
                        <button onclick="rechazarPedidoAdmin('${pedidoId}')" 
                                style="background: #dc3545; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px; grid-column: 1 / -1;">
                            ❌ RECHAZAR / REVERTIR
                        </button>
                    </div>`
                : `
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                        <button onclick="confirmarPedidoAdmin('${pedidoId}', 'fiado')" 
                                style="background: #f0ad4e; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px;">
                            ✅ CONFIRMAR FIADO
                        </button>
                        <button onclick="confirmarPedidoAdmin('${pedidoId}', 'pagado')" 
                                style="background: #28a745; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px;">
                            ✅ CONFIRMAR FINALIZADO
                        </button>
                        <button onclick="rechazarPedidoAdmin('${pedidoId}')" 
                                style="background: #dc3545; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px;">
                            ❌ RECHAZAR
                        </button>
                    </div>`;

            const itemsLista = Array.isArray(pedido.items)
                ? pedido.items.map(item => `
                                <li style="padding: 8px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between;">
                                    <span>• ${item.cantidad}x ${item.nombre}</span>
                                    <span style="font-weight: bold;">$${Number(item.subtotal || 0).toLocaleString()}</span>
                                </li>
                            `).join("")
                : "";

            return `
                <div style="background: white; border: 2px solid ${bordeColor}; border-radius: 10px; padding: 15px; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                        <div>
                            <p style="margin: 0; font-size: 12px; color: #666;">CLIENTE:</p>
                            <h4 style="margin: 5px 0; color: #333;">${pedido.clienteNombre}</h4>
                            <p style="margin: 5px 0; font-size: 13px; color: #999;">${pedido.clienteEmail}</p>
                        </div>
                        <div>
                            <p style="margin: 0; font-size: 12px; color: #666;">PEDIDO:</p>
                            <h4 style="margin: 5px 0; color: #0d6efd;">#${pedidoCodigoVisible}</h4>
                            <p style="margin: 0; font-size: 12px; color: #666;">FECHA:</p>
                            <h4 style="margin: 5px 0; color: #333;">${fecha}</h4>
                            ${etiquetaEstado}
                        </div>
                    </div>

                    <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; margin-bottom: 15px;">
                        <p style="margin: 0; font-size: 12px; font-weight: bold; color: #333;">PRODUCTOS:</p>
                        <ul style="list-style: none; padding: 0; margin: 8px 0;">
                            ${itemsLista}
                        </ul>
                    </div>

                    <div style="background: #e7f3ff; padding: 12px; border-radius: 6px; margin-bottom: 15px; text-align: right;">
                        <p style="margin: 0; font-size: 12px; color: #0066cc;">TOTAL:</p>
                        <h3 style="margin: 5px 0; color: #0066cc; font-size: 24px;">$${Number(pedido.total || 0).toLocaleString()}</h3>
                    </div>

                    ${bloqueAcciones}
                </div>
            `;
        }).join("");

    } catch (error) {
        console.error("Error cargando pedidos:", error);
    }
}

async function confirmarPedidoAdmin(pedidoId, nuevoEstado = 'pagado') {
    const textoEstado = nuevoEstado === 'fiado' ? 'FIADO' : 'FINALIZADO';
    if (!confirm(`¿Confirmar este pedido como ${textoEstado}?`)) return;

    try {
        const pedidoRef = db.collection('pedidos').doc(pedidoId);
        const pedidoSnap = await pedidoRef.get();
        if (!pedidoSnap.exists) return alert('Pedido no encontrado');

        const pedido = pedidoSnap.data();
        const clienteRef = await asegurarClientePorPedido(pedido);
        const ventaData = {
            clienteId: pedido.clienteId || clienteRef.id || '',
            nombreCliente: pedido.clienteNombre || pedido.clienteEmail || 'Cliente',
            clienteEmail: pedido.clienteEmail || '',
            productosDetalle: pedido.items.map(item => ({ id: item.id, nombre: item.nombre, precio: item.precio, costo: item.costo || 0, cantidad: item.cantidad || 1 })),
            detalle: pedido.items.map(item => `${item.cantidad || 1}x ${item.nombre} ($${item.precio})`).join(', '),
            subtotal: pedido.total || pedido.items.reduce((sum, item) => sum + (item.precio * (item.cantidad || 1)), 0),
            descuentoAplicado: pedido.descuentoAplicado || 0,
            total: pedido.total || pedido.items.reduce((sum, item) => sum + (item.precio * (item.cantidad || 1)), 0),
            costoTotal: pedido.items.reduce((sum, item) => sum + ((item.costo || 0) * (item.cantidad || 1)), 0),
            entregaParcial: nuevoEstado === 'pagado' ? (pedido.total || 0) : 0,
            historialPagos: nuevoEstado === 'pagado' ? [{ fecha: new Date().toLocaleString(), monto: pedido.total || 0, detalle: 'Pago total confirmado' }] : [],
            timestamp: Date.now(),
            fecha: new Date().toLocaleDateString(),
            fechaObjeto: firebase.firestore.Timestamp.now(),
            estado: nuevoEstado
        };

        const batch = db.batch();
        const compraGlobalRef = db.collection('ventas_globales').doc(pedidoId);
        const compraClienteRef = clienteRef.collection('compras').doc(pedidoId);

        // Guardar en AMBOS lados en el batch
        batch.set(compraGlobalRef, ventaData);
        batch.set(compraClienteRef, ventaData);
        
        batch.update(pedidoRef, {
            estado: nuevoEstado === 'pagado' ? 'pagado' : 'fiado_confirmado',
            confirmado: true,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        if (nuevoEstado === 'fiado') {
            batch.update(clienteRef, {
                saldoPendiente: firebase.firestore.FieldValue.increment(ventaData.total)
            });
        }

        if (pedido.items && Array.isArray(pedido.items)) {
            pedido.items.forEach(item => {
                const cantidad = Number(item.cantidad || 1);
                if (item.id) {
                    const productoRef = db.collection('productos').doc(item.id);
                    batch.update(productoRef, {
                        stock: firebase.firestore.FieldValue.increment(-cantidad),
                        ultimaActualizacion: Date.now()
                    });
                }
            });
        }

        try {
            await batch.commit();
            console.log('[pedido] ✅ Confirmado en cliente y ventas_globales');
        } catch (error) {
            if (error.code === 'permission-denied') {
                console.warn('[pedido] permiso denegado, reintentando sin ventas_globales...');
                const fallback = db.batch();
                
                // Guardar AL MENOS en compras del cliente
                fallback.set(compraClienteRef, ventaData);

                if (pedido.items && Array.isArray(pedido.items)) {
                    pedido.items.forEach(item => {
                        const cantidad = Number(item.cantidad || 1);
                        if (item.id) {
                            const productoRef = db.collection('productos').doc(item.id);
                            fallback.update(productoRef, {
                                stock: firebase.firestore.FieldValue.increment(-cantidad),
                                ultimaActualizacion: Date.now()
                            });
                        }
                    });
                }
                
                fallback.update(pedidoRef, {
                    estado: nuevoEstado === 'pagado' ? 'pagado' : 'fiado_confirmado',
                    confirmado: true,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                if (nuevoEstado === 'fiado') {
                    fallback.update(clienteRef, {
                        saldoPendiente: firebase.firestore.FieldValue.increment(ventaData.total)
                    });
                }
                await fallback.commit();
            } else {
                throw error;
            }
        }

        alert(`✅ Pedido confirmado como ${textoEstado}`);
        cargarPedidosPendientes();
    } catch (error) {
        console.error('Error en confirmación de pedido:', error);
        alert('❌ Error al confirmar el pedido: ' + (error.message || error));
    }
}

/** Archiva venta en cliente + ventas_globales cuando MP ya cobró y solo falta registrar la entrega (sin tocar stock). */
async function confirmarEntregaMercadoPago(pedidoId) {
    if (!confirm("¿Confirmar que el pedido pagado por Mercado Pago ya fue entregado?\nSe registrará la venta para ganancias y quedará archivado.")) return;

    try {
        const pedidoRef = db.collection("pedidos").doc(pedidoId);
        const pedidoSnap = await pedidoRef.get();
        if (!pedidoSnap.exists) return alert("Pedido no encontrado");

        const pedido = pedidoSnap.data();
        if ((pedido.medioPago || "") !== "mercado_pago") {
            return alert("Este flujo solo aplica a pedidos pagados por Mercado Pago.");
        }
        if ((pedido.estado || "") !== "pagado") {
            return alert("El pedido debe estar en estado pagado (aprobado en Mercado Pago).");
        }

        const clienteRef = await asegurarClientePorPedido(pedido);
        const tsPago = typeof pedido.mpPaymentApprovedAt === "number"
            ? pedido.mpPaymentApprovedAt
            : Date.now();
        const fechaLegible = new Date(tsPago).toLocaleString();

        const items = Array.isArray(pedido.items) ? pedido.items : [];
        const productosDetalle = items.map((item) => ({
            id: item.id,
            nombre: item.nombre || "Producto",
            precio: item.precio != null ? item.precio : item.precioBase,
            costo: item.costo || 0,
            cantidad: Number(item.cantidad || 1),
        }));

        const subtotal = items.reduce(
            (sum, item) => sum + Number(item.precioBase || item.precio || 0) * Number(item.cantidad || 1),
            0
        );
        const total = Number(pedido.total != null
            ? pedido.total
            : items.reduce((s, item) => s + Number(item.subtotal || 0), 0));

        const ventaData = {
            clienteId: clienteRef.id,
            nombreCliente: pedido.clienteNombre || pedido.clienteEmail || "Cliente",
            clienteEmail: pedido.clienteEmail || "",
            productosDetalle,
            detalle: items.map((item) => `${item.cantidad || 1}x ${item.nombre} ($${item.precio != null ? item.precio : item.precioBase})`).join(", "),
            subtotal,
            descuentoAplicado: pedido.descuentoAplicado || 0,
            total,
            costoTotal: items.reduce(
                (acc, item) => acc + Number(item.costo || 0) * Number(item.cantidad || 1),
                0
            ),
            entregaParcial: total,
            historialPagos: [{
                fecha: fechaLegible,
                monto: total,
                timestamp: tsPago,
                detalle: "Mercado Pago — pago aprobado",
            }],
            timestamp: tsPago,
            fecha: new Date(tsPago).toLocaleDateString(),
            fechaObjeto: firebase.firestore.Timestamp.fromMillis(tsPago),
            estado: "pagado",
            origenMercadoPago: true,
            mercadoPagoPaymentId: pedido.mpPaymentId || "",
            pedidoOrigenId: pedidoId,
        };

        const batch = db.batch();
        const compraGlobalRef = db.collection("ventas_globales").doc(pedidoId);
        const compraClienteRef = clienteRef.collection("compras").doc(pedidoId);

        batch.set(compraGlobalRef, ventaData);
        batch.set(compraClienteRef, ventaData);

        batch.update(pedidoRef, {
            estado: "finalizado",
            entregaConfirmadaAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

        try {
            await batch.commit();
        } catch (error) {
            if (error.code === "permission-denied") {
                const fallback = db.batch();
                fallback.set(compraClienteRef, ventaData);
                fallback.update(pedidoRef, {
                    estado: "finalizado",
                    entregaConfirmadaAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
                await fallback.commit();
                try {
                    await compraGlobalRef.set(ventaData);
                } catch (eG) {
                    console.warn("[MP entrega] ventas_globales omitido:", eG.message);
                }
            } else {
                throw error;
            }
        }

        alert("✅ Entrega confirmada. Venta registrada y pedido archivado como finalizado.");
        cargarPedidosPendientes();
    } catch (error) {
        console.error("confirmarEntregaMercadoPago:", error);
        alert("❌ Error: " + (error.message || error));
    }
}

async function rechazarPedidoAdmin(pedidoId) {
    if (!confirm("¿Rechazar este pedido?\n\n⚠️ Se devolverá el stock automáticamente")) return;

    try {
        const pedidoRef = db.collection("pedidos").doc(pedidoId);
        const pedidoSnap = await pedidoRef.get();
        
        if (!pedidoSnap.exists) return alert("Pedido no encontrado");

        const pedido = pedidoSnap.data();
        const batch = db.batch();

        // Cambiar estado a rechazada
        batch.update(pedidoRef, {
            estado: "rechazada",
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        const estadoPedido = (pedido.estado || "").toString();
        const debeDevolverStock =
            estadoPedido === "fiado" ||
            pedido.stockDescontado === true;

        // Fiado (stock descontado al crear pedido) o MP ya aprobado (stock descontado en webhook)
        if (debeDevolverStock && Array.isArray(pedido.items)) {
            pedido.items.forEach(item => {
                const prodRef = db.collection("productos").doc(item.id.toString());
                batch.update(prodRef, {
                    stock: firebase.firestore.FieldValue.increment(item.cantidad),
                    ultimaActualizacion: Date.now()
                });
            });
        }

        await batch.commit();

        const msgStock = debeDevolverStock && Array.isArray(pedido.items)
            ? `\n✅ Stock devuelto: ${pedido.items.map(i => `${i.cantidad}x ${i.nombre}`).join(", ")}`
            : "\n(Sin devolución de stock: el pedido estaba pendiente de pago o sin descuento de mercadería.)";
        alert(`❌ Pedido rechazado${msgStock}`);
        cargarPedidosPendientes();
    } catch (error) {
        console.error(error);
        alert("❌ Error al rechazar el pedido");
    }
}