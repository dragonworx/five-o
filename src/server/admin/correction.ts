import { z } from "zod";
import { CONFIG } from "../../config/party.config";
import { NAME_TAKEN } from "../../shared/error-codes";
import { getGuest, isNameTaken, updateGuestRsvp, type RsvpFields } from "../guests";
import { badRequest, conflict, json, notFound, parseJson } from "../http";
import { dietSchema } from "../schemas";

// Host-side correction of a single record. Full invariants are still enforced by
// the DB CHECK constraints; a decline is zeroed here as well.

const correctionSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  attending: z.boolean().optional(),
  adults: z.number().int().min(0).max(50).optional(),
  kids: z.number().int().min(0).max(50).optional(),
  isMusician: z.boolean().optional(),
  diet: dietSchema.nullable().optional(),
  message: z.string().max(500).nullable().optional(),
});

export async function handleCorrection(req: Request, guestId: string): Promise<Response> {
  const existing = getGuest(guestId);
  if (!existing) return notFound("Guest not found");

  const parsed = await parseJson(req, correctionSchema);
  if (!parsed.ok) return badRequest(parsed.error);
  const patch = parsed.data;

  const attending = patch.attending ?? existing.attending === 1;
  let message = existing.message;
  if (patch.message !== undefined) message = patch.message;
  const merged: RsvpFields = {
    name: patch.name ?? existing.name,
    attending,
    adults: attending ? (patch.adults ?? existing.adults) : 0,
    kids: attending ? (patch.kids ?? existing.kids) : 0,
    isMusician: attending ? (patch.isMusician ?? existing.is_musician === 1) : false,
    diet: attending ? (patch.diet ?? existing.diet) : null,
    message,
  };

  if (patch.name !== undefined && isNameTaken(patch.name, existing.id)) {
    return conflict("Another guest already has that name", NAME_TAKEN);
  }
  if (attending && merged.adults > CONFIG.form.maxAdults) return badRequest("Too many adults");
  if (attending && merged.adults < 1) return badRequest("An acceptance needs at least one adult");

  const updated = updateGuestRsvp(guestId, merged);
  return json({ ok: true, guest: updated });
}
