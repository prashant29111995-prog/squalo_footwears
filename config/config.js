const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  secret: process.env.JWT_SECRET || 'change-me-in-env',
  MONGODB_URI:
    process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/squalotool',
};
