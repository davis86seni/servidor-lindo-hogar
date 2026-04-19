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
        await cargarPedidosCliente(user);
    });
}

window.__recargarPedidosClienteSiExiste = async function __recargarPedidosClienteSiExiste() {
    const user = firebase.auth().currentUser;
    if (user) await cargarPedidosCliente(user);
};

firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
        mostrarAvisoSinSesion();
        setTimeout(() => {
            window.location.href = "index.html";
        }, 1200);
        return;
    }

    ocultarAvisoSinSesion();
    await cargarPedidosCliente(user);
});

function mostrarAvisoSinSesion() {
    if (avisoAuth) avisoAuth.classList.remove("d-none");
    if (estadoCarga) estadoCarga.textContent = "Redirigiendo a la tienda...";
}

function ocultarAvisoSinSesion() {
    if (avisoAuth) avisoAuth.classList.add("d-none");
}

function esCompraFiadoConSaldo(c) {
    const e = (c.estado || "").toString();
    if (e !== "fiado" && e !== "fiado_confirmado") return false;
    return saldoRestanteCompra(c) > 0;
}

function saldoRestanteCompra(c) {
    const e = (c.estado || "").toString();
    if (e !== "fiado" && e !== "fiado_confirmado") return 0;
    const s =
        c.saldoRestanteVenta !== undefined && c.saldoRestanteVenta !== null
            ? Number(c.saldoRestanteVenta)
            : Number(c.total || 0) - Number(c.entregaParcial || 0);
    return Math.max(0, s);
}

/** Misma lógica que saldoRestanteCompra / panel clientes: saldoPendiente o saldoRestanteVenta o total − entregaParcial. */
function saldoRestantePedido(p) {
    const e = normalizarEstado(p.estado);
    if (e !== "fiado" && e !== "fiado_confirmado") return 0;
    if (p.saldoPendiente !== undefined && p.saldoPendiente !== null) {
        return Math.max(0, Number(p.saldoPendiente));
    }
    if (p.saldoRestanteVenta !== undefined && p.saldoRestanteVenta !== null) {
        return Math.max(0, Number(p.saldoRestanteVenta));
    }
    return Math.max(0, Number(p.total || 0) - Number(p.entregaParcial || 0));
}

function montoAcumuladoPagosPedido(p) {
    return Number(p.entregaParcial || 0);
}

function renderHistorialPagosHtml(pagos) {
    const arr = Array.isArray(pagos) ? pagos : [];
    if (arr.length === 0) {
        return `<p class="small text-muted mb-0">Sin pagos registrados todavía.</p>`;
    }
    return `<ul class="list-unstyled small mb-0">
        ${arr
            .slice()
            .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))
            .map((pago) => {
                const fecha = escapeHtmlBasico((pago.fecha || "").toString().slice(0, 40));
                const det = escapeHtmlBasico((pago.detalle || "Pago").toString().slice(0, 80));
                const m = Number(pago.monto || 0);
                return `<li class="mb-1"><span class="text-success fw-semibold">$${m.toLocaleString()}</span> · ${fecha}<br><span class="text-muted">${det}</span></li>`;
            })
            .join("")}
    </ul>`;
}

function extraerTimestampCompra(c) {
    const fo = c.fechaObjeto;
    if (fo?.toDate) return fo.toDate().getTime();
    if (typeof c.timestamp === "number") return c.timestamp;
    return 0;
}

async function cargarComprasCliente(clienteRef) {
    try {
        const snap = await clienteRef.collection("compras").orderBy("fechaObjeto", "desc").limit(100).get();
        return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (_e) {
        const snap = await clienteRef.collection("compras").limit(100).get();
        const arr = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        arr.sort((a, b) => extraerTimestampCompra(b) - extraerTimestampCompra(a));
        return arr;
    }
}

async function cargarPedidosCliente(user) {
    if (!listaPendientes || !listaHistorial) return;

    listaPendientes.innerHTML = "";
    listaHistorial.innerHTML = "";
    if (estadoCarga) estadoCarga.textContent = "Cargando pedidos...";

    try {
        if (typeof window.asegurarClientePorUsuario !== "function") {
            throw new Error("Falta cargar el módulo de cliente (carrito.js).");
        }

        const clienteRef = await window.asegurarClientePorUsuario(user);
        const cid = clienteRef.id;
        const uid = user.uid;

        const emailCli = (user.email || "").toString().trim();
        const [snapshotUid, snapCidUid, snapCidRef, snapEmail, comprasRaw] = await Promise.all([
            db.collection("pedidos").where("uid", "==", uid).get(),
            db.collection("pedidos").where("clienteId", "==", uid).get(),
            db.collection("pedidos").where("clienteId", "==", cid).get(),
            emailCli ? db.collection("pedidos").where("clienteEmail", "==", emailCli).get() : Promise.resolve({ docs: [] }),
            cargarComprasCliente(clienteRef),
        ]);

        const pedidosMap = new Map();
        [...snapshotUid.docs, ...snapCidUid.docs, ...snapCidRef.docs, ...snapEmail.docs].forEach((doc) => {
            pedidosMap.set(doc.id, { id: doc.id, ...doc.data() });
        });

        const pedidos = Array.from(pedidosMap.values()).sort((a, b) => extraerTimestamp(b) - extraerTimestamp(a));
        const idsPedido = new Set(pedidos.map((p) => p.id));
        const compras = comprasRaw.filter((c) => !idsPedido.has(c.id));

        const pendientesPedidos = [];
        const historialPedidos = [];

        pedidos.forEach((pedido) => {
            const estadoNormalizado = normalizarEstado(pedido.estado);
            const saldoP = saldoRestantePedido(pedido);
            const fiadoConSaldo =
                (estadoNormalizado === "fiado" || estadoNormalizado === "fiado_confirmado") && saldoP > 0;
            const fiadoSinSaldo =
                (estadoNormalizado === "fiado" || estadoNormalizado === "fiado_confirmado") && saldoP <= 0;

            if (ESTADOS_PENDIENTES.has(estadoNormalizado) || fiadoConSaldo) {
                pendientesPedidos.push(pedido);
            } else if (ESTADOS_FINALIZADOS.has(estadoNormalizado) || ESTADOS_CANCELADOS.has(estadoNormalizado) || fiadoSinSaldo) {
                historialPedidos.push(pedido);
            } else {
                historialPedidos.push(pedido);
            }
        });

        const comprasPendientes = compras.filter((c) => esCompraFiadoConSaldo(c));
        const comprasHistorial = compras.filter((c) => !esCompraFiadoConSaldo(c));

        const nPend = pendientesPedidos.length + comprasPendientes.length;
        const nHist = historialPedidos.length + comprasHistorial.length;

        if (badgePendientesCantidad) badgePendientesCantidad.textContent = String(nPend);
        if (badgeHistorialCantidad) badgeHistorialCantidad.textContent = String(nHist);

        renderListaPendientesMix(listaPendientes, pendientesPedidos, comprasPendientes);
        renderListaHistorialMix(listaHistorial, historialPedidos, comprasHistorial);

        if (estadoCarga) {
            estadoCarga.textContent = `${pedidos.length} pedido(s) en línea · ${compras.length} movimiento(s) en tu cuenta.`;
        }
    } catch (error) {
        console.error("Error al cargar pedidos:", error);
        if (estadoCarga) estadoCarga.textContent = "No se pudieron cargar los pedidos. Intentá nuevamente.";
        listaPendientes.innerHTML = renderMensajeVacio("Ocurrió un error al cargar los pedidos pendientes.");
        listaHistorial.innerHTML = renderMensajeVacio("Ocurrió un error al cargar el historial.");
    }
}

function renderListaPendientesMix(contenedor, pedidosPend, comprasFiado) {
    const bloques = [];
    bloques.push(...pedidosPend.map((p) => renderPedidoCard(p, true)));
    bloques.push(...comprasFiado.map((c) => renderCompraFiadoPendienteCard(c)));
    if (bloques.length === 0) {
        contenedor.innerHTML = renderMensajeVacio(
            "No tenés pedidos pendientes de pago ni ventas fiado con saldo."
        );
        return;
    }
    contenedor.innerHTML = bloques.join("");
}

function renderListaHistorialMix(contenedor, pedidosHist, comprasHist) {
    const merged = [];
    pedidosHist.forEach((p) => merged.push({ tipo: "pedido", ts: extraerTimestamp(p), payload: p }));
    comprasHist.forEach((c) => merged.push({ tipo: "compra", ts: extraerTimestampCompra(c), payload: c }));
    merged.sort((a, b) => b.ts - a.ts);

    if (merged.length === 0) {
        contenedor.innerHTML = renderMensajeVacio("Todavía no tenés compras registradas en tu historial.");
        return;
    }

    contenedor.innerHTML = merged
        .map((m) =>
            m.tipo === "pedido" ? renderPedidoCard(m.payload, false) : renderCompraHistorialCard(m.payload)
        )
        .join("");
}

function renderCompraFiadoPendienteCard(c) {
    const saldo = saldoRestanteCompra(c);
    const fecha = formatearFechaPedido(c.fechaObjeto || c.timestamp);
    const detalle = escapeHtmlBasico((c.detalle || "Venta fiado").toString().slice(0, 280));
    const puedeMp = typeof window.crearPreferenciaPagoFiado === "function";
    const btnMp = puedeMp
        ? `<button type="button" class="btn btn-primary btn-sm mt-2 w-100 fw-bold" onclick="window.crearPreferenciaPagoFiado('${c.id}')">Pagar saldo con Mercado Pago</button>`
        : `<p class="small text-danger mb-0">Actualizá la página para habilitar pagos.</p>`;

    return `
        <article class="col-12 col-md-6">
            <div class="card h-100 shadow-sm border-warning">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
                        <div>
                            <h3 class="h6 mb-1">Venta fiado</h3>
                            <p class="text-muted small mb-0">${fecha}</p>
                        </div>
                        <span class="badge text-bg-warning text-uppercase">Saldo pendiente</span>
                    </div>
                    <p class="small text-body-secondary mb-2">${detalle}</p>
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="fw-semibold">Saldo a pagar</span>
                        <span class="fw-bold text-danger">$${saldo.toLocaleString()}</span>
                    </div>
                    ${btnMp}
                </div>
            </div>
        </article>
    `;
}

function renderCompraHistorialCard(c) {
    const fecha = formatearFechaPedido(c.fechaObjeto || c.timestamp);
    const detalle = escapeHtmlBasico((c.detalle || "Compra registrada").toString().slice(0, 320));
    const total = Number(c.total || 0);
    const estadoTxt = (c.estado || "registrada").toString().toUpperCase();
    const badge =
        normalizarEstado(c.estado) === "pagado" || Number(c.saldoRestanteVenta || 0) <= 0
            ? "text-bg-success"
            : "text-bg-secondary";

    return `
        <article class="col-12 col-md-6">
            <div class="card h-100 shadow-sm border-0">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
                        <div>
                            <h3 class="h6 mb-1">Compra en cuenta</h3>
                            <p class="text-muted small mb-0">${fecha}</p>
                        </div>
                        <span class="badge ${badge} text-uppercase">${estadoTxt}</span>
                    </div>
                    <p class="small text-body-secondary mb-3">${detalle}</p>
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="fw-semibold">Total</span>
                        <span class="fw-bold text-success">$${total.toLocaleString()}</span>
                    </div>
                </div>
            </div>
        </article>
    `;
}

function escapeHtmlBasico(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function renderPedidoCard(pedido, esPendiente) {
    const fecha = formatearFechaPedido(pedido.creadoAt || pedido.fecha || pedido.fechaCreacion);
    const total = Number(pedido.total || 0);
    const estadoTexto = (pedido.estado || (esPendiente ? "pendiente" : "finalizado")).toString();
    const estadoNormalizado = normalizarEstado(estadoTexto);
    const mpPendienteEntrega =
        estadoNormalizado === "pagado" && (pedido.medioPago || "") === "mercado_pago";
    const saldoPed = saldoRestantePedido(pedido);
    const pagadoAcum = montoAcumuladoPagosPedido(pedido);
    const historialPagos = Array.isArray(pedido.historialPagos) ? pedido.historialPagos : [];
    const muestraSaldosFiado =
        estadoNormalizado === "fiado" || estadoNormalizado === "fiado_confirmado";
    const muestraHistorialPagos =
        muestraSaldosFiado || historialPagos.length > 0 || pagadoAcum > 0;
    const bloqueSaldos =
        muestraSaldosFiado || historialPagos.length > 0
            ? `<div class="border rounded p-2 mb-3 bg-light">
                ${
                    muestraSaldosFiado
                        ? `<div class="d-flex justify-content-between small mb-1"><span>Total del pedido</span><span class="fw-semibold">$${total.toLocaleString()}</span></div>
                <div class="d-flex justify-content-between small mb-1"><span>Pagado / entregado</span><span class="fw-semibold text-success">$${pagadoAcum.toLocaleString()}</span></div>
                <div class="d-flex justify-content-between small mb-2"><span>Saldo pendiente</span><span class="fw-bold text-danger">$${saldoPed.toLocaleString()}</span></div>`
                        : ""
                }
                ${
                    muestraHistorialPagos
                        ? `<p class="small fw-semibold text-body-secondary mb-1">Historial de pagos</p>
                ${renderHistorialPagosHtml(historialPagos)}`
                        : ""
                }
           </div>`
            : "";

    let etiquetaEstado;
    if (mpPendienteEntrega) {
        etiquetaEstado = "PAGO OK — EN CAMINO";
    } else if (estadoNormalizado === "pagado") {
        etiquetaEstado = "PAGADO";
    } else {
        etiquetaEstado = estadoTexto.toString().toUpperCase();
    }

    let badgeClass = obtenerBadgeEstado(estadoNormalizado, esPendiente, mpPendienteEntrega);

    const productos = Array.isArray(pedido.items) ? pedido.items : [];
    const listaProductos =
        productos.length > 0
            ? productos
                  .map((item) => {
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
                  })
                  .join("")
            : `<li class="list-group-item px-0 text-muted">Sin detalle de productos.</li>`;

    const idPedidoMostrable = obtenerIdPedidoMostrable(pedido);
    const notaEntrega = mpPendienteEntrega
        ? `<p class="small text-info mb-2 mb-md-3"><strong>Importante:</strong> el pago ya está acreditado; pendiente de entrega en tienda o envío según tu compra.</p>`
        : "";

    const esAdminMp =
        typeof window.esUsuarioAdminLindoHogar === "function" &&
        window.esUsuarioAdminLindoHogar() &&
        (pedido.medioPago || "") === "mercado_pago" &&
        !pedido.ventaManual &&
        !ESTADOS_CANCELADOS.has(estadoNormalizado) &&
        estadoNormalizado !== "finalizado" &&
        estadoNormalizado !== "finalizada" &&
        (estadoNormalizado === "pendiente" || estadoNormalizado === "pagado");
    const idPedidoJs = JSON.stringify(pedido.id || "");
    const textoBtnAdminMp =
        estadoNormalizado === "pendiente"
            ? "Sincronizar pago MP y confirmar entrega"
            : "Confirmar entrega y registrar venta";
    const bloqueAdminMp = esAdminMp
        ? `<div class="mt-3 pt-3 border-top border-secondary-subtle">
                <p class="small text-muted mb-2 mb-0">Administración</p>
                <button type="button" class="btn btn-primary btn-sm fw-bold w-100 mt-1" onclick="confirmarEntregaMercadoPago(${idPedidoJs})">${textoBtnAdminMp}</button>
           </div>`
        : "";

    return `
        <article class="col-12 col-md-6">
            <div class="card h-100 shadow-sm border-0">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
                        <div>
                            <h3 class="h6 mb-1">Pedido #${idPedidoMostrable}</h3>
                            <p class="text-muted small mb-0">${fecha}</p>
                        </div>
                        <span class="badge ${badgeClass} text-uppercase">${etiquetaEstado}</span>
                    </div>
                    ${notaEntrega}
                    <ul class="list-group list-group-flush mb-3">${listaProductos}</ul>
                    ${bloqueSaldos}
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="fw-semibold">${muestraSaldosFiado ? "Saldo pendiente" : "Total"}</span>
                        <span class="fw-bold ${muestraSaldosFiado ? "text-danger" : "text-success"}">$${(muestraSaldosFiado ? saldoPed : total).toLocaleString()}</span>
                    </div>
                    ${bloqueAdminMp}
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

function obtenerBadgeEstado(estadoNormalizado, esPendiente, mpPendienteEntrega) {
    if (mpPendienteEntrega) return "text-bg-info";
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
