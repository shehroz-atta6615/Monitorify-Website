import mongoose from "mongoose";

const { Schema } = mongoose;

const MonitorSchema = new Schema(
  {
    guestProjectId: {
      type: Schema.Types.ObjectId,
      ref: "GuestProject",
      required: true,
      index: true,
    },

    name: { type: String, trim: true, maxlength: 120, default: "" },
    url: { type: String, trim: true, required: true },

    method: { type: String, enum: ["GET", "HEAD"], default: "GET" },

    // MVP defaults
    intervalSec: { type: Number, default: 900, min: 60, max: 86400 }, // 15m default
    timeoutMs: { type: Number, default: 30000, min: 1000, max: 120000 }, // 30s default

    followRedirects: { type: Boolean, default: true },

    // store headers as a Map<String,String>
    headers: { type: Map, of: String, default: undefined },

    isActive: { type: Boolean, default: true },

    // last check status (worker update karega)
    lastStatus: {
      type: String,
      enum: ["unknown", "up", "down", "paused"],
      default: "unknown",
    },
    lastCheckedAt: { type: Date, default: null },
    lastResponseTimeMs: { type: Number, default: null },
    lastHttpStatus: { type: Number, default: null },
    lastError: { type: String, default: "" },
  },
  { timestamps: true }
);

// Optional: avoid exact duplicates per project
MonitorSchema.index({ guestProjectId: 1, url: 1 }, { unique: false });

export default mongoose.model("Monitor", MonitorSchema);
