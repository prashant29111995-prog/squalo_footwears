const { Configuration, OpenAIApi } = require("openai");
const Razorpay = require("razorpay");
const nodemailer = require("nodemailer");

let openaiClient;
let razorpayClient;
let smtpTransport;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function getOpenAIClient() {
  if (!openaiClient) {
    const configuration = new Configuration({
      apiKey: requireEnv("GPT3_KEY"),
    });
    openaiClient = new OpenAIApi(configuration);
  }

  return openaiClient;
}

function getRazorpayClient() {
  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: requireEnv("RAZORPAY_KEY_ID"),
      key_secret: requireEnv("RAZORPAY_KEY_SECRET"),
    });
  }

  return razorpayClient;
}

function getSmtpTransport() {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      service: process.env.SMTP_SERVICE || "gmail",
      auth: {
        user: requireEnv("SMTP_USER"),
        pass: requireEnv("SMTP_PASS"),
      },
    });
  }

  return smtpTransport;
}

module.exports = {
  getOpenAIClient,
  getRazorpayClient,
  getSmtpTransport,
};
