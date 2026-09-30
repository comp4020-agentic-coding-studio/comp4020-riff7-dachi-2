import type { APIRoute } from "astro";
import { cancelBooking } from "../../../lib/db";

// Anyone can cancel any booking — see cancelBooking's own comment for why
// that's the deliberate trust model here, not an oversight. No form fields
// to read, so the malformed-Content-Type footgun documented on
// POST /api/bookings (an unconditional request.formData() call) doesn't
// apply to this route at all.
export const POST: APIRoute = async ({ params, redirect }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0 || !cancelBooking(id)) {
    return new Response(null, { status: 404 });
  }
  return redirect("/?status=cancelled", 303);
};
