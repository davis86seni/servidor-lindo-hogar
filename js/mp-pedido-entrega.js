/**
 * Confirmación de entrega / sincronización de pedidos Mercado Pago (admin).
 * Usado desde clientes.html (panel) y pedidos.html (vista admin en Mis pedidos).
 */
(function () {
    const db = window.db;
    if (!db) {
        console.warn("[mp-pedido-entrega] window.db no está definido.");
        return;
    }

    async function asegurarClientePorPedido(pedido) {
        const clienteRef = db.collection("clientes").doc(pedido.clienteId);
        const clienteSnap = await clienteRef.get();

        if (clienteSnap.exists) {
            return clienteRef;
        }

        if (pedido.clienteEmail) {
            const query = await db.collection("clientes").where("email", "==", pedido.clienteEmail).limit(1).get();
            if (!query.empty) {
                return query.docs[0].ref;
            }
        }

        const nuevoClienteRef = pedido.clienteId ? clienteRef : db.collection("clientes").doc();
        await nuevoClienteRef.set(
            {
                nombre: pedido.clienteNombre || pedido.clienteEmail || "Cliente",
                email: pedido.clienteEmail || "",
                uid: pedido.clienteId || "",
                saldoPendiente: 0,
                fechaRegistro: firebase.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );
        return nuevoClienteRef;
    }

    /**
     * Registra la venta en ventas_globales + compras del cliente y archiva el pedido.
     * - Si el pedido está en "pagado" (webhook OK): no toca stock (ya descontado).
     * - Si está en "pendiente" (pago real pero sin webhook): aplica descuento de stock como el servidor y marca pago.
     */
    window.confirmarEntregaMercadoPago = async function confirmarEntregaMercadoPago(pedidoId) {
        const pedidoRef = db.collection("pedidos").doc(pedidoId);
        const pedidoSnap = await pedidoRef.get();
        if (!pedidoSnap.exists) {
            return alert("Pedido no encontrado");
        }

        const pedido = pedidoSnap.data();
        if ((pedido.medioPago || "") !== "mercado_pago") {
            return alert("Este flujo solo aplica a pedidos pagados por Mercado Pago.");
        }

        const est = (pedido.estado || "").toString();
        if (est === "finalizado") {
            return alert("Este pedido ya fue finalizado.");
        }

        const esPendienteMp = est === "pendiente";
        const esPagadoMp = est === "pagado";

        if (!esPendienteMp && !esPagadoMp) {
            return alert('Solo se puede usar con pedidos en estado "pendiente" (pago sin sincronizar) o "pagado" (listos para entrega).');
        }

        const msg = esPendienteMp
            ? "El pedido figura como pendiente en el sistema.\n\n¿Confirmás que Mercado Pago acreditó el pago y que ya entregaste el producto?\nSe descontará stock (si aún no se descontó), se registrará la venta para ganancias y el pedido quedará finalizado."
            : "¿Confirmar que el pedido pagado por Mercado Pago ya fue entregado?\nSe registrará la venta para ganancias y quedará archivado.";

        if (!confirm(msg)) return;

        try {
            const clienteRef = await asegurarClientePorPedido(pedido);
            const tsPago =
                typeof pedido.mpPaymentApprovedAt === "number" ? pedido.mpPaymentApprovedAt : Date.now();
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
            const total = Number(
                pedido.total != null ? pedido.total : items.reduce((s, item) => s + Number(item.subtotal || 0), 0)
            );

            const detalleHistorialPago = esPendienteMp
                ? "Mercado Pago — sincronizado manualmente (pago acreditado + entrega)"
                : "Mercado Pago — pago aprobado";

            const ventaData = {
                clienteId: clienteRef.id,
                nombreCliente: pedido.clienteNombre || pedido.clienteEmail || "Cliente",
                clienteEmail: pedido.clienteEmail || "",
                productosDetalle,
                detalle: items
                    .map(
                        (item) =>
                            `${item.cantidad || 1}x ${item.nombre} ($${item.precio != null ? item.precio : item.precioBase})`
                    )
                    .join(", "),
                subtotal,
                descuentoAplicado: pedido.descuentoAplicado || 0,
                total,
                costoTotal: items.reduce((acc, item) => acc + Number(item.costo || 0) * Number(item.cantidad || 1), 0),
                entregaParcial: total,
                historialPagos: [
                    {
                        fecha: fechaLegible,
                        monto: total,
                        timestamp: tsPago,
                        detalle: detalleHistorialPago,
                    },
                ],
                timestamp: tsPago,
                fecha: new Date(tsPago).toLocaleDateString(),
                fechaObjeto: firebase.firestore.Timestamp.fromMillis(tsPago),
                estado: "pagado",
                origenMercadoPago: true,
                mercadoPagoPaymentId: pedido.mpPaymentId || (esPendienteMp ? "sincronizado-admin" : ""),
                pedidoOrigenId: pedidoId,
            };

            const batch = db.batch();
            const compraGlobalRef = db.collection("ventas_globales").doc(pedidoId);
            const compraClienteRef = clienteRef.collection("compras").doc(pedidoId);

            const yaDescontado = pedido.stockDescontado === true;
            if (esPendienteMp && !yaDescontado) {
                items.forEach((item) => {
                    const pid = item.id != null ? String(item.id) : "";
                    const cantidad = Math.max(0, Number(item.cantidad) || 0);
                    if (!pid || cantidad <= 0) return;
                    batch.update(db.collection("productos").doc(pid), {
                        stock: firebase.firestore.FieldValue.increment(-cantidad),
                        ultimaActualizacion: Date.now(),
                    });
                });
            }

            batch.set(compraGlobalRef, ventaData);
            batch.set(compraClienteRef, ventaData);

            const pedidoUpdate = {
                estado: "finalizado",
                stockDescontado: true,
                entregaParcial: total,
                saldoRestanteVenta: 0,
                saldoPendiente: 0,
                entregaConfirmadaAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            };
            if (esPendienteMp) {
                pedidoUpdate.mpPagoSincronizadoAdmin = true;
                pedidoUpdate.mpPaymentApprovedAt = tsPago;
                pedidoUpdate.historialPagos = firebase.firestore.FieldValue.arrayUnion({
                    fecha: fechaLegible,
                    monto: total,
                    timestamp: tsPago,
                    detalle: detalleHistorialPago,
                });
            }

            batch.update(pedidoRef, pedidoUpdate);

            try {
                await batch.commit();
            } catch (error) {
                if (error.code === "permission-denied") {
                    const fallback = db.batch();
                    if (esPendienteMp && !yaDescontado) {
                        items.forEach((item) => {
                            const pid = item.id != null ? String(item.id) : "";
                            const cantidad = Math.max(0, Number(item.cantidad) || 0);
                            if (!pid || cantidad <= 0) return;
                            fallback.update(db.collection("productos").doc(pid), {
                                stock: firebase.firestore.FieldValue.increment(-cantidad),
                                ultimaActualizacion: Date.now(),
                            });
                        });
                    }
                    fallback.set(compraClienteRef, ventaData);
                    fallback.update(pedidoRef, pedidoUpdate);
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

            alert("✅ Entrega confirmada. Venta registrada para ganancias y pedido finalizado.");
            if (typeof cargarPedidosPendientes === "function") {
                cargarPedidosPendientes();
            }
            if (typeof window.__recargarPedidosClienteSiExiste === "function") {
                window.__recargarPedidosClienteSiExiste();
            }
        } catch (error) {
            console.error("confirmarEntregaMercadoPago:", error);
            alert("❌ Error: " + (error.message || error));
        }
    };
})();
