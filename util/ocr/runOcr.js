const Tesseract = require("tesseract.js");

async function run() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    throw new Error("Image path missing");
  }

  const result = await Tesseract.recognize(inputPath, "eng", {
    logger: () => {},
  });

  console.log("__OCR_JSON_START__");
  console.log(JSON.stringify({
    ok: true,
    text: result && result.data ? result.data.text || "" : "",
  }));
  console.log("__OCR_JSON_END__");
}

run().catch((err) => {
  console.log("__OCR_JSON_START__");
  console.log(JSON.stringify({
    ok: false,
    error: err.message || "OCR failed",
  }));
  console.log("__OCR_JSON_END__");

  process.exit(1);
});