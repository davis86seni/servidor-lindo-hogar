const tbody = document.querySelector("#cuerpo-tabla"); // Asegúrate que el ID coincida con el HTML
if (typeof window.COMISION_MP !== "number") {
    window.COMISION_MP = 1.12;
}

function mostrarTabla() {
    if (!tbody) return;
    tbody.innerHTML = "";

    if (carritoProductos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 30px; color: #999;">
            El carrito está vacío. <a href="index.html">Volver a la tienda</a>
        </td></tr>`;
        document.getElementById("resumen-carrito").style.display = "none";
        return;
    }

    const productosAgrupados = obtenerCarritoAgrupado();
    let subtotalBase = 0;

    productosAgrupados.forEach(p => {
        subtotalBase += p.precio * p.cantidad;
        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td><img src="${p.imagen}" width="50" class="rounded" style="object-fit: cover;"></td>
            <td><strong>${p.nombre}</strong></td>
            <td>
                <div style="display: flex; justify-content: center; gap: 10px; align-items: center;">
                    <button onclick="restarYRefrescar('${p.id}')" style="width: 30px; height: 30px; cursor: pointer;">−</button>
                    <span style="min-width: 30px; text-align: center; font-weight: bold;">${p.cantidad}</span>
                    <button onclick="sumarYRefrescar('${p.id}')" style="width: 30px; height: 30px; cursor: pointer;">+</button>
                </div>
            </td>
            <td>$${p.precio.toLocaleString()}</td>
            <td>
                <button onclick="eliminarProductoCompleto('${p.id}')" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">
                    🗑️
                </button>
            </td>
        `;
        tbody.appendChild(fila);
    });

    actualizarResumenPago(subtotalBase);
}

function totalMercadoPagoDesdeAgrupados(productosAgrupados) {
    const mult = typeof window.COMISION_MP === "number" ? window.COMISION_MP : 1.12;
    return productosAgrupados.reduce(
        (sum, p) => sum + Math.round(Number(p.precio || 0) * mult) * Number(p.cantidad || 0),
        0
    );
}

function actualizarResumenPago(subtotalBase) {
    const resumen = document.getElementById("resumen-carrito");
    if (!resumen) return;

    resumen.style.display = "block";

    const productosAgrupados = obtenerCarritoAgrupado();
    const totalTransferencia = subtotalBase;
    const totalMp = totalMercadoPagoDesdeAgrupados(productosAgrupados);

    const elTransf = document.getElementById("total-transferencia");
    const elMp = document.getElementById("total-mercadopago");
    const legacyTotal = document.getElementById("total-carrito");

    if (elTransf) elTransf.textContent = `$${totalTransferencia.toLocaleString()}`;
    if (elMp) elMp.textContent = `$${totalMp.toLocaleString()}`;
    if (legacyTotal) legacyTotal.textContent = `$${totalTransferencia.toLocaleString()}`;
}

// Escuchador de clics para la tabla
// Nota: los botones del carrito usan funciones directas con recarga en línea.
// Este escuchador ya no es necesario para el checkout estándar.

function vaciarTodo() {
    if (confirm("¿Estás seguro de que quieres vaciar todo el carrito?")) {
        carritoProductos = [];
        localStorage.removeItem("carritoGuardado");
        location.reload();
    }
}

function eliminarProductoCompleto(id) {
    // Esto elimina todas las unidades de un mismo producto
    carritoProductos = carritoProductos.filter(p => p.id != id);
    localStorage.setItem("carritoGuardado", JSON.stringify(carritoProductos));
    mostrarTabla();
    
    if (typeof actualizarContadorInterfaz === "function") {
        actualizarContadorInterfaz();
    }
}