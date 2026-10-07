import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card } from "../../components/ui/Display";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Fields";
import { Alert } from "../../components/feedback/States";
import { useToast } from "../../components/feedback/Toast";
import { settingsService } from "../../services/settingsService";
import { profileSchema, type BusinessProfile } from "./profileSchema";
import logoPlaceholder from "../../assets/phase-three/logo.svg";
export function BusinessProfileForm({
  businessId,
  profile,
}: {
  businessId: string;
  profile: BusinessProfile;
}) {
  const client = useQueryClient();
  const notify = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    watch,
    setValue,
    setError,
    clearErrors,
    reset,
  } = useForm<BusinessProfile>({
    resolver: zodResolver(profileSchema),
    defaultValues: profile,
  });
  const logo = watch("logo");
  const save = useMutation({
    mutationFn: (values: BusinessProfile) =>
      settingsService.update(businessId, values),
    onSuccess: async (data) => {
      client.setQueryData(["business-profile", businessId], data);
      await client.invalidateQueries({ queryKey: ["session"] });
      reset(data);
      notify("Business profile saved.");
    },
  });
  async function upload(file?: File) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("logo", { message: "Choose a PNG or JPG up to 5MB." });
      return;
    }
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const preview = new Image();
      preview.src = url;
      await preview.decode();
      clearErrors("logo");
      setValue("logo", url, { shouldDirty: true, shouldValidate: true });
    } catch {
      setError("logo", { message: "This file could not be read as an image." });
    }
  }
  return (
    <Card className="profile-card">
      <h1>Business Profile</h1>
      <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate>
        <fieldset disabled={save.isPending}>
          <div className="profile-logo">
            <img
              src={logo || logoPlaceholder}
              alt="Business logo"
              className={logo ? "uploaded-logo" : undefined}
            />
            <div>
              <label className="logo-upload">
                Upload Business Logo
                <input
                  className="sr-only"
                  aria-label="Upload Business Logo"
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => void upload(e.target.files?.[0])}
                />
              </label>
              <p>PNG, JPG up to 5MB. Recommended 250×250px.</p>
              {logo && (
                <Button
                  size="small"
                  variant="ghost"
                  onClick={() => setValue("logo", "", { shouldDirty: true })}
                >
                  Remove logo
                </Button>
              )}
              {errors.logo && (
                <span className="field-error" role="alert">
                  {errors.logo.message}
                </span>
              )}
            </div>
          </div>
          <div className="profile-fields">
            <Input
              label="Business Name"
              {...register("name")}
              error={errors.name?.message}
            />
            <Input
              label="Owner Name"
              {...register("owner")}
              error={errors.owner?.message}
            />
            <Input
              label="Phone"
              type="tel"
              {...register("phone")}
              error={errors.phone?.message}
            />
            <Input
              label="Email"
              type="email"
              {...register("email")}
              error={errors.email?.message}
            />
            <div className="profile-address">
              <Input
                label="Address"
                {...register("address")}
                error={errors.address?.message}
              />
            </div>
            <Input
              label="NTN (National Tax Number)"
              {...register("ntn")}
              error={errors.ntn?.message}
            />
            <Select label="Currency" {...register("currency")}>
              <option value="PKR">PKR - Pakistani Rupee</option>
            </Select>
          </div>
          {save.error && <Alert>{save.error.message}</Alert>}
          <div className="profile-footer">
            <Button type="submit" variant="primary" loading={save.isPending}>
              Save Changes
            </Button>
          </div>
        </fieldset>
        <p className="profile-note">
          {isDirty ? "You have unsaved changes. " : ""}Changes are stored in
          your workspace.
        </p>
      </form>
    </Card>
  );
}
