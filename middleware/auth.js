const jwt = require("jsonwebtoken");

const SECRET_KEY =
  "8d8580a134436a4f2d55ac71e1685834d8f0c2d2f2714f05de91cdf5a3011e43";

const auth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, SECRET_KEY);

    const admin = await Admin.findById(decoded.id);

    // ✅ Check sessionId matches
    if (!admin || admin.sessionId !== decoded.sessionId) {
      return res.status(401).json({ message: "Session expired" });
    }

    req.user = admin;
    next();
  } catch (error) {
    return res.status(403).json({ message: "Invalid token" });
  }
};

module.exports = auth;