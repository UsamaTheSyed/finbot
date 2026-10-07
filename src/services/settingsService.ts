import {
  profileSchema,
  type BusinessProfile,
} from "../features/settings/profileSchema";
import { ApiError, httpApi, mockResponse, useMock } from "./api";
import { businessProfiles } from "./mock/businessProfiles";
import { businesses } from "./mock/data";
function requireProfile(id: string) {
  if (!Object.hasOwn(businessProfiles, id))
    throw new ApiError("Business profile not found", 404);
  return businessProfiles[id];
}
export const settingsService = {
  get: (id: string): Promise<BusinessProfile> =>
    useMock
      ? mockResponse(() => requireProfile(id))
      : httpApi.get(`/businesses/${encodeURIComponent(id)}/settings`),
  update(id: string, input: BusinessProfile): Promise<BusinessProfile> {
    const profile = profileSchema.parse(input);
    return useMock
      ? mockResponse(() => {
          requireProfile(id);
          businessProfiles[id] = profile;
          const business = businesses.find((b) => b.id === id);
          if (business) business.name = profile.name;
          return profile;
        })
      : httpApi.patch(
          `/businesses/${encodeURIComponent(id)}/settings`,
          profile,
        );
  },
};
