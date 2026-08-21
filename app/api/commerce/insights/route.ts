import { NextResponse } from "next/server";
import { aggregateCommerceEvents, summarizeCustomerJourney } from "@/lib/commerce-insights";

export async function GET() {
  return NextResponse.json({
    mode: "awaiting_authenticated_data_connection",
    insights: aggregateCommerceEvents([]),
    customers: summarizeCustomerJourney([]),
    notice: "Live customer and order records remain unavailable until founder authentication and the governed Supabase connection are active.",
  });
}
