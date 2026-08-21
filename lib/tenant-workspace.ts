import { getCommercePack, type CommercePackId } from "@/lib/commerce-packs";

export type AvatarStyle = "professional" | "educator" | "energetic" | "luxury";

export type WorkspaceDraftInput = {
  businessName: string;
  packId: CommercePackId;
  avatarStyle: AvatarStyle;
  rewardName: string;
  rewardDescription: string;
};

export type WorkspaceReadiness = {
  status: "draft";
  workspaceKey: string;
  completed: string[];
  requiredBeforeActivation: string[];
};

const SAFE_NAME = /[^a-z0-9]+/g;

export function validateWorkspaceDraft(input: WorkspaceDraftInput) {
  const errors: string[] = [];
  if (input.businessName.trim().length < 2) errors.push("Business name must contain at least two characters.");
  if (input.businessName.trim().length > 80) errors.push("Business name must contain 80 characters or fewer.");
  if (input.rewardName.trim().length > 80) errors.push("Reward name must contain 80 characters or fewer.");
  if (input.rewardDescription.trim().length > 240) errors.push("Reward description must contain 240 characters or fewer.");
  return errors;
}

export function buildWorkspaceReadiness(input: WorkspaceDraftInput): WorkspaceReadiness {
  const pack = getCommercePack(input.packId);
  const workspaceKey = input.businessName.trim().toLowerCase().replace(SAFE_NAME, "-").replace(/^-|-$/g, "") || "workspace";
  return {
    status: "draft",
    workspaceKey,
    completed: [
      `${pack.name} selected`,
      `${input.avatarStyle} avatar direction selected`,
      input.rewardName.trim() ? `${input.rewardName.trim()} reward drafted` : "No customer reward selected",
      `${pack.restrictedClaims.length} industry claim restrictions loaded`,
    ],
    requiredBeforeActivation: [
      "Founder or workspace-owner authentication",
      "Tenant-isolated database policies",
      "Approved affiliate-program connection",
      "Verified product catalog, pricing, inventory, and claims",
      "Channel-specific launch approval",
    ],
  };
}
