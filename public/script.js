document.addEventListener("DOMContentLoaded", async () => {
    // ======================
    // Elementos de la interfaz de usuario
    // ======================
    const empresaSelect = document.getElementById("empresa");
    const loginForm = document.getElementById("loginForm");
    const mensaje = document.getElementById("mensaje");
    const btnConsultar = document.getElementById("btnConsultar");
    const loadingMessage = document.getElementById("loadingMessage");
    const btnCrearFactura = document.getElementById("btnCrearFactura");    
    const btnCrearFacturaOrden = document.getElementById("btnCrearFactura");

    // ======================
    // Cargar empresas disponibles en el select
    // ======================
    try {
        const response = await fetch("http://localhost:3000/api/empresas");
        if (!response.ok) throw new Error("Error al obtener empresas");
        
        const empresas = await response.json();
        
        if (empresas.length === 0) throw new Error("No hay empresas disponibles");

        empresas.forEach(empresa => {
            let option = document.createElement("option");
            option.value = empresa.name;  // Guardamos el ID real
            option.textContent = empresa.name;  // Mostramos el alias
            empresaSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error al cargar empresas:", error);
        mensaje.textContent = "⚠️ Error al cargar empresas.";
        mensaje.style.color = "red";
    }

    // ======================
    // Manejo de formulario de login
    // ======================
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
    
        const empresa = empresaSelect.value;
        const usuario = document.getElementById("usuario").value.trim();
        const password = document.getElementById("password").value.trim();
    
        if (!empresa || !usuario || !password) {
            mensaje.textContent = "Todos los campos son obligatorios.";
            mensaje.style.color = "red";
            return;
        }

        console.log("📌 Enviando credenciales:", { empresa, usuario, password });
    
        try {
            const response = await fetch("http://localhost:3000/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ empresa, usuario, password })
            });
    
            const data = await response.json();
    
            if (response.ok) {
                mensaje.textContent = "✅ Login exitoso.";
                mensaje.style.color = "green";
    
                localStorage.setItem("sessionId", data.sessionId);
                localStorage.setItem("empresa", empresa.trim());
                localStorage.setItem("usuario", usuario.trim());

                console.log("📌 Session ID guardado:", localStorage.getItem("sessionId"));
    
                setTimeout(() => {
                    window.location.href = "menu.html";
                }, 500);
            } else {
                mensaje.textContent = "❌ " + (data.error || "Error desconocido en el login.");
                mensaje.style.color = "red";
            }
        } catch (error) {
            mensaje.textContent = "❌ Error de conexión.";
            mensaje.style.color = "red";
            console.error("Error en el login:", error);
        }
    });

    // ======================
    // Consultar órdenes de compra por proveedor
    // ======================
    btnConsultar.addEventListener("click", async function() {
        const proveedor = document.getElementById("txtProveedor").value.trim();
        
        if (proveedor === "") {
            alert("Por favor, ingrese el RUC o código del proveedor.");
            return;
        }

        try {
            loadingMessage.style.display = "block"; // Muestra mensaje de carga
            const sessionId = localStorage.getItem('sessionId'); // Obtener sessionId del login

            if (!sessionId) {
                alert("Sesión no válida o no autenticada.");
                return;
            }

            // ======================
            // Verificar sesión activa antes de la consulta
            // ======================
            const sessionResponse = await fetch("http://localhost:3000/api/session/valid", {
                headers: { 'X-SAP-SESSION-ID': sessionId }
            });

            const sessionValid = await sessionResponse.json();

            if (!sessionValid.valid) {
                alert("La sesión ha expirado, por favor inicie sesión nuevamente.");
                return;
            }

            // ======================
            // Realizar consulta de órdenes
            // ======================
            const response = await fetch(`http://localhost:3000/api/ordenes/proveedor/${proveedor}`, {
                headers: { 'X-SAP-SESSION-ID': sessionId }
            });

            const responseText = await response.text();
            console.log(responseText); // Aquí puedes ver si es HTML o JSON

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                alert("Hubo un error al procesar los datos. Respuesta inesperada del servidor.");
                return;
            }

            if (response.ok) {
                console.log("🚀 Órdenes de compra obtenidas:", data);
                loadingMessage.style.display = "none";
                // Aquí puedes manejar los datos recibidos y mostrarlos en la interfaz
            } else {
                loadingMessage.style.display = "none";
                alert(data.message || "No se pudieron obtener las órdenes.");
            }
        } catch (error) {
            loadingMessage.style.display = "none";
            console.error("Error al consultar órdenes:", error);
            alert("Error en la consulta de órdenes de compra.");
        }
    });   

    // ======================
    // Repetición de la carga de empresas (evitar duplicados)
    // ======================
    try {
        const response = await fetch("http://localhost:3000/api/empresas");
        if (!response.ok) throw new Error("Error al obtener empresas");
        
        const empresas = await response.json();
        
        if (empresas.length === 0) throw new Error("No hay empresas disponibles");

        empresas.forEach(empresa => {
            let option = document.createElement("option");
            option.value = empresa.id;
            option.textContent = empresa.nombre;
            empresaSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error cargando empresas:", error);
    }
});

// ======================
// Botón de regresar al menú
// ======================
document.getElementById("btnRegresar").addEventListener("click", function() {
    window.location.href = "menu.html"; 
});
// Evento para consultar órdenes de compra por proveedor
// ------------------------------------------------------
document.getElementById("btnConsultar").addEventListener("click", async function() {
    const proveedor = document.getElementById("txtProveedor").value.trim();
    const loadingMessage = document.getElementById("loadingMessage");

    if (!proveedor) {
        alert("Por favor, ingrese el RUC o código del proveedor.");
        return;
    }

    try {
        loadingMessage.style.display = "block"; 
        const sessionId = localStorage.getItem('sapSessionId'); 

        // Llamada a la API para obtener órdenes de compra del proveedor
        const response = await fetch(`http://localhost:3000/api/ordenes/proveedor/${proveedor}`, {
            headers: { 'X-SAP-SESSION-ID': sessionId }
        });

        const data = await response.json();
        if (!data.success) throw new Error(data.message);

        const tbody = document.querySelector("#tablaOrdenes tbody");
        tbody.innerHTML = ""; 

        if (!data.ordenes.length) {
            tbody.innerHTML = '<tr><td colspan="7">No se encontraron órdenes de compra</td></tr>';
            return;
        }

        // Poblar la tabla con las órdenes obtenidas
        data.ordenes.forEach(orden => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${orden.NroOrdenCompra}</td>
                <td>${new Date(orden.FechaOrden).toLocaleDateString()}</td>
                <td>${orden.CodigoProveedor}</td>
                <td>${orden.NombreProveedor}</td>
                <td>${orden.MontoOrden.toFixed(2)}</td>                
                <td>${orden.EstadoOrden}</td>
                <td>${orden.DocEntryOrden}</td>
                <td>${orden.CantidadFacturasAsociadas}</td>
            `;
            
            row.style.cursor = "pointer";
            row.addEventListener("click", function() {
                abrirModal(orden.NroOrdenCompra);
            });

            tbody.appendChild(row);
        });
    } catch (error) {
        alert("Error: " + error.message);
    } finally {
        loadingMessage.style.display = "none";
    }
});

// Función para abrir el modal con los detalles de la orden
// ---------------------------------------------------------
async function abrirModal(nroOrden) {
    const modal = document.getElementById("modalDetalle");
    modal.setAttribute("data-nroOrden", nroOrden);
    const tbodyDetalle = document.querySelector("#tablaDetalle tbody");
    tbodyDetalle.innerHTML = ""; // Limpiar la tabla antes de llenarla

    try {
        // Llamada a la API para obtener detalles de la orden
        const response = await fetch(`http://localhost:3000/api/ordenes/detalle/${nroOrden}`);
        const data = await response.json();

        if (!data.success) throw new Error(data.message);

        if (!data.detalles.length) {
            tbodyDetalle.innerHTML = '<tr><td colspan="12">No se encontraron detalles</td></tr>';
            return;
        }

        // Poblar la tabla con los detalles de la orden
        data.detalles.forEach(detalle => {
            const mostrarCheckbox = detalle.EstadoDetalle === "LIBRE (NO FACTURADO)";
            const checkboxHTML = mostrarCheckbox 
                ? `<input type="checkbox" class="checkboxSeleccion" data-lineaOrden="${detalle.LineaOrden}">`
                : '';

            const rowHTML = `
                <tr>
                    <td>${checkboxHTML}</td>
                    <td>${detalle.LineaOrden}</td>
                    <td>${detalle.CodigoArticulo}</td>
                    <td>${detalle.DescripcionArticulo}</td>
                    <td>${detalle.CantidadOrden}</td>
                    <td>${detalle.PrecioUnitario ? detalle.PrecioUnitario.toFixed(2) : "-"}</td>
                    <td>${detalle.TotalLineaOrden ? detalle.TotalLineaOrden.toFixed(2) : "-"}</td>
                    <td>${detalle.DocEntryOrden || "-"}</td>
                    <td>${detalle.NroFactura || "-"}</td>
                    <td>${detalle.LineaFactura || "-"}</td>
                    <td>${detalle.CantidadFacturada || 0}</td>
                    <td>${detalle.PrecioUnitarioFacturado ? detalle.PrecioUnitarioFacturado.toFixed(2) : "-"}</td>
                    <td>${detalle.TotalLineaFacturada ? detalle.TotalLineaFacturada.toFixed(2) : "-"}</td>
                    <td>${detalle.EstadoDetalle}</td>
                </tr>`;

            tbodyDetalle.insertAdjacentHTML("beforeend", rowHTML);
        });

        modal.style.display = "flex";
    } catch (error) {
        alert("Error al obtener detalles: " + error.message);
    }
}

// Función para cerrar el modal
// ----------------------------
function cerrarModal() {
    document.getElementById("modalDetalle").style.display = "none";
}

// Evento para crear factura a partir de los ítems seleccionados
// -------------------------------------------------------------
document.getElementById("btnCrear1").addEventListener("click", function() {
    const seleccionados = [];
    
    // Obtener las filas seleccionadas con checkbox
    document.querySelectorAll(".checkboxSeleccion:checked").forEach(checkbox => {
        const fila = checkbox.closest("tr");
        const detalle = {
            LineaOrden: fila.cells[1].textContent,
            CodigoArticulo: fila.cells[2].textContent,
            DescripcionArticulo: fila.cells[3].textContent,
            CantidadOrden: fila.cells[4].textContent,
            PrecioUnitario: fila.cells[5].textContent,
            TotalLineaOrden: fila.cells[6].textContent,
            DocEntryOrden: fila.cells[7].textContent
        };
        seleccionados.push(detalle);
    });

    if (seleccionados.length > 0) {
        localStorage.setItem("detallesFactura", JSON.stringify(seleccionados));
        window.location.href = "FacturaProveedor.html";
    } else {
        alert("No se seleccionaron artículos.");
    }
});
