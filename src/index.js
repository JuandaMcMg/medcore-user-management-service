const express = require("express");
const database = require("./database/database");
const bodyparser = require("body-parser");
const userRoutes = require("./routes/userRoutes");
const cors = require("cors");
const helmet = require("helmet");
const { sanitizeInputs } = require("./middlewares/sanitizeMiddleware");

require("dotenv").config();

const port = process.env.PORT || 3003;

const app = express();

// Permitir CORS para comunicación entre microservicios
app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:3001"], // Frontend y API Gateway
  credentials: true,
}));

app.get("/health", (_req, res) =>
  res.json({ 
    ok: true, 
    ts: new Date().toISOString(),
    service: "user-management-service",
    port: port
  })
);

app.use(helmet()); // Añade headers de seguridad
app.use(bodyparser.json());
app.use(sanitizeInputs); // Sanitiza las entradas contra XSS
app.use('/api/v1/users', userRoutes);
app.use('/api/users', userRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("User Management Service Error:", err);
  res.status(500).json({ 
    error: "Internal Server Error", 
    message: "User management service encountered an error",
    service: "user-management-service"
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: "Not Found", 
    message: `Route ${req.originalUrl} not found in user management service`,
    service: "user-management-service"
  });
});


database()

app.listen(port, () => {
  console.log(`👥 User Management Service running on port ${port}`);
  database();
});

module.exports = app;