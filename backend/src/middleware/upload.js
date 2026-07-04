const multer = require('multer');
const storageConfig = require('../config/storage');

const storage = multer.diskStorage({
  destination: storageConfig.uploadDir,
  filename(req, file, cb) {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

module.exports = multer({ storage });
