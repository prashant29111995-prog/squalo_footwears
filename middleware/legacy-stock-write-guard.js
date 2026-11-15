const Store = require("../models/footwears/Store");

module.exports = async (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  try {
    const managedStore = await Store.exists({
      posStockManaged: true,
    });

    if (managedStore) {
      return res.status(409).json({
        ok: false,
        message:
          "Stock-position migration has started. Legacy stock writes are paused until the shared POS inventory workflow is connected.",
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
};