import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { authServiceClient } from "@/grpcweb";
import useResponsiveWidth from "@/hooks/useResponsiveWidth";
import { useUserStore, useViewStore } from "@/stores";
import { Role } from "@/types/proto/api/v1/user_service";
import AboutDialog from "./AboutDialog";
import { openCommandPalette } from "./CommandPalette";
import CreateShortcutDialog from "./CreateShortcutDialog";
import DisplayStyleToggle from "./DisplayStyleToggle";
import Icon from "./Icon";
import Logo from "./Logo";
import PageContainer from "./PageContainer";
import Dropdown from "./common/Dropdown";

const menuItemClassName =
  "w-full px-2 flex flex-row justify-start items-center text-left text-foreground leading-8 cursor-pointer rounded hover:bg-accent";

const Header: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const currentUser = useUserStore().getCurrentUser();
  const viewStore = useViewStore();
  const { md } = useResponsiveWidth();
  const [showAboutDialog, setShowAboutDialog] = useState<boolean>(false);
  const [showCreateDialog, setShowCreateDialog] = useState<boolean>(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const isAdmin = currentUser.role === Role.ADMIN;
  // Searching, display style and creating all act on the Shortcut collection,
  // so they only appear on the surface that shows it.
  const isDashboard = location.pathname === "/shortcuts";
  const isAnalytics = location.pathname === "/analytics";
  const shouldShowRouterSwitch = isDashboard || location.pathname === "/collections";
  const selectedSection = isDashboard ? "Shortcuts" : location.pathname === "/collections" ? "Collections" : "";

  // `/` focuses search from anywhere on the page — but not while a Member is
  // typing a `/` into a field of their own.
  useEffect(() => {
    if (!isDashboard) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDashboard]);

  const handleSignOutButtonClick = async () => {
    await authServiceClient.signOut({});
    window.location.href = "/auth";
  };

  // Rendered in exactly one of two places, never both — it owns a ref, and two
  // copies swapped by CSS would fight over it. On a phone the header cannot
  // hold the mark, the field and the buttons on one line, so search drops to a
  // row of its own underneath.
  const searchField = (
    <div className="flex flex-row items-center gap-2 h-8 w-full px-2.5 rounded-md border border-input bg-background">
      <Icon.Search className="w-3.5 h-auto shrink-0 text-muted-foreground" />
      <input
        ref={searchRef}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        type="text"
        value={viewStore.filter.search ?? ""}
        placeholder={t("common.search")}
        onChange={(e) => viewStore.setFilter({ search: e.target.value })}
      />
      {viewStore.filter.search ? (
        <button
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
          onClick={() => viewStore.setFilter({ search: "" })}
        >
          <Icon.X className="w-3.5 h-auto" />
        </button>
      ) : (
        <span className="font-mono shrink-0 rounded-sm border border-border px-1 text-xs leading-4 text-muted-foreground">/</span>
      )}
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-20 w-full border-b border-border bg-background/85 backdrop-blur">
        <PageContainer className="h-14 flex flex-row justify-start items-center gap-3 md:gap-4">
          <div className="flex flex-row justify-start items-center shrink-0">
            <Link to="/" className="cursor-pointer flex flex-row justify-start items-center text-foreground" viewTransition>
              <Logo className="!w-5 mr-2" />
              <span className="font-medium tracking-tight">Slash</span>
            </Link>
            {shouldShowRouterSwitch && (
              <>
                <span className="font-mono text-muted-foreground mx-1">/</span>
                <Dropdown
                  trigger={
                    <button className="flex flex-row justify-end items-center cursor-pointer">
                      <span className="text-foreground text-sm">{selectedSection}</span>
                      <Icon.ChevronsUpDown className="ml-1 w-4 h-auto text-muted-foreground" />
                    </button>
                  }
                  actionsClassName="!w-36 -left-4"
                  actions={
                    <>
                      <Link className={menuItemClassName} to="/shortcuts" viewTransition>
                        <Icon.SquareSlash className="w-5 h-auto mr-2 opacity-70" /> Shortcuts
                      </Link>
                      <Link className={menuItemClassName} to="/collections" viewTransition>
                        <Icon.LibrarySquare className="w-5 h-auto mr-2 opacity-70" /> Collections
                      </Link>
                    </>
                  }
                ></Dropdown>
              </>
            )}
          </div>

          {isDashboard && md && <div className="flex-1 max-w-[400px]">{searchField}</div>}

          <div className="ml-auto flex flex-row justify-end items-center gap-2 shrink-0">
            {isDashboard && md && <DisplayStyleToggle />}
            {isDashboard && (
              <Button variant="outline" size="sm" className="h-8 px-2.5" asChild>
                <Link to="/analytics" viewTransition>
                  <Icon.LayoutDashboard className="w-4 h-auto" />
                  <span className="hidden md:inline">{t("analytics.self")}</span>
                </Link>
              </Button>
            )}
            {isAnalytics && (
              <Button variant="outline" size="sm" className="h-8 px-2.5" asChild>
                <Link to="/shortcuts" viewTransition>
                  <Icon.ChevronLeft className="w-4 h-auto" />
                  <span className="hidden md:inline">Shortcuts</span>
                </Link>
              </Button>
            )}
            {/* ⌘K means nothing without a keyboard, so it is not offered on a phone. */}
            {md && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 font-mono"
                aria-label="Open command palette"
                onClick={openCommandPalette}
              >
                ⌘K
              </Button>
            )}
            {isDashboard && (
              <Button size="sm" className="h-8 px-2.5" onClick={() => setShowCreateDialog(true)}>
                <Icon.Plus className="w-4 h-auto" />
                <span className="hidden md:inline">New shortcut</span>
              </Button>
            )}
            <Dropdown
              trigger={
                <button className="flex flex-row justify-end items-center cursor-pointer">
                  <span className="text-foreground text-sm max-w-20 truncate">{currentUser.nickname}</span>
                  <Icon.ChevronDown className="ml-1 w-4 h-auto text-muted-foreground" />
                </button>
              }
              actionsClassName="!w-32"
              actions={
                <>
                  <Link className={menuItemClassName} to="/setting/general" viewTransition>
                    <Icon.User className="w-5 h-auto mr-2 opacity-70" /> {t("user.profile")}
                  </Link>
                  {isAdmin && (
                    <Link className={menuItemClassName} to="/setting/workspace" viewTransition>
                      <Icon.Settings className="w-5 h-auto mr-2 opacity-70" /> {t("settings.self")}
                    </Link>
                  )}
                  <button className={menuItemClassName} onClick={() => setShowAboutDialog(true)}>
                    <Icon.Info className="w-5 h-auto mr-2 opacity-70" /> {t("common.about")}
                  </button>
                  <button className={menuItemClassName} onClick={() => handleSignOutButtonClick()}>
                    <Icon.LogOut className="w-5 h-auto mr-2 opacity-70" /> {t("auth.sign-out")}
                  </button>
                </>
              }
            ></Dropdown>
          </div>
        </PageContainer>

        {isDashboard && !md && <PageContainer className="pb-2.5">{searchField}</PageContainer>}
      </header>

      {showAboutDialog && <AboutDialog onClose={() => setShowAboutDialog(false)} />}

      {showCreateDialog && <CreateShortcutDialog onClose={() => setShowCreateDialog(false)} />}
    </>
  );
};

export default Header;
