/**
 * Servidor para Mercado Pago (Checkout Pro) + webhook que actualiza Firestore.
 * Configurá en .env: MERCADOPAGO_ACCESS_TOKEN, SITE_URL,
 * y credenciales de Firebase (GOOGLE_APPLICATION_CREDENTIALS o FIREBASE_SERVICE_ACCOUNT_PATH).
 *
 * Uso: npm run mp-server
 */
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const { MercadoPagoConfig, Preference } = require("mercadopago");
const admin = require("firebase-admin");

const PORT = Number(process.env.PORT_MP || 3456);
const siteUrl = (process.env.SITE_URL || "https://tienda-lindo-hogar.web.app").replace(/\/$/, "");
const mpPublicOrigin = (
    process.env.MP_PUBLIC_ORIGIN || "https://servidor-lindo-hogar.onrender.com"
).replace(/\/$/, "");
const webhookPublicUrl = (process.env.MP_WEBHOOK_PUBLIC_URL || mpPublicOrigin).replace(/\/$/, "");

function initFirebaseAdmin() {
    if (admin.apps.length) return admin.app();

    const explicitPath =
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    let jsonPath = explicitPath;
    if (!jsonPath) {
        const candidates = [
            path.join(__dirname, "tu-clave-privada.json"),
            path.join(__dirname, "tu-clave-privada.json.json"),
        ];
        jsonPath = candidates.find((p) => fs.existsSync(p));
    }

    if (jsonPath && fs.existsSync(jsonPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
        return admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    }

    console.warn(
        "[Firebase] No se encontró JSON de service account. Definí GOOGLE_APPLICATION_CREDENTIALS o FIREBASE_SERVICE_ACCOUNT_PATH."
    );
    return admin.initializeApp();
}

initFirebaseAdmin();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

/** Expone solo la Public Key y la URL del API (sin Access Token). */
app.get("/api/mp-public-config", (req, res) => {
    const publicKey = process.env.MERCADOPAGO_PUBLIC_KEY;
    if (!publicKey) {
        return res.status(500).json({ error: "Falta MERCADOPAGO_PUBLIC_KEY en .env" });
    }
    res.json({
        publicKey,
        preferenceApiUrl: `${mpPublicOrigin}/api/crear-preferencia`,
    });
});

app.post("/api/crear-preferencia", async (req, res) => {
    try {
        const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
        if (!accessToken) {
            return res.status(500).json({ error: "Falta MERCADOPAGO_ACCESS_TOKEN en .env" });
        }

        const { items, payerEmail, external_reference } = req.body || {};
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: "Se requiere un array items no vacío." });
        }

        const client = new MercadoPagoConfig({
            accessToken: accessToken,
            options: { timeout: 15000 },
        });
        const preference = new Preference(client);

        const body = {
            items: items.map((it, i) => ({
                id: String(it.id ?? `item-${i}`),
                title: String(it.title || "Producto").slice(0, 256),
                quantity: Math.max(1, Number(it.quantity) || 1),
                unit_price: Number(it.unit_price),
                currency_id: "ARS",
                ...(it.picture_url && String(it.picture_url).startsWith("http")
                    ? { picture_url: it.picture_url }
                    : {}),
            })),
            back_urls: {
                success: `${siteUrl}/gracias.html`,
                failure: `${siteUrl}/checkout.html`,
                pending: `${siteUrl}/checkout.html`,
            },
        };

        if (external_reference != null && String(external_reference).trim() !== "") {
            body.external_reference = String(external_reference).trim();
        }

        // Mercado Pago llama a esta URL cuando cambia el estado del pago (debe ser HTTPS en producción).
        body.notification_url = `${webhookPublicUrl}/webhook`;

        if (siteUrl.startsWith("https://")) {
            body.auto_return = "approved";
        }

        if (payerEmail && typeof payerEmail === "string") {
            body.payer = { email: payerEmail };
        }

        const result = await preference.create({ body });
        const checkoutUrl = result.init_point;

        if (!checkoutUrl) {
            return res.status(500).json({ error: "La API no devolvió URL de checkout." });
        }

        res.json({
            id: result.id,
            init_point: checkoutUrl,
        });
    } catch (err) {
        console.error(err);
        const msg = err.cause?.message || err.message || "Error creando preferencia";
        res.status(500).json({ error: msg });
    }
});

/**
 * Obtiene el id del pago desde la notificación de Mercado Pago (varía según versión/topic).
 */
function extractPaymentId(body, query) {
    const q = query || {};
    const b = body || {};
    if (q["data.id"]) return String(q["data.id"]);
    if (q.id && q.topic === "payment") return String(q.id);
    if (b.data && b.data.id != null) return String(b.data.id);
    if (b.id != null && (b.topic === "payment" || b.type === "payment")) return String(b.id);
    return "";
}

async function fetchPayment(accessToken, paymentId) {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Payment ${paymentId}: HTTP ${res.status} ${text}`);
    }
    return res.json();
}

/**
 * Pago de saldo fiado: external_reference = FIADO|clienteId|compraDocId
 * (misma comisión que checkout; el monto acreditado debe cubrir el saldo base).
 */
async function procesarPagoFiadoAprobado(payment) {
    const db = admin.firestore();
    const FieldValue = admin.firestore.FieldValue;

    const externalRef = payment.external_reference != null ? String(payment.external_reference).trim() : "";
    if (!externalRef.startsWith("FIADO|")) {
        return false;
    }

    const parts = externalRef.split("|");
    if (parts.length !== 3) {
        console.warn("[webhook] Referencia FIADO inválida:", externalRef);
        return true;
    }

    const clienteId = parts[1];
    const compraId = parts[2];
    const paymentIdStr = String(payment.id != null ? payment.id : "");

    const compraRef = db.collection("clientes").doc(clienteId).collection("compras").doc(compraId);
    const compraSnap = await compraRef.get();
    if (!compraSnap.exists) {
        console.warn("[webhook] Compra fiado no encontrada:", clienteId, compraId);
        return true;
    }

    const d = compraSnap.data();
    const estado = (d.estado || "").toString();
    if (estado !== "fiado" && estado !== "fiado_confirmado") {
        console.warn("[webhook] La compra no está en fiado:", estado, compraId);
        return true;
    }

    if (d.mpFiadoUltimoPaymentId && String(d.mpFiadoUltimoPaymentId) === paymentIdStr) {
        console.log("[webhook] FIADO idempotente:", compraId);
        return true;
    }

    const saldoAntes =
        d.saldoRestanteVenta !== undefined && d.saldoRestanteVenta !== null
            ? Number(d.saldoRestanteVenta)
            : Number(d.total || 0) - Number(d.entregaParcial || 0);

    const monto = Number(payment.transaction_amount || 0);
    if (saldoAntes <= 0 || monto <= 0) {
        console.warn("[webhook] FIADO sin saldo o monto inválido:", saldoAntes, monto);
        return true;
    }

    const aplicar = Math.min(monto, saldoAntes);
    let nuevoSaldoRestante = saldoAntes - aplicar;
    if (nuevoSaldoRestante < 0.02) nuevoSaldoRestante = 0;
    const nuevoEstado = nuevoSaldoRestante <= 0.01 ? "pagado" : estado;

    const fechaPago = payment.date_approved
        ? new Date(payment.date_approved).toLocaleString("es-AR")
        : new Date().toLocaleString("es-AR");
    const ts =
        payment.date_approved != null ? new Date(payment.date_approved).getTime() : Date.now();

    const updateCompra = {
        estado: nuevoEstado,
        saldoRestanteVenta: nuevoSaldoRestante,
        entregaParcial: FieldValue.increment(aplicar),
        historialPagos: FieldValue.arrayUnion({
            fecha: fechaPago,
            monto: aplicar,
            timestamp: ts,
            detalle: "Mercado Pago — saldo fiado",
            mpPaymentId: payment.id != null ? payment.id : null,
        }),
        mpFiadoUltimoPaymentId: payment.id != null ? payment.id : null,
        mpFiadoUltimoMonto: aplicar,
        updatedAt: FieldValue.serverTimestamp(),
    };

    const batch = db.batch();
    batch.update(compraRef, updateCompra);
    batch.update(db.collection("clientes").doc(clienteId), {
        saldoPendiente: FieldValue.increment(-aplicar),
    });

    const globalRef = db.collection("ventas_globales").doc(compraId);
    const globalSnap = await globalRef.get();
    if (globalSnap.exists) {
        batch.update(globalRef, updateCompra);
    }

    const pedidoRef = db.collection("pedidos").doc(compraId);
    const pedidoSnap = await pedidoRef.get();
    if (pedidoSnap.exists) {
        batch.update(pedidoRef, {
            estado: nuevoEstado,
            saldoRestanteVenta: nuevoSaldoRestante,
            saldoPendiente: nuevoSaldoRestante,
            entregaParcial: FieldValue.increment(aplicar),
            historialPagos: updateCompra.historialPagos,
            updatedAt: updateCompra.updatedAt,
        });
    }

    await batch.commit();
    console.log("[webhook] Pago fiado registrado:", compraId, "restante:", nuevoSaldoRestante);
    return true;
}

async function procesarPagoAprobado(payment) {
    const externalRef = payment.external_reference; 
    console.log("[webhook] Procesando pago aprobado para pedido:", externalRef);

    const pedidoRef = admin.firestore().collection("pedidos").doc(externalRef);
    const pedidoSnap = await pedidoRef.get();

    if (!pedidoSnap.exists) return;

    const pedidoData = pedidoSnap.data();
    const batch = admin.firestore().batch();

    // 1. Cambiamos el estado a pagado y marcamos que YA se descontó el stock
    batch.update(pedidoRef, {
        estado: "pagado",
        stockDescontado: true, // Esta marca es clave para no descontar dos veces
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2. Descontamos el stock de cada producto
    if (Array.isArray(pedidoData.items)) {
        pedidoData.items.forEach(item => {
            const prodRef = admin.firestore().collection("productos").doc(item.id.toString());
            batch.update(prodRef, {
                stock: admin.firestore.FieldValue.increment(-item.cantidad),
                ultimaActualizacion: Date.now()
            });
        });
    }

    await batch.commit();
    console.log("✅ Pedido pagado y stock restado automáticamente.");
}

/** Notificaciones Mercado Pago (payment). */
async function handleWebhook(req, res) {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
        console.error("[webhook] Falta MERCADOPAGO_ACCESS_TOKEN");
        return res.status(500).send("Config error");
    }

    try {
        const paymentId = extractPaymentId(req.body, req.query);
        if (!paymentId) {
            console.warn("[webhook] Sin id de pago en la notificación");
            return res.status(200).send("ok");
        }

        const payment = await fetchPayment(accessToken, paymentId);

        if (payment.status === "approved") {
            const fiadoHandled = await procesarPagoFiadoAprobado(payment);
            if (!fiadoHandled) {
                await procesarPagoAprobado(payment);
            }
        } else {
            console.log("[webhook] Pago no aprobado:", paymentId, payment.status);
        }

        res.status(200).send("ok");
    } catch (e) {
        console.error("[webhook]", e);
        res.status(500).send("error");
    }
}

app.post("/webhook", handleWebhook);
app.get("/webhook", handleWebhook);

app.listen(PORT, () => {
    console.log(`Mercado Pago: servidor en http://localhost:${PORT} (SITE_URL=${siteUrl})`);
    console.log(`Webhook local: ${webhookPublicUrl}/webhook — en producción configurá MP_WEBHOOK_PUBLIC_URL (HTTPS).`);
});
