import mongoose from "mongoose";

const JobSchema = new mongoose.Schema(
  {
    type: { type: String, required: true }, // "screenshot"
    status: { type: String, required: true, default: "queued" }, // queued|running|done|error
    guestProjectId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "GuestProject" },

    payload: {
      url: { type: String, required: true },
      fullPage: { type: Boolean, default: true },
      width: { type: Number, default: 1366 },
      height: { type: Number, default: 768 },
    },

    result: {
      fileUrl: { type: String }, // e.g. /uploads/xxx.png
    },

    error: {
      message: { type: String },
    },

    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("Job", JobSchema);
