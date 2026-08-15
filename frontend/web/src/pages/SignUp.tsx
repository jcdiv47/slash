import React, { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import Icon from "@/components/Icon";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authServiceClient } from "@/grpcweb";
import useLoading from "@/hooks/useLoading";
import useNavigateTo from "@/hooks/useNavigateTo";
import { useUserStore, useWorkspaceStore } from "@/stores";

const SignUp: React.FC = () => {
  const { t } = useTranslation();
  const navigateTo = useNavigateTo();
  const workspaceStore = useWorkspaceStore();
  const userStore = useUserStore();
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const actionBtnLoadingState = useLoading(false);
  const allowConfirm = email.length > 0 && nickname.length > 0 && password.length > 0;

  useEffect(() => {
    if (workspaceStore.setting.disallowUserRegistration) {
      return navigateTo("/auth", {
        replace: true,
      });
    }
  }, []);

  const handleEmailInputChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value as string;
    setEmail(text);
  };

  const handleNicknameInputChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value as string;
    setNickname(text);
  };

  const handlePasswordInputChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value as string;
    setPassword(text);
  };

  const handleSignupBtnClick = async (e: FormEvent) => {
    e.preventDefault();
    if (actionBtnLoadingState.isLoading) {
      return;
    }

    try {
      actionBtnLoadingState.setLoading();
      const user = await authServiceClient.signUp({
        email,
        nickname,
        password,
      });
      if (user) {
        userStore.setCurrentUserId(user.id);
        await userStore.fetchCurrentUser();
        navigateTo("/");
      } else {
        toast.error("Signup failed");
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.details);
    }
    actionBtnLoadingState.setFinish();
  };

  return (
    <div className="w-full min-h-[100dvh] px-4 flex flex-col justify-center items-center bg-background">
      {/* pb pushes the block optically above centre; mathematically centred reads low. */}
      <div className="w-80 max-w-full pb-16 flex flex-col items-stretch">
        <div className="mb-6 flex flex-row justify-center items-center text-foreground">
          <Logo className="!w-6 mr-2" />
          <span className="text-xl font-medium tracking-tight">Slash</span>
        </div>
        <p className="mb-5 text-sm text-center text-muted-foreground">{t("auth.create-your-account")}</p>
        <form className="w-full flex flex-col gap-4" onSubmit={handleSignupBtnClick}>
          <div className="w-full flex flex-col gap-1.5">
            <Label htmlFor="signup-email">{t("common.email")}</Label>
            <Input
              id="signup-email"
              type="email"
              value={email}
              placeholder="slash@yourselfhosted.com"
              autoComplete="email"
              onChange={handleEmailInputChanged}
            />
          </div>
          <div className="w-full flex flex-col gap-1.5">
            <Label htmlFor="signup-nickname">Nickname</Label>
            <Input
              id="signup-nickname"
              type="text"
              value={nickname}
              placeholder="slash"
              autoComplete="nickname"
              onChange={handleNicknameInputChanged}
            />
          </div>
          <div className="w-full flex flex-col gap-1.5">
            <Label htmlFor="signup-password">{t("common.password")}</Label>
            <Input
              id="signup-password"
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={handlePasswordInputChanged}
            />
          </div>
          <Button className="w-full mt-1" type="submit" disabled={actionBtnLoadingState.isLoading || !allowConfirm}>
            {actionBtnLoadingState.isLoading && <Icon.LoaderCircle className="animate-spin" />}
            {t("auth.sign-up")}
          </Button>
        </form>
        {!workspaceStore.profile.owner ? (
          <p className="mt-4 text-sm text-center font-medium text-muted-foreground">{t("auth.host-tip")}</p>
        ) : (
          <p className="mt-4 text-sm text-center">
            <span className="text-muted-foreground">{"Already have an account?"}</span>
            <Link className="cursor-pointer ml-2 font-medium text-foreground hover:underline" to="/auth" viewTransition>
              {t("auth.sign-in")}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
};

export default SignUp;
