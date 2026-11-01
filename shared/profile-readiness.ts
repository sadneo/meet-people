import { AccountProfileSchema, type AccountProfile, withAccountIdentity } from './account-profile.js'
import { MatchingProfileSchema, type MatchingProfile } from './matchmaking.js'
import { interestSelectionProblem } from './interests.js'

// Frontend readiness policy, not a replacement backend/RPC contract or marker.
export const ReadyPreferencesSchema = MatchingProfileSchema
  .refine(profile => !interestSelectionProblem(profile.interests), 'Choose 1–5 interests from the list or your own, with at most 2 custom interests.')
  .refine(profile => !!profile.birthdate, 'Enter a valid birthdate.')
  .refine(profile => !!profile.location_city?.trim(), 'Enter your city or campus area.')
  .refine(profile => profile.availability.length >= 1, 'Choose at least one availability window.')

export const readinessMessage = 'Choose at least one interest from the list or your own, a valid birthdate, city or campus area, and at least one non-overlapping availability window.'

export function isProfileReady(account: AccountProfile | null, profile: MatchingProfile | null) {
  return !!account && !!profile && AccountProfileSchema.safeParse(account).success && ReadyPreferencesSchema.safeParse(withAccountIdentity(profile, account)).success
}
