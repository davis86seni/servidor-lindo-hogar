/**
 * Servidor mínimo para crear Preferencias de Mercado Pago (Checkout Pro).
 * El Access Token solo existe aquí; nunca lo pongas en el navegador.
 *
 * Uso: npm run mp-server
 * Configurá SITE_URL en .env con la URL exacta desde la que abrís el sitio (ej. http://127.0.0.1:5500).
 */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MercadoPagoConfig, Preference } = require("mercadopago");

const PORT = Number(process.env.PORT_MP || 3456);
const siteUrl = (process.env.SITE_URL || "http://127.0.0.1:5500").replace(/\/$/, "");
const mpPublicOrigin = (process.env.MP_PUBLIC_ORIGIN || `http://localhost:${PORT}`).replace(/\/$/, "");

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

        const { items, payerEmail } = req.body || {};
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: "Se requiere un array items no vacío." });
        }

        const client = new MercadoPagoConfig({ 
            accessToken: accessToken, 
            options: { timeout: 5000 } 
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

app.listen(PORT, () => {
    console.log(`Mercado Pago: servidor en http://localhost:${PORT} (SITE_URL=${siteUrl})`);
});
