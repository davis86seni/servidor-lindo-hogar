# Lindo Hogar - Instrucciones para Desarrollo

Este documento guía a agentes de AI en la estructura, convenciones y patrones del proyecto Lindo Hogar.

## 📋 Descripción del Proyecto

**Lindo Hogar** es una plataforma de e-commerce para una tienda de muebles y decoración del hogar, construida con tecnologías frontend modernas e integración con Firebase.

- **Stack**: HTML5, CSS3, JavaScript (vanilla), Bootstrap 5, Firebase (Firestore + Auth)
- **Idioma**: Español
- **Estado**: En desarrollo (práctica educativa)

## 🏗️ Arquitectura y Estructura

```
/                        # Carpeta raíz
├── .github/            # Configuración y documentación
├── css/                # Estilos
│   └── style.css       # Estilos globales
├── img/                # Imágenes del proyecto
├── js/                 # Lógica de negocio (módulos independientes)
│   ├── firebase-init.js    # Inicialización de Firebase (NUNCA mover/renombrar)
│   ├── auth.js             # Autenticación y gestión de usuarios
│   ├── productos.js        # Carga y gestión de catálogo
│   ├── carrito.js          # Carrito de compras (localStorage)
│   ├── checkout.js         # Flujo de compra y órdenes
│   ├── clientes.js         # Gestión de clientes (admin)
│   ├── admin.js            # Panel de administración
│   └── index.js            # Inicialización de página principal
├── *.html              # Páginas (index, admin, checkout, clientes, 404)
├── package.json        # Dependencias (firebase-admin)
├── productos.json      # Catálogo de productos (posible fuente de datos)
├── firebase.json       # Configuración de Firebase Hosting
├── importar.js         # Herramienta de importación de datos
└── tu-clave-privada.json.json  # Credenciales Firebase (¡NO COMMITEAR!)
```

## 🔐 Autenticación y Usuarios

**Patrón de Acceso:**
- **Google OAuth**: Único método de login (`auth.js`)
- **Admins**: Array hardcodeado en `auth.js` 
  ```javascript
  const admins = ["davis86seni@gmail.com", "elenaisabelceballos@gmail.com"];
  ```
- **Roles**: Admin o Cliente (determinado por email)

**Flujo de Auth:**
```javascript
firebase.auth().onAuthStateChanged(user => {
  if (user) {
    const esAdmin = admins.includes(user.email);
    // Diferenciar UI por rol
  }
});
```

**Importante**: Google Auth requiere credenciales en `firebase-init.js`. No editar configuración sin coordinación.

## 📦 Módulos Principales

### `firebase-init.js` (CRÍTICO)
- Inicializa Firebase y expone globales: `window.db`, `window.auth`
- Debe cargarse ANTES de otros scripts
- Contiene credenciales públicas (API Key visible es normal en cliente web)

### `auth.js`
- Gestiona login/logout con Google
- Renderiza UI de usuario (dropdown con foto, opciones)
- Diferencia admin de cliente
- Llama a `cargarResumenPedidosCliente()` si existe

### `productos.js`
- Carga catálogo desde Firestore (`db.collection("productos")`)
- Estructura esperada de producto:
  ```javascript
  {
    id: string,
    nombre: string,
    precio: number,
    stock: number,
    descripcion: string,
    imagen: string,
    // ... otros campos
  }
  ```
- Almacena en variable global `productos[]`

### `carrito.js`
- Persistencia local: `localStorage.set/getItem("carritoGuardado")`
- Estructura: Array de productos (repetidos = unidades)
- Funciones clave:
  - `agregarAlCarrito(id)` - valida stock
  - `obtenerCarritoAgrupado()` - agrupa por ID
  - `mostrarToastError(msg)` - notificaciones
- Toast de CSS esperado: clase `toast-notificacion`

### `checkout.js`
- Procesa compras: crea órdenes en Firestore
- Interactúa con carrito y autenticación
- Gestiona dirección de envío y pago

### `admin.js`
- Panel de administración (solo visible para admins)
- Gestión de productos, órdenes, clientes

### `clientes.js`
- Gestión de datos de clientes
- Posible búsqueda/filtrado de compras

## 💾 Almacenamiento

### Firebase Firestore
**Colecciones esperadas:**
- `productos` - Catálogo
- `pedidos` / `ordenes` - Historial de compras
- `usuarios` / `clientes` - Datos de clientes

**Autenticación**: Firebase Auth (Google provider)

### localStorage
- `carritoGuardado` - Carrito del usuario (antes de checkout)
- Otros datos temporales por página

## 🎨 Estilos y UI

**Framework**: Bootstrap 5 (CDN)
**Colores principales** (inferred):
- Encabezado: `#2c3e50` (gris oscuro)
- Botones: Bootstrap defaults (success=verde, danger=rojo, primary=azul)

**Patrones de UI**:
- Sticky header con logo y auth
- Botón carrito con badge de cantidad
- Toast notifications (CSS personalizado)
- Dropdown menus para usuario logueado
- Modal/alerts para confirmaciones

## 📝 Convenciones de Código

### Idioma
- **Variables y funciones**: camelCase en español
- **Comentarios**: Español
- **HTML y IDs**: TODO (puede ser mixto actualmente)

### JavaScript
- **Estilo**: Vanilla JS (sin frameworks)
- **Variables globales**: Minimizar uso, preferir módulos
- **Funciones**: Nombradas (arrow functions cuando son callbacks simples)
- **Async**: Promesas y async/await en Firestore queries
- **DOM**: `document.getElementById()`, `.addEventListener()`, `.innerHTML`

### Ejemplos de patrones existentes:
```javascript
// ✅ Variables locales con scope
let carritoProductos = JSON.parse(localStorage.getItem("carritoGuardado")) || [];

// ✅ Funciones sincrónicas cuando aplican
function almacenarCarrito() { localStorage.setItem(...) }

// ✅ Async para Firestore
async function agregarAlCarrito(id) {
  const doc = await db.collection("productos").doc(id.toString()).get();
  if (doc.exists) producto = { id: doc.id, ...doc.data() };
}

// ✅ Event listeners en HTML (onclick) - patrón actual
// ❓ Considerar migración a .addEventListener() para mejor prácticas
```

## 🔄 Flujos de Usuario

### Cliente - Flujo de Compra
1. Ver productos en `index.html`
2. Agregar al carrito (guarda en localStorage)
3. Ir a checkout (`checkout.html`)
4. Confirmar dirección y detalles
5. Crear order en Firestore
6. Ver estado de órdenes en resumen de pedidos

### Admin - Gestión
1. Login con email admin
2. Acceder a `admin.html`
3. Gestionar productos, órdenes, clientes
4. Actualizar estado de pedidos

## 🚀 Tareas Comunes

### Agregar un nuevo campo a producto
1. Actualizar estructura en Firestore
2. Incluir en `productos.js` cuando se lee
3. Mostrar en template HTML de `index.js`

### Crear nueva página
1. Crear `.html` en raíz
2. Cargar `firebase-init.js` PRIMERO
3. Luego módulos necesarios (auth.js, etc.)
4. Puede cargar CSS global `./css/style.css`

### Conectar nueva funcionalidad a Firestore
1. Usar `window.db` (definido en firebase-init.js)
2. Patrones: `db.collection(X).doc(Y).get()`, `.add()`, `.update()`, `.delete()`
3. Encapsular en función async
4. Manejar errores con try/catch

### Pedir datos a usuario admin
- Variables globales: `admins` en `auth.js`
- Verificar: `firebase.auth().currentUser.email`

## ⚠️ Consideraciones y Gotchas

### Seguridad
- **Credenciales públicas**: API Key en frontend es NORMAL (usar reglas de Firestore)
- **Credenciales privadas**: `tu-clave-privada.json.json` debe estar en `.gitignore` ¡CRÍTICO!
- **Tokens**: Firebase Auth maneja automáticamente

### Performance
- Productos: Considerar paginación si lista crece
- Carrito: localStorage tiene límite (~5-10MB), está bien para e-commerce pequeño
- Firestore: Revisar reglas de acceso para evitar lectura masiva

### Compatibilidad
- Browser: Moderno (ES6+), Firebase compat libraries indican soporte amplio
- Mobil: Bootstrap responsive, verificar en device real

### Testing
- No hay framework de test detectado
- Funciones críticas: carrito, compras, autenticación
- Considerar testing manual o Vitest/Jest

## 📚 Recursos Útiles

- [Firebase Documentation](https://firebase.google.com/docs)
- [Bootstrap 5 Docs](https://getbootstrap.com/docs/5.3/)
- [MDN Web Docs](https://developer.mozilla.org/)

## 🎯 Mejoras Futuras (Sugerencias)

- [ ] Migrar a event listeners (en lugar de onclick inline)
- [ ] Módulos ES6 (import/export)
- [ ] Testing unitario (Jest/Vitest)
- [ ] Validación de formularios mejorada
- [ ] Manejo de errores más robusto
- [ ] Documentación de API Firestore

---

**Última actualización:** Abril 2026  
**Responsable**: Documentación generada para productividad de AI  
