// Función para generar código de 6 dígitos
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

function formatDuration(minutes) {
  if (minutes % (24*60) === 0) {
    const days = minutes / (24*60);
    return days === 1 ? "1 día" : `${days} días`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hora" : `${hours} horas`;
  }
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}

module.exports = {
  generateVerificationCode,
  formatDuration
};