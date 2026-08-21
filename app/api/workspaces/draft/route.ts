import { NextResponse } from "next/server";
import { commercePacks, type CommercePackId } from "@/lib/commerce-packs";
import { buildWorkspaceReadiness, validateWorkspaceDraft, type AvatarStyle, type WorkspaceDraftInput } from "@/lib/tenant-workspace";

const avatarStyles = new Set<AvatarStyle>(["professional", "educator", "energetic", "luxury"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Partial<WorkspaceDraftInput> | null;
  if (!body || !body.packId || !(body.packId in commercePacks) || !body.avatarStyle || !avatarStyles.has(body.avatarStyle)) {
    return NextResponse.json({ error: "A valid Commerce Pack and avatar style are required." }, { status: 400 });
  }
  const input: WorkspaceDraftInput = {
    businessName: String(body.businessName || ""),
    packId: body.packId as CommercePackId,
    avatarStyle: body.avatarStyle,
    rewardName: String(body.rewardName || ""),
    rewardDescription: String(body.rewardDescription || ""),
  };
  const errors = validateWorkspaceDraft(input);
  if (errors.length) return NextResponse.json({ errors }, { status: 400 });
  return NextResponse.json({
    persisted: false,
    readiness: buildWorkspaceReadiness(input),
    notice: "Preview only. No account, tenant, customer record, affiliate credential, or billing relationship was created.",
  });
}
