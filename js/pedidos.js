const ESTADOS_PENDIENTES = new Set(["pendiente", "fiado", "sin_confirmar"]);
const ESTADOS_FINALIZADOS = new Set(["completado", "completada", "finalizado", "finalizada", "pagado"]);
const ESTADOS_CANCELADOS = new Set(["cancelado", "cancelada", "rechazado", "rechazada"]);

const listaPendientes = document.getElementById("lista-pendientes");
const listaHistorial = document.getElementById("lista-historial");
const estadoCarga = document.getElementById("estado-carga");
const avisoAuth = document.getElementById("aviso-auth");
const badgePendientesCantidad = document.getElementById("badge-pendientes-cantidad");
const badgeHistorialCantidad = document.getElementById("badge-historial-cantidad");
const btnRecargarPedidos = document.getElementById("btn-recargar-pedidos");

if (btnRecargarPedidos) {
    btnRecargarPedidos.addEventListener("click", async () => {
        const user = firebase.auth().currentUser;
        if (!user) return;
        await cargarPedidosCliente(user.uid);
    });
}

firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
        mostrarAvisoSinSesion();
        setTimeout(() => {
            window.location.href = "index.html";
        }, 1200);
        return;
    }

    ocultarAvisoSinSesion();
    await cargarPedidosCliente(user.uid);
});

function mostrarAvisoSinSesion() {
    if (avisoAuth) avisoAuth.classList.remove("d-none");
    if (estadoCarga) estadoCarga.textContent = "Redirigiendo a la tienda...";
}

function ocultarAvisoSinSesion() {
    if (avisoAuth) avisoAuth.classList.add("d-none");
}

async function cargarPedidosCliente(uid) {
    if (!listaPendientes || !listaHistorial) return;

    listaPendientes.innerHTML = "";
    listaHistorial.innerHTML = "";
    if (estadoCarga) estadoCarga.textContent = "Cargando pedidos...";

    try {
        // Evitamos orderBy en la consulta para no depender de índices compuestos.
        // El orden descendente por fecha se aplica localmente.
        const [snapshotUid, snapshotClienteId] = await Promise.all([
            db.collection("pedidos").where("uid", "==", uid).get(),
            db.collection("pedidos").where("clienteId", "==", uid).get()
        ]);

        const pedidosMap = new Map();
        [...snapshotUid.docs, ...snapshotClienteId.docs].forEach((doc) => {
            pedidosMap.set(doc.id, { id: doc.id, ...doc.data() });
        });

        const pedidos = Array.from(pedidosMap.values())
            .sort((a, b) => extraerTimestamp(b) - extraerTimestamp(a));

        const pendientes = [];
        const historial = [];

        pedidos.forEach((pedido) => {
            const estadoNormalizado = normalizarEstado(pedido.estado);
            if (ESTADOS_PENDIENTES.has(estadoNormalizado)) {
                pendientes.push(pedido);
            } else if (ESTADOS_FINALIZADOS.has(estadoNormalizado)) {
                historial.push(pedido);
            } else if (ESTADOS_CANCELADOS.has(estadoNormalizado)) {
                historial.push(pedido);
            } else {
                historial.push(pedido);
            }
        });

        badgePendientesCantidad.textContent = String(pendientes.length);
        badgeHistorialCantidad.textContent = String(historial.length);

        renderListaPedidos(listaPendientes, pendientes, true);
        renderListaPedidos(listaHistorial, historial, false);

        if (estadoCarga) {
            estadoCarga.textContent = `${pedidos.length} pedido(s) encontrados.`;
        }
    } catch (error) {
        console.error("Error al cargar pedidos:", error);
        if (estadoCarga) estadoCarga.textContent = "No se pudieron cargar los pedidos. Intentá nuevamente.";
        listaPendientes.innerHTML = renderMensajeVacio("Ocurrió un error al cargar los pedidos pendientes.");
        listaHistorial.innerHTML = renderMensajeVacio("Ocurrió un error al cargar el historial.");
    }
}

function renderListaPedidos(contenedor, pedidos, esPendiente) {
    if (pedidos.length === 0) {
        contenedor.innerHTML = renderMensajeVacio(
            esPendiente ? "No tenés pedidos pendientes de pago." : "Todavía no tenés compras finalizadas."
        );
        return;
    }

    contenedor.innerHTML = pedidos.map((pedido) => renderPedidoCard(pedido, esPendiente)).join("");
}

function renderPedidoCard(pedido, esPendiente) {
    const fecha = formatearFechaPedido(pedido.creadoAt || pedido.fecha || pedido.fechaCreacion);
    const total = Number(pedido.total || 0);
    const estadoTexto = (pedido.estado || (esPendiente ? "pendiente" : "finalizado")).toString();
    const estadoNormalizado = normalizarEstado(estadoTexto);
    const badgeClass = obtenerBadgeEstado(estadoNormalizado, esPendiente);

    const productos = Array.isArray(pedido.items) ? pedido.items : [];
    const listaProductos = productos.length > 0
        ? productos.map((item) => {
            const cantidad = Number(item.cantidad || 0);
            const nombre = item.nombre || "Producto";
            const subtotal = Number(item.subtotal || item.precio || 0);
            return `
                <li class="list-group-item d-flex justify-content-between align-items-start px-0">
                    <div>
                        <span class="fw-semibold">${cantidad}x</span> ${nombre}
                    </div>
                    <span class="text-muted">$${subtotal.toLocaleString()}</span>
                </li>
            `;
        }).join("")
        : `<li class="list-group-item px-0 text-muted">Sin detalle de productos.</li>`;

    const idPedidoMostrable = obtenerIdPedidoMostrable(pedido);

    return `
        <article class="col-12 col-md-6">
            <div class="card h-100 shadow-sm border-0">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
                        <div>
                            <h3 class="h6 mb-1">Pedido #${idPedidoMostrable}</h3>
                            <p class="text-muted small mb-0">${fecha}</p>
                        </div>
                        <span class="badge ${badgeClass} text-uppercase">${estadoTexto}</span>
                    </div>
                    <ul class="list-group list-group-flush mb-3">${listaProductos}</ul>
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="fw-semibold">Total</span>
                        <span class="fw-bold text-success">$${total.toLocaleString()}</span>
                    </div>
                </div>
            </div>
        </article>
    `;
}

function renderMensajeVacio(mensaje) {
    return `
        <div class="col-12">
            <div class="alert alert-light border mb-0">${mensaje}</div>
        </div>
    `;
}

function normalizarEstado(estado) {
    return (estado || "")
        .toString()
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function obtenerBadgeEstado(estadoNormalizado, esPendiente) {
    if (ESTADOS_CANCELADOS.has(estadoNormalizado)) return "text-bg-secondary";
    if (esPendiente || ESTADOS_PENDIENTES.has(estadoNormalizado)) return "text-bg-warning";
    return "text-bg-success";
}

function obtenerIdPedidoMostrable(pedido) {
    if (pedido && pedido.pedidoCodigo) return String(pedido.pedidoCodigo);
    if (pedido && pedido.codigoPedido) return String(pedido.codigoPedido);
    if (pedido && pedido.id) return String(pedido.id);
    return "S/N";
}

function formatearFechaPedido(fechaRaw) {
    try {
        if (!fechaRaw) return "Sin fecha";
        if (fechaRaw?.toDate) {
            return fechaRaw.toDate().toLocaleString("es-AR");
        }
        const fecha = new Date(fechaRaw);
        if (Number.isNaN(fecha.getTime())) return "Sin fecha";
        return fecha.toLocaleString("es-AR");
    } catch (_error) {
        return "Sin fecha";
    }
}

function extraerTimestamp(pedido) {
    const fechaRaw = pedido.creadoAt || pedido.fecha || pedido.fechaCreacion;
    if (!fechaRaw) return 0;
    if (fechaRaw?.toDate) return fechaRaw.toDate().getTime();
    const fecha = new Date(fechaRaw);
    return Number.isNaN(fecha.getTime()) ? 0 : fecha.getTime();
}
