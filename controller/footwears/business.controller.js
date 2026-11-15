const Business = require("../../models/footwears/Business");

exports.list = async (req, res) => {
  try {
    const page = Number(req.query.page ?? 1);
    const requestedLimit = Number(req.query.limit ?? 100);

    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(requestedLimit) ||
      requestedLimit < 1
    ) {
      return res.status(400).json({
        ok: false,
        message: "page and limit must be positive integers",
      });
    }

    const limit = Math.min(requestedLimit, 200);
    const skip = (page - 1) * limit;

    if (!Number.isSafeInteger(skip)) {
      return res.status(400).json({
        ok: false,
        message: "page is too large",
      });
    }

    const filter = {};

    if (req.query.isActive !== undefined) {
      if (!["true", "false"].includes(req.query.isActive)) {
        return res.status(400).json({
          ok: false,
          message: "isActive must be true or false",
        });
      }

      filter.isActive = req.query.isActive === "true";
    }

    const [items, total] = await Promise.all([
      Business.find(filter)
        .select("code name businessType ownershipType isActive")
        .sort({ name: 1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Business.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      data: items,
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to list businesses", error);

    return res.status(500).json({
      ok: false,
      message: "Failed to list business workspaces",
    });
  }
};