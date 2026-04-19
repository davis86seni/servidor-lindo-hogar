/**
 * Carga la clave pública y la URL del endpoint de preferencias desde el servidor
 * (valores definidos en .env). No incluye el Access Token.
 */
(function () {
    // Siempre usar la URL de producción
    const origin = "https://servidor-lindo-hogar.onrender.com";

    window.__mpConfigReady = (async function loadMpPublicConfig() {
        try {
            const res = await fetch(`${origin}/api/mp-public-config`);
            if (!res.ok) {
                console.warn("Mercado Pago: el servidor devolvió", res.status, "al cargar la config pública.");
                return;
            }
            const data = await res.json();
            if (data.publicKey) {
                window.MERCADOPAGO_PUBLIC_KEY = data.publicKey;
            }
            if (data.preferenceApiUrl) {
                window.MP_PREFERENCE_API_URL = data.preferenceApiUrl;
            }
        } catch (e) {
            console.warn(
                "Mercado Pago: no se pudo cargar la config desde",
                origin,
                "— ¿Está corriendo npm run mp-server?",
                e
            );
        }

        if (typeof MercadoPago !== "undefined" && window.MERCADOPAGO_PUBLIC_KEY) {
            try {
                window.mpSDK = new MercadoPago(window.MERCADOPAGO_PUBLIC_KEY);
            } catch (err) {
                console.warn("MercadoPago SDK:", err);
            }
        }
    })();
})();
