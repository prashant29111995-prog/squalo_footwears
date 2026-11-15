const mongoose = require('mongoose');
const Schema = mongoose.Schema;

var UserSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      trim: true,
      required: true,
      lowercase: true,
      unique: true,
      //validate: [validateEmail, 'Please fill a valid email address'],
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please fill a valid email address',
      ],
    },
    phone: {
      type: Number,
      trim: true,
      unique: true,
      required: true,
    },
    user_type: {
  type: String,
  enum: ["Freelancer", "Employee", "Client", "PartyStaff"],
  required: true,
},
    is_active: {
      type: Boolean,
      default: true,
    },
    password: {
  type: String,
  required: function () {
    return this.user_type === "PartyStaff";
  },
},
    originalpass: {
      type: String,
    },
    client: {
      country: {
        type: String,
      },
      university: String,
    },
    employee: {
      salary: {
        type: Number,
      },
      joiningDate: {
        type: Date,
      },
      user_role: {
        type: String,
        enum: ['SuperAdmin', 'Admin', 'Manager', 'TeamLead', 'Expert', 'BDM'],
      },
      endDate: {
        type: Date,
      },
    },
    // Existing users retain access to their current portal.
// PartyStaff accounts use the POS portal.
portalAccess: {
  type: String,
  enum: ["LEGACY", "POS"],
  default: function () {
    return this.user_type === "PartyStaff" ? "POS" : "LEGACY";
  },
},

// Enforced by the future POS login/password-change workflow.
mustChangePassword: {
  type: Boolean,
  default: false,
},

// Future POS sessions will record this version.
// Incrementing it will allow us to invalidate older sessions.
authVersion: {
  type: Number,
  default: 0,
  min: 0,
},
    createdby: {
      ref: 'User',
      type: Schema.Types.ObjectId,
      default: null,
    },
    assignedTo: {
      ref: 'User',
      type: Schema.Types.ObjectId,
      default: null,
    },
    user_device: {
      type: String,
      default: null,
      unique: true,
    },
    bulkDataCreated: [
      {
        filename: {
          type: String,
        },
        taskIds: {
          type: Array,
          default: [],
        },
        addedOn: {
          type: Date,
          default: Date.now(),
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);
UserSchema.pre("validate", function (next) {
  if (this.user_type === "PartyStaff") {
    if (this.portalAccess !== "POS") {
      this.invalidate(
        "portalAccess",
        "Party staff accounts must use the POS portal"
      );
    }

    if (this.employee && this.employee.user_role) {
      this.invalidate(
        "employee.user_role",
        "Party staff roles must be assigned through BusinessMembership"
      );
    }
  }

  next();
});
// Export the modelname
module.exports = mongoose.model('User', UserSchema);
