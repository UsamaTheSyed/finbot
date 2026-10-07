import { z } from "zod";
export const profileSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(100),
  owner: z.string().trim().min(1, "Owner name is required").max(100),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+92|0)[\d -]{9,14}$/, "Enter a valid Pakistani phone number"),
  email: z.string().trim().email("Enter a valid email address").max(200),
  address: z.string().trim().min(1, "Address is required").max(300),
  ntn: z.string().trim().max(30),
  currency: z.literal("PKR"),
  logo: z
    .string()
    .max(7500000)
    .refine(
      (value) =>
        !value || /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value),
      "Choose a PNG or JPG logo",
    ),
});
export type BusinessProfile = z.infer<typeof profileSchema>;
