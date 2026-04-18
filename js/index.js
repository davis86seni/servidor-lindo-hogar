// 1. Configuración de Lindo Hogar
const firebaseConfig = {
    apiKey: "AIzaSyBU8I-CV7CLSsc7bfkUkabSy2xBMz-b4f4",
    authDomain: "tienda-lindo-hogar.firebaseapp.com",
    projectId: "tienda-lindo-hogar",
    storageBucket: "tienda-lindo-hogar.firebasestorage.app",
    messagingSenderId: "509412674517",
    appId: "1:509412674517:web:961640d810d8be0c2a0b5c",
    measurementId: "G-0819EPMJ2W"
};

// 2. INICIALIZACIÓN DE FIREBASE
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
// Exponemos una lista global opcional para el carrito (evita depender de productos.js en index.html)
window.productos = window.productos || [];
if (typeof window.COMISION_MP !== "number") {
    window.COMISION_MP = 1.12;
}

// --- 1. VARIABLES GLOBALES ---
let resultadosBusquedaCompletos = []; 
let limiteActualBusqueda = 12;
let indiceBusquedaTienda = []; 
let productosCargadosIniciales = []; 
let ultimoDocVisto = null; 
let cargandoProductos = false; 
let hayMasQueCargar = true;
const cantidadPorCarga = 20; 

// Estas variables se asignarán dentro del DOMContentLoaded para evitar el error de "null"
let container;
let inputBusqueda;

// --- 2. CARGA DE PRODUCTOS (FIREBASE) ---
async function cargarTienda(esNuevaBusqueda = false) {
    // Protección: Si el contenedor no existe todavía, no hace nada
    if (!container) return;
    
    if (cargandoProductos || (!hayMasQueCargar && !esNuevaBusqueda)) return;
    
    cargandoProductos = true;
    const valorInput = inputBusqueda ? inputBusqueda.value.trim() : "";
    const categoriaElement = document.querySelector("#filtro-categoria");
    const ordenElement = document.querySelector("#filtro-orden");
    
    const categoria = categoriaElement ? categoriaElement.value : "TODOS";
    const orden = ordenElement ? ordenElement.value : "recientes";

    if (esNuevaBusqueda) {
        container.innerHTML = '<div class="text-center w-100"><p>🔍 Cargando tienda...</p></div>';
        ultimoDocVisto = null;
        hayMasQueCargar = true;
    }

    try {
        let consulta = db.collection("productos");

        if (categoria !== "TODOS") {
            consulta = consulta.where("categoria", "==", categoria);
        }
        
        if (orden === "precio-menor") {
            consulta = consulta.orderBy("precio", "asc");
        } else if (orden === "precio-mayor") {
            consulta = consulta.orderBy("precio", "desc");
        } else if (orden === "nombre-asc") {
            consulta = consulta.orderBy("nombre", "asc");
        } else {
            // Por defecto mostramos los productos más recientes o modificados recientemente
            consulta = consulta.orderBy("ultimaActualizacion", "desc");
        }

        if (!esNuevaBusqueda && ultimoDocVisto) {
            consulta = consulta.startAfter(ultimoDocVisto);
        }

        const snapshot = await consulta.limit(cantidadPorCarga).get();

        if (snapshot.empty) {
            if (esNuevaBusqueda) container.innerHTML = "<p class='text-center w-100'>No hay productos.</p>";
            hayMasQueCargar = false;
            return;
        }

        ultimoDocVisto = snapshot.docs[snapshot.docs.length - 1];
        const productosNuevos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Alimenta el carrito con lo ya cargado (sin duplicados)
        const mapa = new Map((window.productos || []).map(p => [String(p.id), p]));
        productosNuevos.forEach(p => mapa.set(String(p.id), p));
        window.productos = Array.from(mapa.values());

        if (esNuevaBusqueda && valorInput === "") {
            productosCargadosIniciales = productosNuevos;
        }

        renderizarProductos(productosNuevos, esNuevaBusqueda);

    } catch (error) {
        console.error("Error en Firebase:", error);
    } finally {
        cargandoProductos = false;
    }
}

// --- 3. RENDERIZADO DE CARDS ---
function renderizarProductos(lista, limpiar) {
    if (!container) return;
    if (limpiar) container.innerHTML = "";
    container.className = "row row-cols-2 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 g-2";

    lista.forEach(p => {
        const col = document.createElement("div");
        col.className = "col";
        
        const tieneStock = p.stock > 0;
        const stockBajo = tieneStock && p.stock <= 3;
        const imagenFinal = (!p.imagen || p.imagen === "-") ? 'img/sin-foto.webp' : p.imagen;
        const precioReal = Number(p.precio || 0);
        const precioMP = Math.round(precioReal * window.COMISION_MP);

        col.innerHTML = `
            <div class="card h-100 shadow-sm border-0">
                <img src="${imagenFinal}" class="card-img-top" alt="${p.nombre}" style="height: 150px; object-fit: cover; cursor:pointer;">
                <div class="card-body d-flex flex-column p-2 text-center">
                    <h5 class="card-title mb-1" style="font-size: 0.9rem; height: 2.2rem; overflow: hidden;">${p.nombre}</h5>
                    <p class="card-text fw-bold mb-1 text-success" style="font-size: 1.1rem;">$${precioReal.toLocaleString()}</p>
                    <p class="small mb-1" style="font-size: 0.72rem;">
                        <span class="badge text-bg-success">Descuento Efectivo / Transferencia</span>
                    </p>
                    <p class="small mb-2 text-secondary" style="font-size: 0.72rem;">
                        Precio Lista / Mercado Pago: $${precioMP.toLocaleString()}
                    </p>
                    <p class="small mb-2">
                        <span class="${stockBajo ? 'text-danger fw-bold' : 'text-muted'}" style="font-size: 0.75rem;">
                            ${tieneStock ? 'Stock: ' + p.stock : 'SIN STOCK'}
                        </span>
                    </p>
                    <button class="btn ${tieneStock ? 'btn-primary' : 'btn-secondary'} btn-add w-100 fw-bold mt-auto rounded-pill btn-sm"
                        id="${p.id}" ${!tieneStock ? 'disabled' : ''}>
                        ${tieneStock ? 'AGREGAR' : 'AGOTADO'}
                    </button>
                </div>
            </div>`;
        container.appendChild(col);
    });
}

// --- 4. BÚSQUEDA ---
async function cargarMasResultados(limpiarPantalla = false) {
    const inicio = limiteActualBusqueda - 12;
    const idsParaCargar = resultadosBusquedaCompletos
        .slice(inicio, limiteActualBusqueda)
        .map(c => c.id);

    try {
        const promesas = idsParaCargar.map(id => db.collection("productos").doc(id).get());
        const docsResult = await Promise.all(promesas);
        const resultadosFinales = docsResult.map(doc => ({ id: doc.id, ...doc.data() }));
        
        renderizarProductos(resultadosFinales, limpiarPantalla);
        gestionarBotonVerMas();
    } catch (err) {
        console.error("Error al cargar resultados:", err);
    }
}

function gestionarBotonVerMas() {
    const btnPrevio = document.getElementById("btn-ver-mas-busqueda");
    if (btnPrevio) btnPrevio.remove();

    if (limiteActualBusqueda < resultadosBusquedaCompletos.length) {
        const restantes = resultadosBusquedaCompletos.length - limiteActualBusqueda;
        const divBtn = document.createElement("div");
        divBtn.className = "text-center w-100 my-4";
        divBtn.id = "btn-ver-mas-busqueda";
        divBtn.innerHTML = `
            <button class="btn btn-primary rounded-pill fw-bold px-5 shadow-sm">
                ➕ Ver más productos (${restantes} restantes)
            </button>`;
        container.appendChild(divBtn);

        divBtn.querySelector("button").onclick = () => {
            limiteActualBusqueda += 12;
            cargarMasResultados(false);
        };
    }
}

// --- 5. DETALLE DE PRODUCTO ---
async function abrirDetalleProducto(id) {
    try {
        const doc = await db.collection("productos").doc(id).get();
        if (doc.exists) {
            const p = { id: doc.id, ...doc.data() };
            const imagenFinal = (!p.imagen || p.imagen === "-") ? 'img/sin-foto.webp' : p.imagen;
            const precioReal = Number(p.precio || 0);
            const precioMP = Math.round(precioReal * window.COMISION_MP);

            document.getElementById("img-detalle").src = imagenFinal; 
            document.getElementById("titulo-detalle").innerText = p.nombre;
            document.getElementById("descripcion-detalle").innerText = p.detalle || '';
            document.getElementById("precio-detalle").innerHTML = `
                <span class="text-success">$${precioReal.toLocaleString()}</span>
                <small class="d-block text-secondary mt-1">Precio Lista / Mercado Pago: $${precioMP.toLocaleString()}</small>
            `;
            document.getElementById("stock-detalle").innerText = `Stock disponible: ${p.stock}`;

            const contenedorBoton = document.getElementById("contenedor-boton-modal");
            if (contenedorBoton) {
                contenedorBoton.innerHTML = `
                <button class="btn btn-primary btn-lg rounded-pill fw-bold" 
                    onclick="agregarAlCarrito('${p.id}'); bootstrap.Modal.getInstance(document.getElementById('modal-detalle')).hide(); actualizarContadorInterfaz();">
                    🛒 AGREGAR AL CARRITO
                </button>`;
            }

            const miModal = new bootstrap.Modal(document.getElementById('modal-detalle'));
            miModal.show();
        }
    } catch (error) {
        console.error("Error al abrir detalle:", error);
    }
}

function actualizarContadorInterfaz() {
    const contador = document.getElementById("contador-carrito");
    if (contador) {
        const total = typeof carritoProductos !== 'undefined' ? carritoProductos.length : 0;
        contador.innerText = total;
        contador.style.display = total > 0 ? "inline-block" : "none";
    }
}

// --- 6. INICIALIZACIÓN UNIFICADA ---
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Asignar elementos del DOM
    container = document.querySelector("#contenedor-productos");
    inputBusqueda = document.querySelector("#input-busqueda");

    // 2. Carga inicial
    cargarTienda(true);
    actualizarContadorInterfaz();

    // 3. Configuración del Buscador
    if (inputBusqueda) {
        inputBusqueda.addEventListener("input", async (e) => {
            const terminoRaw = e.target.value.trim();
            const limpiar = (t) => t.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            if (terminoRaw === "") {
                renderizarProductos(productosCargadosIniciales, true);
                const btnPrevio = document.getElementById("btn-ver-mas-busqueda");
                if (btnPrevio) btnPrevio.remove();
                return;
            }

            // Índice de búsqueda: se construye recién cuando el usuario busca (evita demora al entrar)
            if (indiceBusquedaTienda.length === 0) {
                try {
                    const snap = await db.collection("productos").get();
                    indiceBusquedaTienda = snap.docs.map(doc => ({
                        id: doc.id,
                        nombre: doc.data().nombre || ""
                    }));
                } catch (error) {
                    console.error("Error al crear el índice:", error);
                    return;
                }
            }

            const busquedaLimpia = limpiar(terminoRaw);
            resultadosBusquedaCompletos = indiceBusquedaTienda.filter(p => 
                limpiar(p.nombre).includes(busquedaLimpia)
            );
            
            limiteActualBusqueda = 12;

            if (resultadosBusquedaCompletos.length > 0) {
                cargarMasResultados(true);
            } else {
                if (container) {
                    container.innerHTML = `<div class="text-center w-100"><p class="fs-5 text-muted">❌ No encontramos "${terminoRaw}"</p></div>`;
                }
            }
        });
    }

    // 4. Configurar Filtros
    const fCat = document.querySelector("#filtro-categoria");
    const fOrd = document.querySelector("#filtro-orden");
    if (fCat) fCat.addEventListener("change", () => cargarTienda(true));
    if (fOrd) fOrd.addEventListener("change", () => cargarTienda(true));

    // 5. Scroll Infinito
    window.addEventListener("scroll", () => {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 600) {
            if (inputBusqueda && inputBusqueda.value.trim() === "") {
                cargarTienda(false);
            }
        }
    });

    // 6. Eventos de clic
    document.addEventListener("click", (e) => {
        if (e.target.classList.contains("btn-add")) {
            const idProducto = e.target.id;
            if (typeof agregarAlCarrito === "function") {
                agregarAlCarrito(idProducto);
                actualizarContadorInterfaz();
            }
        }

        if (e.target.classList.contains("card-img-top")) {
            const card = e.target.closest(".card");
            const btn = card.querySelector(".btn-add");
            if (btn) abrirDetalleProducto(btn.id);
        }
    });
});

// ...existing code...

// NUEVA: Cargar resumen de pedidos del cliente actual
async function cargarResumenPedidosCliente() {
    return await cargarPedidosUsuarioPagina({ reset: true });
}

function toggleResumenPedidos() {
    const seccion = document.getElementById("seccion-resumen-pedidos");
    if (!seccion) return;
    seccion.style.display = (seccion.style.display === "none" || seccion.style.display === "") ? "block" : "none";
    if (seccion.style.display === "block") {
        if (typeof cargarResumenPedidosCliente === "function") cargarResumenPedidosCliente();
        seccion.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

function abrirMisPedidos() {
    const seccion = document.getElementById("seccion-resumen-pedidos");
    if (!seccion) return;
    seccion.style.display = "block";
    if (typeof cargarResumenPedidosCliente === "function") cargarResumenPedidosCliente();
    seccion.scrollIntoView({ behavior: "smooth", block: "start" });
}

// --- Pedidos del usuario (paginado + filtro) ---
const PEDIDOS_USUARIO_PAGE_SIZE = 9;
// "Pendientes" para el cliente = pedidos todavía NO confirmados por el vendedor
const PEDIDOS_PENDIENTES_ESTADOS = ["fiado"];

let pedidosUsuarioUltimoDoc = null;
let pedidosUsuarioCargando = false;
let pedidosUsuarioHayMas = true;
let pedidosUsuarioFiltro = "pendientes"; // "pendientes" | "todos"

function renderPedidoUsuarioCard(pedido) {
    const fecha = pedido.creadoAt?.toDate ? pedido.creadoAt.toDate().toLocaleDateString() : "Sin fecha";
    const estado = (pedido.estado || "sin_estado").toString();
    const estadoUpper = estado.replace(/_/g, " ").toUpperCase();

    const colorEstado =
        estado === "fiado" ? "warning" :
        estado === "finalizada" || estado === "pagado" ? "success" :
        "danger";

    const icono =
        estado === "fiado" ? "⏳" :
        estado === "finalizada" || estado === "pagado" ? "✅" :
        "❌";

    return `
        <div class="col-md-6 col-lg-4">
            <div class="card h-100 shadow-sm border-0">
                <div class="card-header bg-${colorEstado}">
                    <h6 class="mb-0">${icono} ${estadoUpper}</h6>
                </div>
                <div class="card-body">
                    <p class="small text-muted mb-2">${fecha}</p>
                    <ul class="list-unstyled small mb-3">
                        ${(pedido.items || []).map(item =>
                            `<li>• ${item.cantidad}x ${item.nombre} - $${item.subtotal}</li>`
                        ).join("")}
                    </ul>
                    <hr>
                    <p class="fw-bold mb-0">Total: <span class="text-success">$${Number(pedido.total || 0).toLocaleString()}</span></p>
                </div>
            </div>
        </div>`;
}

function actualizarBotonVerMasPedidosUsuario() {
    const btn = document.getElementById("btn-ver-mas-pedidos");
    if (!btn) return;
    btn.style.display = pedidosUsuarioHayMas ? "inline-block" : "none";
    btn.disabled = pedidosUsuarioCargando;
    btn.textContent = pedidosUsuarioCargando ? "Cargando..." : "Ver más";
}

async function cargarPedidosUsuarioPagina({ reset = false } = {}) {
    const user = firebase.auth().currentUser;
    if (!user) return;

    const seccion = document.getElementById("seccion-resumen-pedidos");
    const contenedor = document.getElementById("contenedor-pedidos-usuario");
    const selectFiltro = document.getElementById("filtro-pedidos-usuario");
    if (!seccion || !contenedor) return;

    if (selectFiltro) pedidosUsuarioFiltro = selectFiltro.value || pedidosUsuarioFiltro;

    if (pedidosUsuarioCargando) return;
    if (!pedidosUsuarioHayMas && !reset) return;

    if (reset) {
        pedidosUsuarioUltimoDoc = null;
        pedidosUsuarioHayMas = true;
        contenedor.innerHTML = "";
    }

    pedidosUsuarioCargando = true;
    actualizarBotonVerMasPedidosUsuario();

    try {
        let consulta = db.collection("pedidos")
            .where("clienteId", "==", user.uid);

        if (pedidosUsuarioFiltro === "pendientes") {
            // Sin confirmar por el vendedor
            consulta = consulta.where("estado", "==", "fiado");
        }

        consulta = consulta.orderBy("creadoAt", "desc");

        if (pedidosUsuarioUltimoDoc) {
            consulta = consulta.startAfter(pedidosUsuarioUltimoDoc);
        }

        // Pedimos 1 extra para saber si hay más (para mostrar "Ver más")
        const snapshot = await consulta.limit(PEDIDOS_USUARIO_PAGE_SIZE + 1).get();

        if (snapshot.empty) {
            pedidosUsuarioHayMas = false;
            actualizarBotonVerMasPedidosUsuario();
            if (reset) {
                contenedor.innerHTML = `
                    <div class="col-12">
                        <div class="alert alert-light border text-center mb-0">
                            No hay pedidos para este filtro.
                        </div>
                    </div>`;
            }
            return;
        }

        const docs = snapshot.docs;
        pedidosUsuarioHayMas = docs.length > PEDIDOS_USUARIO_PAGE_SIZE;
        const docsPagina = pedidosUsuarioHayMas ? docs.slice(0, PEDIDOS_USUARIO_PAGE_SIZE) : docs;
        pedidosUsuarioUltimoDoc = docsPagina[docsPagina.length - 1];
        const pedidos = docsPagina.map(doc => ({ id: doc.id, ...doc.data() }));

        if (reset && pedidos.length === 0) {
            contenedor.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-light border text-center mb-0">
                        No hay pedidos para este filtro.
                    </div>
                </div>`;
            return;
        }

        // Mostrar sección (solo si se abrió desde "Mis pedidos")
        // No la abrimos automáticamente desde el login.
        // Si está visible, renderizamos.
        contenedor.insertAdjacentHTML("beforeend", pedidos.map(renderPedidoUsuarioCard).join(""));
    } catch (error) {
        console.error("Error cargando pedidos:", error);
    } finally {
        pedidosUsuarioCargando = false;
        actualizarBotonVerMasPedidosUsuario();
    }
}

function cambiarFiltroPedidosUsuario() {
    cargarPedidosUsuarioPagina({ reset: true });
}

function cargarMasPedidosUsuario() {
    cargarPedidosUsuarioPagina({ reset: false });
}