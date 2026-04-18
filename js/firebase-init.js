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