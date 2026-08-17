import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import Icon from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authServiceClient } from "@/grpcweb";
import useLoading from "@/hooks/useLoading";
import useNavigateTo from "@/hooks/useNavigateTo";
import { useUserStore } from "@/stores";

const PasswordAuthForm = () => {
  const { t } = useTranslation();
  const navigateTo = useNavigateTo();
  const userStore = useUserStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const actionBtnLoadingState = useLoading(false);
  const allowConfirm = email.length > 0 && password.length > 0;

  const handleSigninBtnClick = async (e: FormEvent) => {
    e.preventDefault();
    if (actionBtnLoadingState.isLoading) {
      return;
    }

    try {
      actionBtnLoadingState.setLoading();
      const user = await authServiceClient.signIn({ email, password });
      if (user) {
        userStore.setCurrentUserId(user.id);
        await userStore.fetchCurrentUser();
        navigateTo("/");
      } else {
        toast.error("Sign-in failed. Check your email and password.");
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.details);
    }
    actionBtnLoadingState.setFinish();
  };

  return (
    <form className="w-full flex flex-col gap-4" onSubmit={handleSigninBtnClick}>
      <div className="w-full flex flex-col gap-1.5">
        <Label htmlFor="auth-email">{t("common.email")}</Label>
        <Input
          id="auth-email"
          type="email"
          value={email}
          placeholder="slash@yourselfhosted.com"
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="w-full flex flex-col gap-1.5">
        <Label htmlFor="auth-password">{t("common.password")}</Label>
        <Input
          id="auth-password"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button className="w-full mt-1" type="submit" disabled={actionBtnLoadingState.isLoading || !allowConfirm}>
        {actionBtnLoadingState.isLoading && <Icon.LoaderCircle className="animate-spin" />}
        {t("auth.sign-in")}
      </Button>
    </form>
  );
};

export default PasswordAuthForm;
