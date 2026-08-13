import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import Logo from "@/components/Logo";
import PasswordAuthForm from "@/components/PasswordAuthForm";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { absolutifyLink } from "@/helpers/utils";
import { useWorkspaceStore } from "@/stores";
import { IdentityProvider, IdentityProvider_Type } from "@/types/proto/api/v1/workspace_service";

const SignIn: React.FC = () => {
  const { t } = useTranslation();
  const workspaceStore = useWorkspaceStore();

  const handleSignInWithIdentityProvider = async (identityProvider: IdentityProvider) => {
    const stateQueryParameter = identityProvider.id;
    if (identityProvider.type === IdentityProvider_Type.OAUTH2) {
      const redirectUri = absolutifyLink("/auth/callback");
      const oauth2Config = identityProvider.config?.oauth2;
      if (!oauth2Config) {
        toast.error("Identity provider configuration is invalid.");
        return;
      }
      const authUrl = `${oauth2Config.authUrl}?client_id=${
        oauth2Config.clientId
      }&redirect_uri=${redirectUri}&state=${stateQueryParameter}&response_type=code&scope=${encodeURIComponent(
        oauth2Config.scopes.join(" "),
      )}`;
      window.location.href = authUrl;
    }
  };

  return (
    <div className="w-full min-h-[100dvh] px-4 flex flex-col justify-center items-center bg-background">
      {/* pb pushes the block optically above centre; mathematically centred reads low. */}
      <div className="w-80 max-w-full pb-16 flex flex-col items-stretch">
        <div className="mb-8 flex flex-row justify-center items-center text-foreground">
          <Logo className="!w-6 mr-2" />
          <span className="text-xl font-medium tracking-tight">Slash</span>
        </div>
        {!workspaceStore.setting.disallowPasswordAuth ? (
          <PasswordAuthForm />
        ) : (
          <p className="text-sm text-center text-muted-foreground">Password sign-in is disabled on this workspace.</p>
        )}
        {!workspaceStore.setting.disallowUserRegistration && !workspaceStore.setting.disallowPasswordAuth && (
          <p className="mt-4 text-sm text-center">
            <span className="text-muted-foreground">{"Don't have an account yet?"}</span>
            <Link className="cursor-pointer ml-2 font-medium text-foreground hover:underline" to="/auth/signup" viewTransition>
              {t("auth.sign-up")}
            </Link>
          </p>
        )}
        {workspaceStore.setting.identityProviders.length > 0 && (
          <>
            <div className="w-full flex items-center my-4">
              <Separator className="flex-1" />
              <span className="px-2 text-sm text-muted-foreground">{t("common.or")}</span>
              <Separator className="flex-1" />
            </div>
            <div className="w-full flex flex-col space-y-2">
              {workspaceStore.setting.identityProviders.map((identityProvider) => (
                <Button
                  key={identityProvider.id}
                  variant="outline"
                  className="w-full"
                  size="default"
                  onClick={() => handleSignInWithIdentityProvider(identityProvider)}
                >
                  {t("auth.sign-in-with", { provider: identityProvider.title })}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SignIn;
