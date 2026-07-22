function requireUser(req, res) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    res.status(401).json({ error: 'Thiếu access token' });
    return null;
  }
  return match[1];
}

module.exports = { requireUser };
