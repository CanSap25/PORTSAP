const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const https = require("https");
const config = require("./config");
const sql = require("mssql"); // Importar el paquete mssql
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const app = express();
app.use(express.json()); 
app.use(cors());
app.use(bodyParser.json());

// Configurar Axios para aceptar certificados autofirmados
const axiosInstance = axios.create({
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
});

// 🔹 Almacenar sesiones activas y su tiempo de expiración
let activeSessions = {};

// ✅ Nueva ruta para obtener empresas disponibles
app.get("/api/empresas", (req, res) => {
    const empresasConAlias = config.COMPANIES.map(emp => ({
        id: emp.id, 
        name: emp.name 
    }));
    res.json(empresasConAlias);
});

// ✅ Función para validar si una sesión sigue activa o está por expirar
const isSessionValid = async (empresa) => {
    const session = activeSessions[empresa];
    if (!session || Date.now() > session.expiration) {
        return false;
    }

    try {
        await axiosInstance.get(`${config.SAP_BASE_URL}/CompanyService_GetCurrentCompany`, {
            headers: { "Cookie": `B1SESSION=${session.sessionId}` },
        });
        return true;
    } catch {
        return false;
    }
};

// ✅ Función para autenticarse en SAP y conectar a SQL automáticamente
const loginToSAP = async (empresa, usuario, password) => {
    if (await isSessionValid(empresa)) {
        console.log(`🔄 Sesión aún válida para ${empresa}`);
        return activeSessions[empresa].sessionId;
    }

    try {
        // 🔹 Conectar a SAP
        const response = await axiosInstance.post(`${config.SAP_BASE_URL}/Login`, {
            CompanyDB: empresa,
            UserName: usuario,
            Password: password,
        });

        const sessionId = response.data.SessionId;
        activeSessions[empresa] = {
            sessionId,
            expiration: Date.now() + 25 * 60 * 1000, // Expira en 25 minutos
        };

        console.log(`✅ Nueva sesión para ${empresa}: ${sessionId}`);

        // 🔹 Configuración de SQL con la base de datos SAP seleccionada
        const sqlConfig = {
            user: "sa", 
            password: "Andean2024$$",
            server: "26.105.36.174", 
            database: empresa, 
            options: {
                encrypt: false,
                trustServerCertificate: true,
            },
        };

        // 🔹 Conectar automáticamente a SQL Server
        try {
            await sql.connect(sqlConfig);
            console.log(`✅ Conexión a SQL establecida en la base de datos: ${empresa}`);
        } catch (sqlError) {
            console.error("❌ Error al conectar a SQL Server:", sqlError.message);
        }

        return sessionId;
    } catch (error) {
        console.error(`❌ Error al iniciar sesión en SAP (${empresa}):`, error.response?.data || error.message);
        throw error;
    }
};

// 🔄 Mantener sesiones activas renovándolas automáticamente
setInterval(async () => {
    for (const empresa of Object.keys(activeSessions)) {
        if (!(await isSessionValid(empresa))) {
            console.log(`♻️ Renovando sesión para ${empresa}`);
            try {
                activeSessions[empresa].sessionId = await loginToSAP(empresa, config.SAP_USER, config.SAP_PASSWORD);
            } catch (error) {
                console.error(`❌ Error al renovar sesión de ${empresa}:`, error.response?.data || error.message);
            }
        }
    }
}, 20 * 60 * 1000); // Renovar cada 20 minutos

// ✅ Ruta de login manual con corrección de empresa
app.post("/api/login", async (req, res) => {
    const { empresa, usuario, password } = req.body;

    if (!empresa || !usuario || !password) {
        return res.status(400).json({ error: "Faltan datos: empresa, usuario y password son requeridos." });
    }

    console.log("🔍 Empresa recibida:", empresa);
   
    // 🔹 Buscar el ID real en config.js ignorando mayúsculas y espacios
    const empresaReal = config.COMPANIES.find(e => e.name.toLowerCase().trim() === empresa.toLowerCase().trim())?.id;
    
    if (!empresaReal) {
        return res.status(400).json({ error: "Empresa no válida." });
    }

    try {
        const sessionId = await loginToSAP(empresaReal, usuario, password);      
        res.json({ success: true, message: "Inicio de sesión exitoso", redirectTo: "/menu.html" });
    } catch (error) {
        res.status(500).json({ error: "Error al conectar a SAP", details: error.response?.data || error.message });
    }
});

// ✅ Nueva ruta para consultar órdenes de compra por proveedor desde SQL
app.get("/api/ordenes/proveedor/:proveedor", async (req, res) => {
    const proveedor = req.params.proveedor;   
    const empresaActiva = Object.keys(activeSessions)[0]; 
    if (!empresaActiva) {
        return res.status(400).json({ success: false, message: "No hay sesión activa en SAP." });
    }
    try {       
        const pool = await sql.connect({
            user: "sa",
            password: "Andean2024$$",
            server: "26.105.36.174", 
            database: empresaActiva, 
            options: {
                encrypt: false,
                trustServerCertificate: true,
            },
        });

        const result = await pool.request()
            .input("Proveedor", sql.VarChar, proveedor)
            .execute("MKT_ObtenerCabeceraOrdenesConFacturas");
       
        res.json({ success: true, ordenes: result.recordset });
    } catch (error) {
        console.error("❌ Error al obtener órdenes de compra:", error);
        res.status(500).json({ success: false, message: "Error al obtener las órdenes de compra." });
    } finally {
        sql.close(); 
    }
});


// ✅ Nueva ruta para consultar detalles de una orden de compra desde SQL
app.get("/api/ordenes/detalle/:nroOrden", async (req, res) => {
    const nroOrden = req.params.nroOrden;   
    const empresaActiva = Object.keys(activeSessions)[0]; 

    if (!empresaActiva) {
        return res.status(400).json({ success: false, message: "No hay sesión activa en SAP." });
    }

    try {       
        const pool = await sql.connect({
            user: "sa",
            password: "Andean2024$$",
            server: "26.105.36.174", 
            database: empresaActiva, 
            options: {
                encrypt: false,
                trustServerCertificate: true,
            },
        });

        console.log(`🔍 Ejecutando procedimiento almacenado: MKT_ObtenerDetallesOrdenesAbiertas con @DocNum = ${nroOrden}`);

        const result = await pool.request()
            .input("DocNum", sql.VarChar, nroOrden)  // Corrección en el nombre del parámetro
            .execute("MKT_ObtenerDetallesOrdenesAbiertas"); // Corrección en el nombre del procedimiento
        
        console.log("✅ Resultados obtenidos:", result.recordset);

        res.json({ success: true, detalles: result.recordset });
    } catch (error) {
        console.error("❌ Error al obtener detalles de la orden de compra:", error);
        res.status(500).json({ success: false, message: "Error al obtener los detalles de la orden de compra." });
    } finally {
        await sql.close(); // Cierra la conexión correctamente
    }
});

// ✅ Funcion para crear la Factura a SAP

app.post("/api/crearFactura", async (req, res) => {
    try {
        const agent = new https.Agent({ rejectUnauthorized: false });

        // 🔹 Login en SAP
        const loginResponse = await axios.post(
            `https://SAPBO01:50000/b1s/v1/Login`,
            {
                CompanyDB: "ZZ_ANDEANPOWER_20250303",
                UserName: "manager",
                Password: "1234"
            },
            { 
                headers: { "Content-Type": "application/json" },
                httpsAgent: agent  
            }
        );

        if (!loginResponse.data || !loginResponse.data.SessionId) {
            console.error("❌ No se obtuvo SessionId de SAP.");
            return res.status(401).json({ success: false, error: "No se pudo iniciar sesión en SAP." });
        }

        const sessionId = loginResponse.data.SessionId;
        console.log("📌 Session ID obtenido:", sessionId);

        // 🔹 Datos recibidos desde el frontend
        const {
            proveedor,
            fechaContabilizacion,
            fechaVencimiento,
            fechaDocumento,
            numAtCard,
            glosa,
            correlativo,
            tipoDocumento,
            serie,
            detallesFactura,
            docEntryOrdenCompra // Añadir el DocEntry de la orden de compra
        } = req.body;

        // 🔹 Validaciones antes de construir el objeto facturaSAP
        if (!proveedor || !fechaContabilizacion || !fechaVencimiento || !fechaDocumento || !numAtCard) {
            return res.status(400).json({ success: false, error: "Faltan datos obligatorios en la factura." });
        }

        // 🔹 Construcción del objeto SAP con validaciones
        const facturaSAP = {
            CardCode: proveedor.trim(),
            DocDate: fechaContabilizacion.replace(/-/g, ""),  
            DocDueDate: fechaVencimiento.replace(/-/g, ""),  
            TaxDate: fechaDocumento.replace(/-/g, ""),  
            NumAtCard: numAtCard.trim(), 
            U_SYP_GLOSA: glosa ? glosa.trim() : "",
            U_BPP_MDCD: correlativo ? correlativo.trim() : "",
            U_BPP_MDTD: tipoDocumento ? tipoDocumento.trim() : "",
            U_BPP_MDSD: serie ? serie.trim() : "",
            PaymentGroupCode: -1,
            Indicator: "01",
            DocumentLines: detallesFactura.map(item => {
                return {
                    Dscription: item.DescripcionArticulo.trim(),
                    ItemCode: item.CodigoArticulo.trim(),
                    Quantity: parseFloat(item.CantidadOrden) || 1,
                    Price: parseFloat(item.PrecioUnitario) || 0,
                    LineTotal: parseFloat(item.TotalLineaOrden) || 0,
                    TaxCode: "IGV",
                    ...(item.CuentaMayor ? { AccountCode: item.CuentaMayor.trim() } : {}),
            
                    // 🔹 Asociación con la orden de compra
                    BaseEntry: item.DocEntryOrden ?? 0,  // Asegurar que siempre haya un número
                    BaseLine: item.LineaOrden ?? 0,
                    BaseType: 22  // **Forzar que siempre se incluya**
                };
            })
        };

        console.log("📌 Factura a enviar a SAP:", JSON.stringify(facturaSAP, null, 2));

        // 🔹 Envío de la factura a SAP
        const facturaResponse = await axios.post(
            `https://SAPBO01:50000/b1s/v1/PurchaseInvoices`, 
            facturaSAP,
            {
                headers: {
                    "Content-Type": "application/json",
                    "Cookie": `B1SESSION=${sessionId}`
                },
                httpsAgent: agent  
            }
        );

        res.json({ success: true, message: "Factura creada con éxito", data: facturaResponse.data });

    } catch (error) {
        console.error("❌ Error al crear factura en SAP:", error.response ? error.response.data : error.message);
        res.status(500).json({
            success: false,
            error: error.response ? error.response.data : error.message
        });
    }
});

// Servir archivos estáticos desde la carpeta 'public'
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, HOST, () => {
    console.log(`0 Servidor corriendo en http://${HOST}:${PORT}`);
});