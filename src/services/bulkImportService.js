const {
  normalizeRole,
  normalizeStatus,
  isEmailValid,
  isPasswordStrong,
  generateTempPassword,
} = require("../utils/userUtils");
const { cleanToken, parseCsvRobustVerbose } = require("../utils/csvUtils");

/**
 * Prepara la data a insertar desde el buffer CSV.
 * NO toca base de datos. Mantiene el mismo flujo que ya usas.
 */
function prepareBulkUsersFromCsv(buffer) {
  const records = parseCsvRobustVerbose(buffer);
  if (!Array.isArray(records) || records.length === 0) {
    return { records: [], toInsert: [], errors: [{ row: 1, error: "CSV vacío o malformado" }], duplicatesCSV: [] };
  }

  const seenEmails = new Set();
  const toInsert = [];
  const errors = [];
  const duplicatesCSV = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2; // cabecera + base-1

    const email = cleanToken((row.email || "").toString()).toLowerCase().trim();
    const fullname = cleanToken((row.fullname || "").toString()).trim();
    const role = normalizeRole(row.role);
    const status = normalizeStatus(row.status);
    let passwordPlain = cleanToken((row.current_password || row.password || "").toString());

    if (!email || !isEmailValid(email)) {
      errors.push({ row: rowNum, email: row.email, error: "email faltante o invalido" });
      continue;
    }
    if (!fullname) {
      errors.push({ row: rowNum, email, error: "fullname faltante" });
      continue;
    }
    if (!role) {
      errors.push({ row: rowNum, email, error: "role faltante o invalido: ADMINISTRADOR, MEDICO, ENFERMERO, PACIENTE" });
      continue;
    }
    if (seenEmails.has(email)) {
      duplicatesCSV.push({ row: rowNum, email, error: "Email duplicado en el CSV" });
      continue;
    }
    seenEmails.add(email);

    if (passwordPlain) {
      if (!isPasswordStrong(passwordPlain)) {
        errors.push({ row: rowNum, email, error: "password no cumple requisitos de seguridad" });
        continue;
      }
    } else {
      passwordPlain = generateTempPassword();
    }

    toInsert.push({ email, fullname, role, status, passwordPlain,
        id_number: cleanToken(row.id_number || ""),
        id_type: cleanToken((row.id_type || "CC").toString()).toUpperCase(),
        date_of_birth: cleanToken(row.date_of_birth || ""),
        age: cleanToken(row.age || ""),
        gender: cleanToken((row.gender || "").toString()).toUpperCase(), // MASCULINO/FEMENINO...
        phone: cleanToken(row.phone || ""),
        city: cleanToken(row.city || ""),
        address: cleanToken(row.address || ""),
        specialization: cleanToken(row.specialization || ""),
        department: cleanToken(row.department || ""),
        license_number: cleanToken(row.license_number || ""),
     });
  }

  return { records, toInsert, errors, duplicatesCSV };
}

module.exports = { prepareBulkUsersFromCsv };