const jwt = require('jsonwebtoken');
const crypto = require('crypto');

module.exports = async function verifyJWT(req, res, next) {
  const h = req.headers['authorization'] || '';
  console.log('[AUTH] Raw Authorization header =', JSON.stringify(h));

  if (!h.startsWith('Bearer ')) {
    console.log('[AUTH] Missing Bearer prefix');
    return res.status(401).json({ message: 'Missing token' });
  }

  const token = h.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.log('[AUTH] Token parts!=3');
    return res.status(401).json({ message: 'Malformed token' });
  }

  // Decodifica SIN verificar para log
  const b64uToStr = (s) => Buffer.from(s, 'base64url').toString('utf8');
  let headerStr = '', payloadStr = '';
  try {
    headerStr = b64uToStr(parts[0]);
    payloadStr = b64uToStr(parts[1]);
  } catch (e) {
    console.log('[AUTH] Base64 decode error:', e.message);
  }

  console.log('[AUTH] token.header =', headerStr);
  console.log('[AUTH] token.payload =', payloadStr);

  // Firma esperada con el secreto local (para detectar mismatch de secreto)
  const unsigned = parts[0] + '.' + parts[1];
  const expectedSig = crypto
    .createHmac('sha256', process.env.JWT_SECRET || '')
    .update(unsigned)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const gotSig = parts[2];

  const secHash = crypto.createHash('sha256').update(process.env.JWT_SECRET || '').digest('hex');
  console.log('[AUTH] local JWT_SECRET sha256 =', secHash);
  console.log('[AUTH] expectedSig (with local secret) =', expectedSig);
  console.log('[AUTH] token.sig (got)               =', gotSig);
  console.log('[AUTH] sig match? ', expectedSig === gotSig);

  try {
    // Aquí haces tu verify "de verdad" (algoritmo, issuer, etc. si usas opciones)
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    console.log('[AUTH] ✅ verify OK userId=', decoded.userId, 'role=', decoded.role);
    req.user = decoded;
    return next();
  } catch (err) {
    console.log('[AUTH] ❌ verify error name=', err.name, 'message=', err.message);
    return res.status(401).json({ message: 'Invalid token', error: err.message });
  }
};