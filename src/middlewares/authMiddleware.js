const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
    const auth = req.headers.authorization || '';
    console.log('[AUTH] Authorization header:', auth ? 'present' : 'missing');
    const token = auth.startsWith('Bearer ' ) ? auth.slice(7) : null;
    if (!token) 
        return res.status(401).json({message:"Token requerido"});
    try{
        const p = jwt.verify(token, process.env.JWT_SECRET);
        req.user = {id: p.userId, role: p.role, email: p.email, fullname: p.fullname};
        console.log('[AUTH] OK user:', req.user);
        next();
    }catch(error){
        console.log('[AUTH] FAIL:', error.message);
        return res.status(401).json({ message: 'Token inválido o expirado' });
    }
}