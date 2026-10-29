const mongoose = require("mongoose");
const Party = require("../../models/footwears/Party");

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const up = (s) => String(s || "").trim().toUpperCase();

const PARTY_TYPES = ["SUPPLIER", "CUSTOMER", "BOTH"];

const normalizeBoolean = (value, defaultValue = true) => {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
};

exports.create = async (req, res) => {
  try {
    const name = up(req.body.name);
    const phone = String(req.body.phone || "").trim();
    const partyType = up(req.body.partyType || "CUSTOMER");
    const address = String(req.body.address || "").trim();
    const gstin = up(req.body.gstin || "");

    if (!name) {
      return res.status(400).json({
        ok: false,
        message: "Party name required",
      });
    }

    if (!PARTY_TYPES.includes(partyType)) {
      return res.status(400).json({
        ok: false,
        message: "partyType must be SUPPLIER, CUSTOMER, or BOTH",
      });
    }

    const party = await Party.create({
      name,
      phone,
      partyType,
      address,
      gstin,
      isActive: true,
    });

    return res.status(201).json({ ok: true, data: party });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to create party",
      error: err.message,
    });
  }
};

exports.list = async (req, res) => {
  try {
    const {
      q,
      partyType,
      isActive = "true",
      limit = 100,
    } = req.query;

    const filter = {
      isActive: normalizeBoolean(isActive, true),
    };

    if (partyType) {
      const normalizedPartyType = up(partyType);

      if (!PARTY_TYPES.includes(normalizedPartyType)) {
        return res.status(400).json({
          ok: false,
          message: "partyType must be SUPPLIER, CUSTOMER, or BOTH",
        });
      }

      filter.partyType = normalizedPartyType;
    }

    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim(), "i");
      filter.$or = [{ name: rx }, { phone: rx }];
    }

    const items = await Party.find(filter)
      .sort({ name: 1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .lean();

    return res.json({ ok: true, data: items });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to list parties",
      error: err.message,
    });
  }
};

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid party id",
      });
    }

    const party = await Party.findById(id).lean();

    if (!party) {
      return res.status(404).json({
        ok: false,
        message: "Party not found",
      });
    }

    return res.json({ ok: true, data: party });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to get party",
      error: err.message,
    });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid party id",
      });
    }

    const party = await Party.findById(id);

    if (!party) {
      return res.status(404).json({
        ok: false,
        message: "Party not found",
      });
    }

    if (req.body.name !== undefined) {
      const name = up(req.body.name);
      if (!name) {
        return res.status(400).json({
          ok: false,
          message: "Party name required",
        });
      }
      party.name = name;
    }

    if (req.body.phone !== undefined) {
      party.phone = String(req.body.phone || "").trim();
    }

    if (req.body.partyType !== undefined) {
      const partyType = up(req.body.partyType);

      if (!PARTY_TYPES.includes(partyType)) {
        return res.status(400).json({
          ok: false,
          message: "partyType must be SUPPLIER, CUSTOMER, or BOTH",
        });
      }

      party.partyType = partyType;
    }

    if (req.body.address !== undefined) {
      party.address = String(req.body.address || "").trim();
    }

    if (req.body.gstin !== undefined) {
      party.gstin = up(req.body.gstin || "");
    }

    if (req.body.isActive !== undefined) {
      party.isActive = normalizeBoolean(req.body.isActive, party.isActive);
    }

    await party.save();

    return res.json({ ok: true, data: party });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to update party",
      error: err.message,
    });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid party id",
      });
    }

    const party = await Party.findById(id);

    if (!party) {
      return res.status(404).json({
        ok: false,
        message: "Party not found",
      });
    }

    party.isActive = false;
    await party.save();

    return res.json({
      ok: true,
      message: "Party deactivated",
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to remove party",
      error: err.message,
    });
  }
};