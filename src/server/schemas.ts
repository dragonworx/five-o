import { z } from "zod";

// Shared request schemas. Deliberately config-free: this module may be bundled
// into the client, so it must never import party.config (which holds secrets).
// Exact per-event limits (maxAdults/maxKids) are enforced in the route against
// CONFIG; the caps here are generous structural bounds only.

export const dietSchema = z.enum(["omnivore", "vegetarian", "vegan"]);
export type Diet = z.infer<typeof dietSchema>;

// Local device signals gathered by the client and sent with several requests.
export const deviceSignalsSchema = z.object({
  storageToken: z.string().min(8).max(100).optional(),
  idbToken: z.string().min(8).max(100).optional(),
  cacheToken: z.string().min(8).max(100).optional(),
  fingerprint: z.string().min(4).max(256).optional(),
});
export type DeviceSignals = z.infer<typeof deviceSignalsSchema>;

export const identifyRequestSchema = deviceSignalsSchema;
export type IdentifyRequest = z.infer<typeof identifyRequestSchema>;

export const claimRequestSchema = deviceSignalsSchema.extend({
  guestId: z.string().min(1).max(64),
  claimToken: z.string().min(1).max(512),
});
export type ClaimRequest = z.infer<typeof claimRequestSchema>;

export const overrideRequestSchema = deviceSignalsSchema;
export type OverrideRequest = z.infer<typeof overrideRequestSchema>;

export const lookupRequestSchema = z.object({
  name: z.string().min(1).max(120),
});
export type LookupRequest = z.infer<typeof lookupRequestSchema>;

export const rsvpRequestSchema = deviceSignalsSchema.extend({
  name: z.string().min(1).max(120),
  attending: z.boolean(),
  adults: z.number().int().min(0).max(50),
  kids: z.number().int().min(0).max(50),
  isMusician: z.boolean(),
  diet: dietSchema.optional(),
  message: z.string().max(2000).optional(),
  overriddenFrom: z.string().min(1).max(64).optional(),
});
export type RsvpRequest = z.infer<typeof rsvpRequestSchema>;

export const slidesCompleteSchema = z.object({}).strict();
