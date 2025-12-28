import mongoose from "mongoose";

const GuestProjectSchema = new mongoose.Schema(
  {
    websiteUrl: { type: String, required: true },
    apiKeyHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

GuestProjectSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // auto delete after expiry

export default mongoose.model("GuestProject", GuestProjectSchema);
