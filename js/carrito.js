let carritoProductos = JSON.parse(localStorage.getItem("carritoGuardado")) || [];
if (typeof window.COMISION_MP !== "number") {
    window.COMISION_MP = 1.12;
}


// 2. Función para guardar los cambios en el navegador
function almacenarCarrito() {
    localStorage.setItem("carritoGuardado", JSON.stringify(carritoProductos));
}

async function agregarAlCarrito(id) {
    let producto = (typeof productos !== 'undefined') ? productos.find(p => p.id == id) : null;

    if (!producto) {
        // Búsqueda profunda para que el buscador funcione con cualquier producto
        const doc = await db.collection("productos").doc(id.toString()).get();
        if (doc.exists) producto = { id: doc.id, ...doc.data() };
    }

    if (producto) {
        const cantidadEnCarrito = carritoProductos.filter(p => p.id == id).length;
        if (cantidadEnCarrito < producto.stock) {
            carritoProductos.push(producto);
            actualizarInterfazCarrito();
        } else {
            mostrarToastError(`Límite alcanzado. Solo hay ${producto.stock} disponibles.`);
        }
    }
}

// Esta función es la que muestra el cartelito verde
function actualizarInterfazCarrito() {
    almacenarCarrito();
    
    // Lógica del cartelito (Toast) que desaparece solo
    const toast = document.createElement("div");
    toast.className = "toast-notificacion";
    toast.innerText = "✅ Producto añadido al carrito";
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 500);
    }, 2000);
}

function obtenerCarritoAgrupado() {
    const agrupado = {};

    carritoProductos.forEach(producto => {
        if (agrupado[producto.id]) {
            agrupado[producto.id].cantidad += 1;
        } else {
            // Creamos una copia del producto y le asignamos cantidad 1
            agrupado[producto.id] = { ...producto, cantidad: 1 };
        }
    });

    return Object.values(agrupado);
}

// 4. Función opcional para contar cuántos productos hay en total
function obtenerCantidadTotal() {
    return carritoProductos.length;
}

function restarDelCarrito(id) {
    const indice = carritoProductos.findIndex(p => p.id == id); // Usamos == para comparar texto/número
    if (indice !== -1) {
        carritoProductos.splice(indice, 1);
        almacenarCarrito();
        // Si estás en checkout.html, tendrías que llamar a la función que dibuja la tabla
    }
}

async function enviarWhatsApp() {
    const productosAgrupados = obtenerCarritoAgrupado();
    if (productosAgrupados.length === 0) {
        alert("El carrito está vacío");
        return;
    }

    try {
        // --- LÓGICA DE STOCK Y FECHA EN FIREBASE ---
        for (const prod of productosAgrupados) {
            const docRef = db.collection('productos').doc(prod.id.toString());
            
            // Actualizamos stock Y marcamos la fecha de este movimiento
            await docRef.update({
                stock: firebase.firestore.FieldValue.increment(-prod.cantidad),
                // Guardamos el momento exacto del cambio para el filtro "Lo más nuevo"
                ultimaActualizacion: Date.now() 
            });
        }

        // ... (el resto de tu código de WhatsApp sigue igual)
        let mensaje = "¡Hola Lindo Hogar! 👋 Quisiera realizar el siguiente pedido:\n\n";
        // ...
        let total = 0;

        productosAgrupados.forEach((prod) => {
            const subtotal = prod.precio * prod.cantidad;
            mensaje += `- ${prod.cantidad}x ${prod.nombre} ($${subtotal})\n`;
            total += subtotal;
        });

        mensaje += `\n*Total a pagar: $${total}*`;

        const telefono = "5492995050726";
        const url = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;
        
        // Vaciar carrito y recargar
        carritoProductos = [];
        almacenarCarrito();
        
        window.open(url, "_blank");
        
        setTimeout(() => {
            location.reload();
        }, 500);

    } catch (error) {
        console.error("Error al actualizar el stock:", error);
        alert("Hubo un problema al procesar el pedido. Intenta nuevamente.");
    }
}


function mostrarToastError(mensaje) {
    const toast = document.createElement("div");
    toast.className = "toast-notificacion"; // Usa la misma clase de CSS
    toast.style.backgroundColor = "#ff4b2b"; // Color rojo para diferenciarlo del verde
    toast.innerText = `❌ ${mensaje}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 500);
    }, 2000);
}

function cargarCarrito() {
    const cuerpoTabla = document.getElementById("cuerpo-tabla");
    if (!cuerpoTabla) return; // Si no encuentra la tabla (ej. estás en el index), se detiene.

    // IMPORTANTE: Usamos "carritoGuardado" porque así lo definiste en tu almacenarCarrito()
    const carritoActual = JSON.parse(localStorage.getItem("carritoGuardado")) || [];
    
    // Agrupamos los productos para que no aparezcan filas repetidas del mismo artículo
    const productosAgrupados = {};
    carritoActual.forEach(producto => {
        if (productosAgrupados[producto.id]) {
            productosAgrupados[producto.id].cantidad += 1;
        } else {
            productosAgrupados[producto.id] = { ...producto, cantidad: 1 };
        }
    });

    const listaParaMostrar = Object.values(productosAgrupados);
    cuerpoTabla.innerHTML = ""; // Limpiamos la tabla antes de dibujar

    if (listaParaMostrar.length === 0) {
        cuerpoTabla.innerHTML = `<tr><td colspan="5" class="text-center py-5 fs-4">Tu carrito está vacío 🛒</td></tr>`;
        return;
    }

    listaParaMostrar.forEach(p => {
        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td class="align-middle"><img src="${p.imagen}" width="50" class="rounded"></td>
            <td class="align-middle fw-bold">${p.nombre}</td>
            <td class="align-middle">$${p.precio}</td>
            <td class="align-middle">
                <div class="d-flex justify-content-center align-items-center gap-2">
                    <button class="btn btn-sm btn-outline-danger" onclick="restarYRefrescar('${p.id}')">-</button>
                    <span class="fw-bold">${p.cantidad}</span>
                    <button class="btn btn-sm btn-outline-success" onclick="sumarYRefrescar('${p.id}')">+</button>
                </div>
            </td>
            <td class="align-middle fw-bold">$${p.precio * p.cantidad}</td>
        `;
        cuerpoTabla.appendChild(fila);
    });

    actualizarTotalInterfaz(listaParaMostrar);
}

// Funciones auxiliares para que los botones de la tabla funcionen al toque
function sumarYRefrescar(id) {
    agregarAlCarrito(id); // Reutilizamos tu función de agregar
    cargarCarrito();      // Redibujamos la tabla
}

function restarYRefrescar(id) {
    restarDelCarrito(id); // Reutilizamos tu función de restar
    cargarCarrito();      // Redibujamos la tabla
}

function actualizarTotalInterfaz(productos) {
    let totalElemento = document.getElementById("total-carrito");
    if (!totalElemento) {
        totalElemento = document.getElementById("total-precio");
    }
    if (totalElemento) {
        const total = productos.reduce((acc, p) => acc + (p.precio * p.cantidad), 0);
        totalElemento.innerText = totalElemento.id === "total-carrito"
            ? `$${total.toLocaleString()}`
            : `Total: $${total}`;
    }
}

// ESTO ES CLAVE: Ejecutar la carga cuando abre la página
document.addEventListener("DOMContentLoaded", () => {
    cargarCarrito();
    // También actualizamos el globito del menú si existe
    if (typeof actualizarContadorCarrito === 'function') {
        actualizarContadorCarrito();
    }
});

async function asegurarClientePorUsuario(user) {
    const clientesRef = db.collection('clientes');
    const existing = await clientesRef.where('email', '==', user.email).limit(1).get();

    if (!existing.empty) {
        const doc = existing.docs[0];
        await doc.ref.set({
            nombre: user.displayName || user.email,
            email: user.email,
            uid: user.uid,
            fechaRegistro: doc.data().fechaRegistro || firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return doc.ref;
    }

    const clienteRef = clientesRef.doc(user.uid);
    await clienteRef.set({
        nombre: user.displayName || user.email,
        email: user.email,
        uid: user.uid,
        saldoPendiente: 0,
        fechaRegistro: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return clienteRef;
}

window.asegurarClientePorUsuario = asegurarClientePorUsuario;

async function generarCodigoPedidoCorto() {
    const ahora = new Date();
    const year2 = String(ahora.getFullYear()).slice(-2);
    const month2 = String(ahora.getMonth() + 1).padStart(2, "0");
    const prefijo = `${year2}${month2}`;
    const contadorRef = db.collection("contadores").doc(`pedidos_${prefijo}`);

    const correlativo = await db.runTransaction(async (tx) => {
        const snap = await tx.get(contadorRef);
        const actual = snap.exists ? Number(snap.data().ultimo ?? -1) : -1;
        const siguiente = actual + 1;

        if (siguiente > 9999) {
            throw new Error(`Se alcanzó el máximo mensual de pedidos para ${prefijo}.`);
        }

        tx.set(contadorRef, {
            ultimo: siguiente,
            prefijo,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return siguiente;
    });

    return `${prefijo}${String(correlativo).padStart(4, "0")}`;
}

async function crearPreferenciaMercadoPago() {
    if (window.__mpConfigReady) {
        await window.__mpConfigReady;
    }

    const user = firebase.auth().currentUser;
    if (!user) {
        alert("❌ Debes iniciar sesión con Google para pagar con Mercado Pago.");
        if (typeof loginConGoogle === "function") loginConGoogle();
        return;
    }

    const productosAgrupados = obtenerCarritoAgrupado();
    if (productosAgrupados.length === 0) {
        alert("El carrito está vacío");
        return;
    }

    const mult = typeof window.COMISION_MP === "number" ? window.COMISION_MP : 1.12;

    const host = typeof window !== "undefined" && window.location ? window.location.hostname : "";
    const esLocalHost = host === "localhost" || host === "127.0.0.1";
    const defaultMpOrigin = esLocalHost
        ? "http://localhost:3456"
        : "https://servidor-lindo-hogar.onrender.com";
    const originFallback =
        typeof window.MP_SERVER_ORIGIN === "string" && window.MP_SERVER_ORIGIN.trim()
            ? window.MP_SERVER_ORIGIN.trim().replace(/\/$/, "")
            : defaultMpOrigin;
    const apiUrl =
        (typeof window.MP_PREFERENCE_API_URL === "string" && window.MP_PREFERENCE_API_URL.trim()
            ? window.MP_PREFERENCE_API_URL.trim()
            : `${originFallback}/api/crear-preferencia`);

    const itemsPreferencia = productosAgrupados.map((p) => {
        const unitPrice = Math.round(Number(p.precio || 0) * mult);
        const row = {
            id: String(p.id),
            title: p.nombre || "Producto",
            quantity: Number(p.cantidad) || 1,
            unit_price: unitPrice,
        };
        if (p.imagen && String(p.imagen).startsWith("http")) {
            row.picture_url = p.imagen;
        }
        return row;
    });

    const clienteRef = await asegurarClientePorUsuario(user);
    const pedidoCodigo = await generarCodigoPedidoCorto();
    const pedidoRef = db.collection("pedidos").doc();

    const itemsPedido = [];
    for (const p of productosAgrupados) {
        const precioBase = Number(p.precio || 0);
        const cantidad = Number(p.cantidad) || 1;
        const precioUnitMp = Math.round(precioBase * mult);
        let costo = Number(p.costo || 0);
        if (!costo && p.id) {
            const snap = await db.collection("productos").doc(String(p.id)).get();
            if (snap.exists) costo = Number(snap.data().costo || 0);
        }
        itemsPedido.push({
            id: p.id,
            nombre: p.nombre || "Producto",
            precioBase,
            precio: precioUnitMp,
            costo,
            cantidad,
            subtotal: precioUnitMp * cantidad,
        });
    }

    const total = itemsPedido.reduce((sum, it) => sum + it.subtotal, 0);

    await pedidoRef.set({
        clienteId: clienteRef.id,
        clienteEmail: user.email,
        clienteNombre: user.displayName || user.email,
        uid: user.uid,
        estado: "pendiente",
        medioPago: "mercado_pago",
        stockDescontado: false,
        comisionAplicadaMP: Math.round((mult - 1) * 100),
        pedidoCodigo,
        items: itemsPedido,
        total,
        entregaParcial: 0,
        historialPagos: [],
        saldoPendiente: total,
        saldoRestanteVenta: total,
        creadoAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    try {
        const res = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                items: itemsPreferencia,
                payerEmail: user.email || undefined,
                external_reference: pedidoRef.id,
            }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            await pedidoRef.delete().catch(() => {});
            throw new Error(data.error || "No se pudo crear la preferencia de pago.");
        }
        if (!data.init_point) {
            await pedidoRef.delete().catch(() => {});
            throw new Error("Respuesta inválida del servidor de pagos.");
        }

        carritoProductos = [];
        almacenarCarrito();
        if (typeof actualizarContadorInterfaz === "function") {
            actualizarContadorInterfaz();
        }

        window.location.href = data.init_point;
    } catch (e) {
        await pedidoRef.delete().catch(() => {});
        throw e;
    }
}

async function confirmarCompraConLogin(medioForzado) {
    console.log("1. Iniciando compra...");
    
    const user = firebase.auth().currentUser;
    console.log("2. Usuario:", user?.email);
    
    if (!user) {
        alert("❌ Debes iniciar sesión con Google para comprar.");
        loginConGoogle();
        return;
    }

    const productosAgrupados = obtenerCarritoAgrupado();
    console.log("3. Productos:", productosAgrupados.length);
    
    if (productosAgrupados.length === 0) {
        alert("El carrito está vacío");
        return;
    }

    try {
        console.log("4. Preparando datos del pedido...");
        const medioPagoSeleccionado = medioForzado || obtenerMedioPagoSeleccionado();
        const multiplicadorPago = medioPagoSeleccionado === "mercado_pago" ? window.COMISION_MP : 1;

        const items = [];
        for (const p of productosAgrupados) {
            let costo = Number(p.costo || 0);
            if (!costo && p.id) {
                const snap = await db.collection("productos").doc(String(p.id)).get();
                if (snap.exists) costo = Number(snap.data().costo || 0);
            }
            const precioBase = Number(p.precio || 0);
            const cantidad = Number(p.cantidad) || 1;
            const precioUnit = Math.round(precioBase * multiplicadorPago);
            items.push({
                id: p.id,
                nombre: p.nombre,
                precioBase,
                precio: precioUnit,
                costo,
                cantidad,
                subtotal: precioUnit * cantidad,
            });
        }

        const total = items.reduce((sum, item) => sum + item.subtotal, 0);
        console.log("5. Total:", total);

        const clienteRef = await asegurarClientePorUsuario(user);
        const pedidoCodigo = await generarCodigoPedidoCorto();
        const batch = db.batch();
        const pedidoRef = db.collection("pedidos").doc();
        console.log("6. ID del pedido:", pedidoRef.id);

        batch.set(pedidoRef, {
            clienteId: clienteRef.id,
            clienteEmail: user.email,
            clienteNombre: user.displayName || user.email,
            uid: user.uid,
            estado: "fiado",
            medioPago: medioPagoSeleccionado,
            comisionAplicadaMP: medioPagoSeleccionado === "mercado_pago" ? 12 : 0,
            pedidoCodigo,
            items: items,
            total: total,
            entregaParcial: 0,
            historialPagos: [],
            saldoPendiente: total,
            saldoRestanteVenta: total,
            creadoAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        if (items && Array.isArray(items)) {
            items.forEach(item => {
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

        console.log("7. Actualizando stock al colocar el pedido...");

        console.log("8. Ejecutando batch...");
        await batch.commit();
        console.log("9. ¡Éxito!");

        carritoProductos = [];
        almacenarCarrito();

        alert(`✅ Pedido #${pedidoCodigo} registrado como FIADO.\n\nEl administrador confirmará tu compra pronto.\nTotal: $${total.toLocaleString()}`);
        
        if (typeof cargarResumenPedidosCliente === "function") {
            cargarResumenPedidosCliente();
        }

        location.href = "index.html";

    } catch (error) {
        console.error("ERROR COMPLETO:", error);
        console.error("Código:", error.code);
        console.error("Mensaje:", error.message);
        alert("❌ Error al procesar la compra:\n" + error.message);
    }
}

function obtenerMedioPagoSeleccionado() {
    const select = document.getElementById("medio-pago-select");
    if (!select) return "transferencia";
    return select.value === "mercado_pago" ? "mercado_pago" : "transferencia";
}

async function finalizarCompra(medio) {
    if (medio === "mercado_pago") {
        try {
            await crearPreferenciaMercadoPago();
        } catch (err) {
            console.error(err);
            let msg = err.message || "No se pudo abrir Mercado Pago.";
            if (/failed to fetch|networkerror|load failed/i.test(String(msg))) {
                msg =
                    "No se pudo conectar con el servidor de Mercado Pago (" +
                    (window.MP_SERVER_ORIGIN || "backend") +
                    "). Verificá que esté desplegado y despierto (Render puede tardar unos segundos la primera vez).";
            }
            alert("❌ " + msg);
        }
        return;
    }
    await confirmarCompraConLogin("transferencia");
}

/**
 * Paga el saldo de una compra fiado desde el perfil del cliente (external_reference FIADO|...).
 */
async function crearPreferenciaPagoFiado(compraDocId) {
    if (window.__mpConfigReady) {
        await window.__mpConfigReady;
    }

    const user = firebase.auth().currentUser;
    if (!user) {
        alert("Debés iniciar sesión para pagar.");
        return;
    }

    const clienteRef = await asegurarClientePorUsuario(user);
    const compraRef = clienteRef.collection("compras").doc(compraDocId);
    const compraSnap = await compraRef.get();
    if (!compraSnap.exists) {
        alert("No se encontró la compra.");
        return;
    }

    const c = compraSnap.data();
    const estado = (c.estado || "").toString();
    if (estado !== "fiado" && estado !== "fiado_confirmado") {
        alert("Esta compra no tiene saldo pendiente en fiado.");
        return;
    }

    const saldoBase =
        c.saldoRestanteVenta !== undefined && c.saldoRestanteVenta !== null
            ? Number(c.saldoRestanteVenta)
            : Number(c.total || 0) - Number(c.entregaParcial || 0);

    if (saldoBase <= 0) {
        alert("No hay saldo pendiente en esta venta.");
        return;
    }

    const mult = typeof window.COMISION_MP === "number" ? window.COMISION_MP : 1.12;
    const unitPrice = Math.round(saldoBase * mult);

    const host = typeof window !== "undefined" && window.location ? window.location.hostname : "";
    const esLocalHost = host === "localhost" || host === "127.0.0.1";
    const defaultMpOrigin = esLocalHost ? "http://localhost:3456" : "https://servidor-lindo-hogar.onrender.com";
    const originFallback =
        typeof window.MP_SERVER_ORIGIN === "string" && window.MP_SERVER_ORIGIN.trim()
            ? window.MP_SERVER_ORIGIN.trim().replace(/\/$/, "")
            : defaultMpOrigin;
    const apiUrl =
        typeof window.MP_PREFERENCE_API_URL === "string" && window.MP_PREFERENCE_API_URL.trim()
            ? window.MP_PREFERENCE_API_URL.trim()
            : `${originFallback}/api/crear-preferencia`;

    const external_reference = `FIADO|${clienteRef.id}|${compraDocId}`;

    try {
        const res = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [
                    {
                        id: `fiado-${compraDocId}`,
                        title: `Pago fiado — ${(c.detalle || "compra").toString().slice(0, 200)}`,
                        quantity: 1,
                        unit_price: unitPrice,
                    },
                ],
                payerEmail: user.email || undefined,
                external_reference,
            }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || "No se pudo crear la preferencia de pago.");
        }
        if (!data.init_point) {
            throw new Error("Respuesta inválida del servidor de pagos.");
        }

        window.location.href = data.init_point;
    } catch (e) {
        console.error(e);
        alert("❌ " + (e.message || "No se pudo iniciar el pago."));
    }
}

window.crearPreferenciaPagoFiado = crearPreferenciaPagoFiado;