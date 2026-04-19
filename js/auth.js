const admins = ["davis86seni@gmail.com", "elenaisabelceballos@gmail.com"];

window.LINDO_HOGAR_ADMINS = admins;
window.esUsuarioAdminLindoHogar = function esUsuarioAdminLindoHogar() {
    const u = firebase.auth().currentUser;
    return !!(u && admins.includes(u.email));
};

firebase.auth().onAuthStateChanged((user) => {
    const container = document.getElementById("auth-container");
    if (!container) return;

    if (user) {
        const esAdmin = admins.includes(user.email);
        container.innerHTML = `
            <div class="dropdown">
                <img src="${user.photoURL || 'https://via.placeholder.com/35'}" 
                     class="rounded-circle border border-2 border-white" 
                     style="width: 35px; cursor: pointer;" data-bs-toggle="dropdown">
                <ul class="dropdown-menu dropdown-menu-end shadow border-0">
                    <li class="px-3 py-2 small fw-bold text-muted">${user.displayName || user.email}</li>
                    <li><hr class="dropdown-divider"></li>
                    ${!esAdmin ? '<li><a class="dropdown-item fw-bold" href="pedidos.html">🧾 Mis pedidos</a></li>' : ''}
                    ${esAdmin ? '<li><a class="dropdown-item fw-bold text-primary" href="clientes.html">⚙️ Gestión Clientes</a></li>' : ''}
                    <li><button class="dropdown-item text-danger" onclick="firebase.auth().signOut()">Cerrar Sesión</button></li>
                </ul>
            </div>`;
    } else {
        container.innerHTML = `
            <button onclick="loginConGoogle()" class="btn btn-outline-light rounded-pill px-3 btn-sm fw-bold">
                👤 Ingresar
            </button>`;
        
        // Ocultar resumen si no hay usuario
        const seccion = document.getElementById("seccion-resumen-pedidos");
        if (seccion) seccion.style.display = "none";
    }
});

function loginConGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider)
        .catch(err => console.error("Error login:", err));
}