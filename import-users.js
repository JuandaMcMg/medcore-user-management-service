const { PrismaClient } = require('@prisma/client');
const usersData = require('./users-backup.json');
const prisma = new PrismaClient();

async function importUsers() {
  for (const user of usersData) {
    await prisma.user.create({
      data: {
        // Mapear campos según tu nuevo schema
        id: user.id,
        email: user.email,
        fullname: user.name || user.fullname,
        // ... otros campos
      }
    });
  }
  console.log('✅ Usuarios importados al User Management Service');
}
importUsers();