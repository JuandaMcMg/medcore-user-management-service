//Define que permisos exiten y que rol los tiene (RBAC)
const permissions={
    ADMINISTRADOR: [
        'user:create',
        'user:list',
        'user:deactivate',
        'user:activate',
        'user:delete',
        'role:assign',         // asignar roles a usuarios
        'audit:view',          // ver logs de auditoría
        'department:create',   
        'department:list',
        'department:update',
        'department:delete',
        'settings:update', 
        'specialty:create',   
        'specialty:list',
        'specialty:update',
        'specialty:delete', 
        'affiliation:create',   // crear afiliaciones
        'affiliation:list',     // listar afiliaciones
        'affiliation:delete',   // eliminar afiliaciones
    ],
    MEDICO: [
        'patient:view:assigned',     // ver pacientes de su departamento/especialidad
        'patient:update:diagnosis',  // actualizar diagnósticos
        'patient:update:prescription', // generar recetas
        'patient:update:notes',      // notas médicas en la historia clínica
        'patient:create:record',     // crear registros clínicos
        'appointment:view:assigned', // ver citas de sus pacientes
        'appointment:update:status', // cambiar estado de cita (atendido, cancelado)
        'department:list',            // ver lista de departamentos
        'specialty:list',            // ver lista de especialidades
        'diagnostic:create',         // crear diagnósticos
    ],

    ENFERMERO:[
        'patient:view:assigned',         // ver pacientes asignados
        'patient:update:vitals',         // actualizar signos vitales
        'patient:update:care-notes',     // notas de enfermería
        'appointment:view:assigned',     // ver citas relacionadas
        'medication:administer',         // registrar administración de medicamentos
        'department:list',            // ver lista de departamentos
        'specialty:list',            // ver lista de especialidades
    ],
    PACIENTE:[
        'patient:view:self',          // ver su propio perfil clínico
        'appointment:view:self',      // ver sus citas
        'appointment:request',        // solicitar nueva cita
        'profile:update:self',        // actualizar datos personales (dirección, teléfono)
        'password:change',            // cambiar su propia contraseña
    ]
};
module.exports = permissions