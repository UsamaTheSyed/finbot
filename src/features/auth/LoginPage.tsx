import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, TrendingUp, CircleX } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { Input } from "../../components/ui/Fields";
import { Button } from "../../components/ui/Button";
import { authService } from "../../services/authService";
import { useAppStore } from "../../store/useAppStore";
import loginShowcase from "../../assets/auth/login-showcase.jpg";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must contain at least 6 characters"),
});
type LoginForm = z.infer<typeof schema>;

export function LoginPage() {
  const authenticated = useAppStore((state) => state.authenticated);
  const setSession = useAppStore((state) => state.setSession);
  const setAuthenticated = useAppStore((state) => state.setAuthenticated);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [serverError, setServerError] = useState("");
  const form = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });
  if (authenticated) return <Navigate to="/dashboard" replace />;

  const submit = form.handleSubmit(async (values) => {
    setServerError("");
    try {
      const session = await authService.login(values.email, values.password);
      queryClient.setQueryData(["session"], session);
      setSession(session.user, session.businesses[0].id);
      setAuthenticated(true);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : "Sign in failed.",
      );
    }
  });

  return (
    <main className="login-page">
      <section
        className="login-showcase"
        style={{ backgroundImage: `url(${loginShowcase})` }}
        aria-label="FinBot introduction"
      >
        <div className="login-brand">
          <span>
            <TrendingUp size={20} />
          </span>
          FinBot
        </div>
        <div className="login-message">
          <small>🇵🇰 Tailored for Pakistani SMBs &amp; Retailers</small>
          <h1>Automate your tax, invoices, and cash flow.</h1>
          <p>
            Join thousands of business owners across Lahore, Karachi, and
            Islamabad managing their financial ledgers seamlessly with
            FBR-compliant tools.
          </p>
        </div>
        <dl className="login-stats">
          <div>
            <dt>15k+</dt>
            <dd>Active Businesses</dd>
          </div>
          <div>
            <dt>PKR 4B+</dt>
            <dd>Processed Annually</dd>
          </div>
        </dl>
      </section>
      <section className="login-form-side">
        <div className="login-card">
          <div className="login-card-title">
            <strong>
              FinBot<span>•</span>
            </strong>
            <h1>Sign In</h1>
          </div>
          <form onSubmit={submit} noValidate>
            <Input
              label="Email Address"
              type="email"
              placeholder="name@business.pk"
              autoComplete="email"
              {...form.register("email")}
              error={form.formState.errors.email?.message}
            />
            <div className="password-field">
              <Input
                label="Password"
                type={visible ? "text" : "password"}
                placeholder="Enter your security code"
                autoComplete="current-password"
                {...form.register("password")}
                error={form.formState.errors.password?.message}
              />
              <button
                type="button"
                aria-label={
                  visible ? "Conceal security code" : "Reveal security code"
                }
                onClick={() => setVisible((value) => !value)}
              >
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button
              className="forgot-link"
              type="button"
              onClick={() =>
                setServerError(
                  "Password recovery requires the deferred email service.",
                )
              }
            >
              Forgot password?
            </button>
            {serverError && (
              <p className="field-error" role="alert">
                {serverError}
              </p>
            )}
            <Button
              variant="primary"
              type="submit"
              loading={form.formState.isSubmitting}
            >
              Sign In to FinBot
            </Button>
          </form>
          <p className="login-signup">
            Don't have an account?{" "}
            <button
              type="button"
              onClick={() =>
                setServerError("Self-service registration is not enabled yet.")
              }
            >
              Sign up
            </button>
          </p>
          <div className="login-divider">
            <span>OR</span>
          </div>
          <Button
            className="google-button"
            onClick={() =>
              setServerError("Google authentication is not enabled yet.")
            }
          >
            <CircleX size={18} />
            Continue with Google
          </Button>
          <p className="login-language">
            Language:{" "}
            <button type="button" lang="ur" dir="rtl">
              اردو میں جاری رکھیں
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
