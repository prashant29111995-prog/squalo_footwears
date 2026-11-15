const mongoose = require("mongoose");

const { Schema } = mongoose;

const MEMBERSHIP_ROLES = [
  "OWNER",
  "MANAGER",
  "CASHIER",
  "SALESPERSON",
  "STOCKIST",
];

const BusinessMembershipSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      immutable: true,
    },

    // Role inside this business only.
    role: {
      type: String,
      enum: MEMBERSHIP_ROLES,
      required: true,
    },

    // ASSIGNED: access only to the stores listed below.
    // ALL: access to every store within this business.
    storeAccess: {
      type: String,
      enum: ["ASSIGNED", "ALL"],
      default: "ASSIGNED",
      required: true,
    },

    storeIds: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "Store",
        },
      ],
      default: [],
    },

    // A suggested landing store, never an access grant by itself.
    defaultStoreId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// One membership per user per business.
// Re-enabling a person updates the existing membership.
BusinessMembershipSchema.index(
  {
    businessId: 1,
    userId: 1,
  },
  {
    unique: true,
  }
);

// Find the user's available business workspaces.
BusinessMembershipSchema.index({
  userId: 1,
  isActive: 1,
});

// List staff by business and role.
BusinessMembershipSchema.index({
  businessId: 1,
  isActive: 1,
  role: 1,
});

// Find staff assigned to a particular store.
BusinessMembershipSchema.index({
  businessId: 1,
  storeIds: 1,
  isActive: 1,
});

BusinessMembershipSchema.pre("validate", function (next) {
  const storeIds = Array.isArray(this.storeIds)
    ? this.storeIds
    : [];

  const uniqueStoreIds = Array.from(
    new Set(storeIds.map((id) => String(id)))
  );

  this.storeIds = uniqueStoreIds;

  // Keep business-wide access limited to owners and managers.
  if (
    this.storeAccess === "ALL" &&
    !["OWNER", "MANAGER"].includes(this.role)
  ) {
    this.invalidate(
      "storeAccess",
      "Only owners and managers can have access to all business stores"
    );
  }

  // ALL access should not retain a misleading assigned-store list.
  if (
    this.storeAccess === "ALL" &&
    uniqueStoreIds.length > 0
  ) {
    this.invalidate(
      "storeIds",
      "Leave storeIds empty when storeAccess is ALL"
    );
  }

  // An owner or manager may be created before stores are configured.
  // Other active staff must have at least one assigned store.
  if (
    this.isActive &&
    this.storeAccess === "ASSIGNED" &&
    uniqueStoreIds.length === 0 &&
    !["OWNER", "MANAGER"].includes(this.role)
  ) {
    this.invalidate(
      "storeIds",
      "Assign at least one store to this staff member"
    );
  }

  if (
    this.defaultStoreId &&
    this.storeAccess === "ASSIGNED" &&
    !uniqueStoreIds.includes(String(this.defaultStoreId))
  ) {
    this.invalidate(
      "defaultStoreId",
      "The default store must be included in the assigned stores"
    );
  }

  next();
});

module.exports = mongoose.model(
  "BusinessMembership",
  BusinessMembershipSchema
);