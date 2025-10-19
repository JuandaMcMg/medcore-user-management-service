# MedCore User Management Service

Este microservicio gestiona los usuarios y sus perfiles en el sistema MedCore, permitiendo realizar operaciones CRUD sobre usuarios y sus roles.

## Características

- Gestión completa de usuarios (CRUD)
- Gestión de roles y permisos
- Actualización de perfiles
- Búsqueda avanzada de usuarios
- Importación masiva de usuarios por CSV

## Tecnologías

- Node.js
- Express
- MongoDB (con Prisma ORM)
- JWT para verificación de identidad
- Multer para manejo de archivos

## Requisitos

- Node.js 14.x o superior
- MongoDB
- NPM o Yarn

## Instalación

1. Clonar el repositorio:
```bash
git clone <url-del-repositorio>
cd user-management-service
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar Prisma:
```bash
npx prisma generate
```

4. Crear archivo `.env` con las siguientes variables:
```
PORT=3003
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret-key
AUTH_SERVICE_URL=http://localhost:3002
AUDIT_SERVICE_URL=http://localhost:3006
```

5. Iniciar el servicio:
```bash
npm run dev
```

## Despliegue en Vercel

1. Asegúrate de tener una cuenta en [Vercel](https://vercel.com/) y el CLI instalado:
```bash
npm i -g vercel
```

2. Iniciar sesión en Vercel:
```bash
vercel login
```

3. Configurar variables de entorno en Vercel:
   - Ve a la configuración de tu proyecto en Vercel
   - Añade las variables de entorno mencionadas en el archivo `.env`

4. Desplegar el servicio:
```bash
vercel --prod
```

## Estructura del Proyecto

- `src/index.js`: Punto de entrada de la aplicación
- `src/controllers/`: Controladores para manejar la lógica de usuarios
- `src/routes/`: Definiciones de rutas
- `src/middlewares/`: Middleware de autenticación, validación, etc.
- `prisma/`: Esquemas de Prisma para la base de datos
- `src/services/`: Servicios para la lógica de negocio
- `src/utils/`: Utilidades como la importación CSV

## API Endpoints

- `GET /api/users`: Obtener lista de usuarios
- `GET /api/users/:id`: Obtener un usuario por ID
- `POST /api/users`: Crear un nuevo usuario
- `PUT /api/users/:id`: Actualizar un usuario
- `DELETE /api/users/:id`: Eliminar un usuario
- `POST /api/users/bulk-import`: Importación masiva de usuarios