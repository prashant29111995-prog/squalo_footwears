const fs = require("fs");
const path = require("path");

const FILE_PATH = path.resolve(__dirname, "../config/categories.json");

function readCategories() {
  if (!fs.existsSync(FILE_PATH)) {
    return { MEN: [], WOMEN: [], KIDS: [], UNISEX: [] };
  }
  const raw = fs.readFileSync(FILE_PATH, "utf-8");
  return JSON.parse(raw || "{}");
}

function writeCategories(data) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function norm(v) {
  return String(v || "").trim().toUpperCase();
}

module.exports = { readCategories, writeCategories, norm };
