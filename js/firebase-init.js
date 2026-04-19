const firebaseConfig = {
    apiKey: "AIzaSyBU8I-CV7CLSsc7bfkUkabSy2xBMz-b4f4",
    authDomain: "tienda-lindo-hogar.firebaseapp.com",
    projectId: "tienda-lindo-hogar",
    storageBucket: "tienda-lindo-hogar.firebasestorage.app",
    messagingSenderId: "509412674517",
    appId: "1:509412674517:web:961640d810d8be0c2a0b5c"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

window.db = window.db || firebase.firestore();
window.auth = window.auth || firebase.auth();

/** Backend del checkout Mercado Pago (Render). En local usá npm run mp-server en :3456. */
(function () {
    if (typeof window === "undefined" || !window.location) return;
    const h = window.location.hostname || "";
    const esLocal = h === "localhost" || h === "127.0.0.1";
    if (!window.MP_SERVER_ORIGIN) {
        window.MP_SERVER_ORIGIN = esLocal
            ? "http://localhost:3456"
            : "https://servidor-lindo-hogar.onrender.com";
    }
})();