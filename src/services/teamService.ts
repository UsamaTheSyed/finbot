import type { TeamMember } from "../types";
import { team } from "./mock/data";
import { ApiError, httpApi, mockResponse, useMock } from "./api";
export type TeamInvite = Pick<
  TeamMember,
  "name" | "email" | "role" | "permissions"
>;
const scoped = (businessId: string) =>
  team.filter((m) => m.businessId === businessId);
export const teamService = {
  list: (businessId: string): Promise<TeamMember[]> =>
    useMock
      ? mockResponse(() => scoped(businessId))
      : httpApi.get(`/businesses/${businessId}/team`),
  invite: (businessId: string, input: TeamInvite): Promise<TeamMember> =>
    useMock
      ? mockResponse(() => {
          if (
            team.some(
              (m) =>
                m.businessId === businessId &&
                m.email.toLowerCase() === input.email.toLowerCase(),
            )
          )
            throw new ApiError("A member with this email already exists.", 409);
          const member: TeamMember = {
            ...input,
            id: `team-${Date.now()}`,
            businessId,
            status: "Invited",
            lastActive: "—",
          };
          team.push(member);
          return member;
        })
      : httpApi.post(`/businesses/${businessId}/team`, input),
  remove: (businessId: string, id: string): Promise<void> =>
    useMock
      ? mockResponse(() => {
          const i = team.findIndex(
            (m) => m.businessId === businessId && m.id === id,
          );
          if (i < 0) throw new ApiError("Team member not found", 404);
          if (team[i].role === "Owner")
            throw new ApiError("The workspace owner cannot be removed.", 400);
          team.splice(i, 1);
        })
      : httpApi.delete(`/businesses/${businessId}/team/${id}`),
};
