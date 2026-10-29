// util/color.js

function normalizeToken(str) {
  if (!str) return "";
  return String(str)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")       // remove spaces
    .replace(/[^A-Z0-9]/g, ""); // remove symbols like / - _
}

module.exports = { normalizeToken };