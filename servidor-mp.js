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

async function procesarPagoAprobado(payment) {
    const db = admin.firestore();
    const FieldValue = admin.firestore.FieldValue;

    const externalRef = payment.external_reference != null ? String(payment.external_reference).trim() : "";
    if (!externalRef) {
        console.warn("[webhook] Pago sin external_reference, no se actualiza pedido.");
        return;
    }

    const pedidoRef = db.collection("pedidos").doc(externalRef);
    const pedidoSnap = await pedidoRef.get();
    if (!pedidoSnap.exists) {
        console.warn("[webhook] Pedido no encontrado:", externalRef);
        return;
    }

    const pedido = pedidoSnap.data();
    const medio = (pedido.medioPago || "").toString();
    if (medio !== "mercado_pago") {
        console.warn("[webhook] Pedido no es Mercado Pago, se ignora:", externalRef, medio);
        return;
    }

    if (pedido.estado === "finalizado") {
        console.log("[webhook] Pedido ya finalizado:", externalRef);
        return;
    }

    const paymentIdStr = String(payment.id != null ? payment.id : "");
    if (pedido.estado === "pagado" && pedido.mpPaymentId && String(pedido.mpPaymentId) === paymentIdStr) {
        console.log("[webhook] Idempotente, pedido ya marcado pagado con este pago:", externalRef);
        return;
    }

    if (pedido.estado === "pagado") {
        console.warn("[webhook] Pedido ya pagado con otro flujo:", externalRef);
        return;
    }

    const items = Array.isArray(pedido.items) ? pedido.items : [];
    const approvedMs = payment.date_approved
        ? new Date(payment.date_approved).getTime()
        : Date.now();

    const batch = db.batch();

    items.forEach((item) => {
        const pid = item.id != null ? String(item.id) : "";
        const cantidad = Math.max(0, Number(item.cantidad) || 0);
        if (!pid || cantidad <= 0) return;
        const refProd = db.collection("productos").doc(pid);
        batch.update(refProd, {
            stock: FieldValue.increment(-cantidad),
            ultimaActualizacion: Date.now(),
        });
    });

    batch.update(pedidoRef, {
        estado: "pagado",
        stockDescontado: true,
        mpPaymentId: payment.id != null ? payment.id : null,
        mpPaymentStatus: payment.status || null,
        mpPaymentApprovedAt: approvedMs,
        mpTransactionAmount: payment.transaction_amount != null ? payment.transaction_amount : null,
        updatedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    console.log("[webhook] Pedido actualizado a pagado y stock descontado:", externalRef);
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
            await procesarPagoAprobado(payment);
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
