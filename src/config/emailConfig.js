const path = require("path");
const fs = require("fs");

// Función para generar código de 6 dígitos
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};


// Plantilla HTML para correo de activación de cuenta creadas por el ADMIN 
function getActivationEmailTemplate(fullname, activationCode) {
  return `
  <div style="font-family: Arial, sans-serif; background-color: #F9FAFB; padding: 30px;">
    <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #E6F9F0, #D0F2E0); border-radius: 12px; box-shadow: 0 6px 18px rgba(0,0,0,0.1); padding: 30px; text-align: center;">
      <img src="cid:medcore-logo" alt="MedCore Logo" style="width: 80px; margin-bottom: 20px;" />
      <h2 style="color: #333;">¡Bienvenido, ${fullname}!</h2>
      <p style="color: #444; font-size: 15px;">
        Para activar tu cuenta en <strong>MedCore</strong>, utiliza el siguiente código:
      </p>
      <div style="background: linear-gradient(90deg, #88D4AB, #6ECF97); padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h1 style="font-size: 36px; letter-spacing: 6px; color: #fff; margin: 0;">${activationCode}</h1>
      </div>
      <p style="color: #444; font-size: 14px;">
        Este código <strong>expira en 24 horas</strong>. Si no solicitaste esta cuenta, ignora este correo.
      </p>
      <p style="font-size: 12px; color: #777; margin-top: 30px;">
        © 2025 MedCore. Todos los derechos reservados.
      </p>
    </div>
  </div>`;
}

// Función para enviar email de activación de cuenta
async function sendVerificationEmailViaAuth(email, fullname, code) {
  try {
    const payload = { email, fullname, verificationCode: code };
    await axios.post(`${AUTH_SERVICE_URL}/send-verification`, payload, { timeout: 10000 });
    return { success: true };
  } catch (err) {
    console.warn(`[EMAIL] No se pudo enviar email a ${email}: ${err.message}`);
    return { success: false, error: err.message };
  }
}


module.exports = {
  generateVerificationCode,
  sendVerificationEmailViaAuth,
};