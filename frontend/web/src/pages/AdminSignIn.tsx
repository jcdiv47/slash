import React from "react";
import Logo from "@/components/Logo";
import PasswordAuthForm from "@/components/PasswordAuthForm";

const AdminSignIn: React.FC = () => {
  return (
    <div className="w-full min-h-[100dvh] px-4 flex flex-col justify-center items-center bg-background">
      {/* pb pushes the block optically above centre; mathematically centred reads low. */}
      <div className="w-80 max-w-full pb-16 flex flex-col items-stretch">
        <div className="mb-6 flex flex-row justify-center items-center text-foreground">
          <Logo className="!w-6 mr-2" />
          <span className="text-xl font-medium tracking-tight">Slash</span>
        </div>
        <p className="mb-5 text-sm text-center text-muted-foreground">Sign in with an admin account</p>
        <PasswordAuthForm />
      </div>
    </div>
  );
};

export default AdminSignIn;
