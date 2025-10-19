const mongoose = require('mongoose')
require('dotenv').config();

const DEFAULT_OPTIONS = {
  // opciones comunes que evitan warnings y mejoran compatibilidad
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
};

let connectPromise = global.__MONGOOSE_CONNECT_PROMISE__;

const connectDB = async () => {
  // No lanzar ni salir del proceso: loguear y devolver la promesa/cliente
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.warn('DATABASE_URL no está definida. Omitiendo conexión a MongoDB.');
    return null;
  }

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = mongoose.connect(dbUrl, DEFAULT_OPTIONS)
    .then(conn => {
      console.log(`MongoDB Connected: ${conn.connection.host} / ${conn.connection.name}`);
      return conn;
    })
    .catch(err => {
      console.error('MongoDB connection failed (will not crash function):', err && err.message ? err.message : err);
      // No re-throw y no process.exit: permitimos que la app siga en ejecución
      return null;
    });

  // Guardar en global para reutilizar entre invocaciones (evita abrir muchas conexiones)
  global.__MONGOOSE_CONNECT_PROMISE__ = connectPromise;
  return connectPromise;
};

module.exports = connectDB;