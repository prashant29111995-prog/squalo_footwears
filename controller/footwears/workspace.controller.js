const mongoose = require("mongoose");

const Party = require("../../models/footwears/Party");
const Business = require("../../models/footwears/Business");

const isValidObjectId = (value) =>
  typeof value === "string" &&
  /^[a-f\d]{24}$/i.test(value) &&
  mongoose.Types.ObjectId.isValid(value);

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

// Intended route:
// POST /apis/footwears/parties/:id/workspace
//
// Mount behind a verified central-administrator permission check.
// This handler is not a replacement for authorisation middleware.
exports.createForParty = async (req, res) => {
  let session;

  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      fail(400, "Invalid party id");
    }

    session = await mongoose.startSession();

    let result;

    await session.withTransaction(async () => {
      const party = await Party.findById(id).session(session);

      if (!party) {
        fail(404, "Party not found");
      }

      if (!party.isActive) {
        fail(409, "Activate the party before creating a workspace");
      }

      if (!["CUSTOMER", "BOTH"].includes(party.partyType)) {
        fail(400, "Only buying parties can have a POS workspace");
      }

      if (!party.posEnabled) {
        fail(409, "Enable POS for this party first");
      }

      const ownershipType =
        party.ownershipType || "INDEPENDENT_BUYER";

      let business;

      if (party.businessId) {
        business = await Business.findById(party.businessId)
          .session(session);

        if (!business) {
          fail(
            409,
            "The party links to a missing workspace. Repair the link before continuing."
          );
        }

        if (
          business.businessType !== "PARTY" ||
          String(business.sourcePartyId) !== String(party._id)
        ) {
          fail(409, "The party workspace link is inconsistent");
        }
      } else {
        // Recover an existing workspace if the reverse party link
        // was not previously saved.
        business = await Business.findOne({
          sourcePartyId: party._id,
        }).session(session);
      }

      if (business) {
        if (business.businessType !== "PARTY") {
          fail(409, "The existing workspace has an invalid business type");
        }

        if (business.ownershipType !== ownershipType) {
          fail(
            409,
            "Party and workspace ownership types differ. Review ownership before continuing."
          );
        }

        if (!business.isActive) {
          fail(
            409,
            "The existing workspace is inactive. It must be reactivated separately."
          );
        }

        if (!party.businessId) {
          party.businessId = business._id;
          await party.save({ session });
        }

        result = {
          created: false,
          business: business.toObject(),
          partyId: party._id,
        };

        return;
      }

      // Deterministic, globally unique code for this party.
      // A separate editable display code can be introduced later.
      const code = `PARTY-${String(party._id).toUpperCase()}`;

      const created = await Business.create(
        [
          {
            code,
            name: party.name,
            businessType: "PARTY",
            sourcePartyId: party._id,
            ownershipType,
            phone: party.phone || "",
            gstin: party.gstin || "",
            address: {
              line1: party.address || "",
              city: party.city || "",
            },
            isActive: true,
          },
        ],
        { session }
      );

      business = created[0];

      party.businessId = business._id;
      await party.save({ session });

      result = {
        created: true,
        business: business.toObject(),
        partyId: party._id,
      };
    });

    return res.status(result.created ? 201 : 200).json({
      ok: true,
      message: result.created
        ? "Workspace created and linked to party"
        : "Workspace already exists",
      data: {
        partyId: result.partyId,
        business: result.business,
      },
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        ok: false,
        message: error.message,
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        ok: false,
        message: "Workspace validation failed",
        errors: Object.values(error.errors).map(
          (item) => item.message
        ),
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        ok: false,
        message:
          "A workspace already exists or was just created. Refresh the party and try again.",
      });
    }

    console.error("Failed to create party workspace", error);

    return res.status(500).json({
      ok: false,
      message: "Failed to create party workspace",
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

// GET /apis/footwears/parties/:id/workspace
exports.getForParty = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid party id",
      });
    }

    const party = await Party.findById(id)
      .select(
        "name partyType ownershipType posEnabled isActive businessId"
      )
      .lean();

    if (!party) {
      return res.status(404).json({
        ok: false,
        message: "Party not found",
      });
    }

    let business = null;

    if (party.businessId) {
      business = await Business.findById(party.businessId)
        .select(
          "code name businessType sourcePartyId ownershipType isActive"
        )
        .lean();

      if (
        !business ||
        business.businessType !== "PARTY" ||
        String(business.sourcePartyId) !== String(party._id)
      ) {
        return res.status(409).json({
          ok: false,
          message: "The party workspace link needs administrator review",
        });
      }
    } else {
      business = await Business.findOne({
        sourcePartyId: party._id,
      })
        .select(
          "code name businessType sourcePartyId ownershipType isActive"
        )
        .lean();
    }

    const ownershipType =
      party.ownershipType || "INDEPENDENT_BUYER";

    const needsReview =
      !!business &&
      (
        !party.businessId ||
        business.businessType !== "PARTY" ||
        business.ownershipType !== ownershipType
      );

    const eligible =
      party.isActive === true &&
      party.posEnabled === true &&
      ["CUSTOMER", "BOTH"].includes(party.partyType);

    return res.json({
      ok: true,
      data: {
        party,
        business,
        needsReview,
        canCreate: eligible && !business,
        status: needsReview
          ? "NEEDS_REVIEW"
          : !business
            ? "NOT_CREATED"
            : business.isActive
              ? "ACTIVE"
              : "INACTIVE",
      },
    });
  } catch (error) {
    console.error("Failed to load party workspace", error);

    return res.status(500).json({
      ok: false,
      message: "Failed to load party workspace",
    });
  }
};