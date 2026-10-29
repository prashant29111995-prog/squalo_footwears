require("dotenv").config();
const mongoose = require("mongoose");
const config = require('../config/config');
const Article = require("../models/footwears/Article");

async function run() {
  await mongoose.connect(config.MONGODB_URI);

  // Move old category (MEN/WOMEN/KIDS/UNISEX) into categoryGroup
  // and set category as "UNKNOWN" temporarily (or decide default)
  const res = await Article.updateMany(
    { categoryGroup: { $exists: false } },
    [
      { $set: { categoryGroup: "$category", category: "UNKNOWN" } }
    ]
  );

  console.log("Updated:", res.modifiedCount);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
