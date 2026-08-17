import copy from "copy-to-clipboard";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { shortcutServiceClient } from "@/grpcweb";
import { formatCount, splitLink } from "@/helpers/shortcut";
import { absolutifyLink } from "@/helpers/utils";
import { cn } from "@/lib/utils";
import { useShortcutStore, useUserStore, useViewStore } from "@/stores";
import { Visibility } from "@/types/proto/api/v1/common";
import { GetShortcutAnalyticsResponse, Shortcut } from "@/types/proto/api/v1/shortcut_service";
import { Role } from "@/types/proto/api/v1/user_service";
import EditShortcutDialog from "./EditShortcutDialog";
import GenerateQRCodeDialog from "./GenerateQRCodeDialog";
import Icon from "./Icon";
import LinkFavicon from "./LinkFavicon";

dayjs.extend(relativeTime);

interface Props {
  shortcut: Shortcut;
  onClose: () => void;
}

// The server records where visits came from, what they were on and what they
// browsed with. Which of the three is on screen is a tab rather than three
// stacked tables, so the dialog stays one screenful.
type Breakdown = keyof Pick<GetShortcutAnalyticsResponse, "references" | "devices" | "browsers">;

const BREAKDOWNS: { key: Breakdown; label: string; heading: string }[] = [
  { key: "references", label: "Sources", heading: "How people reach it" },
  { key: "devices", label: "Devices", heading: "What they are on" },
  { key: "browsers", label: "Browsers", heading: "What they browse with" },
];

const Tile = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="bg-background px-3 py-2.5">
    <div className="font-mono text-xs uppercase tracking-[0.11em] text-muted-foreground">{label}</div>
    <div className="mt-1.5">{children}</div>
  </div>
);

const ShortcutDetailDialog = ({ shortcut, onClose }: Props) => {
  const { t } = useTranslation();
  const shortcutStore = useShortcutStore();
  const userStore = useUserStore();
  const viewStore = useViewStore();
  const currentUser = userStore.getCurrentUser();
  const [analytics, setAnalytics] = useState<GetShortcutAnalyticsResponse | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown>("references");
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false);
  const [showEditDialog, setShowEditDialog] = useState<boolean>(false);
  const [showQRCodeDialog, setShowQRCodeDialog] = useState<boolean>(false);
  const creator = userStore.getUserById(shortcut.creatorId);
  const havePermission = currentUser.role === Role.ADMIN || shortcut.creatorId === currentUser.id;
  const { host, path } = splitLink(shortcut.link);
  const shortcutLink = absolutifyLink(`/s/${shortcut.name}`);
  const isPublic = shortcut.visibility === Visibility.PUBLIC;

  useEffect(() => {
    setAnalytics(null);
    shortcutServiceClient.getShortcutAnalytics({ id: shortcut.id }).then(setAnalytics);
    userStore.getOrFetchUserById(shortcut.creatorId);
  }, [shortcut.id]);

  const rows = analytics ? analytics[breakdown] : [];
  const max = Math.max(1, ...rows.map((row) => row.count));

  const handleCopyButtonClick = () => {
    copy(shortcutLink);
    toast.success("Shortcut link copied to clipboard.");
  };

  const handleDelete = async () => {
    await shortcutStore.deleteShortcut(shortcut.id);
    toast.success(`Deleted s/${shortcut.name}`);
    onClose();
  };

  const handleTagClick = (tag: string) => {
    // Selecting a Tag is a statement about the list behind the dialog, so the
    // dialog gets out of the way.
    viewStore.toggleTag(tag);
    onClose();
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        {/* While editing, this dialog stays mounted (unmounting it bounces
            focus through the page underneath) but fades out, in step with the
            edit dialog fading in. */}
        <DialogContent
          className={cn("top-[46%] max-w-3xl gap-0 p-0 overflow-hidden [&>button]:hidden", showEditDialog && "opacity-0")}
          aria-describedby={undefined}
        >
          <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-border">
            <div className="flex flex-row justify-start items-start gap-3">
              <div className="w-9 h-9 shrink-0 flex justify-center items-center rounded-md border border-border bg-muted/50">
                <div className="w-5 h-5 flex justify-center items-center overflow-clip">
                  <LinkFavicon url={shortcut.link} />
                </div>
              </div>

              <div className="min-w-0 flex-1 flex flex-col gap-1">
                <div className="min-w-0 flex flex-row items-center gap-2">
                  {shortcut.title ? (
                    <>
                      <DialogTitle className="truncate text-xl">{shortcut.title}</DialogTitle>
                      <span className="shortcut-name shrink-0 px-1.5 py-0.5 rounded-sm bg-muted text-sm text-foreground">
                        s/{shortcut.name}
                      </span>
                    </>
                  ) : (
                    // An untitled Shortcut leads with its Name at title size —
                    // it is the only name it has.
                    <DialogTitle className="shortcut-name truncate text-xl">s/{shortcut.name}</DialogTitle>
                  )}
                  {isPublic && (
                    <span className="shrink-0 inline-flex items-center gap-1 px-1.5 rounded-sm border border-border text-xs text-muted-foreground">
                      <Icon.Globe className="w-3 h-auto" />
                      {t("shortcut.visibility.public.self")}
                    </span>
                  )}
                </div>
                <DialogDescription className="sr-only">Details and analytics for this shortcut.</DialogDescription>

                <a
                  className="min-w-0 flex flex-row items-center gap-1.5 text-sm text-muted-foreground hover:underline"
                  href={shortcut.link}
                  target="_blank"
                >
                  <span className="truncate">
                    <span className="text-foreground">{host}</span>
                    {path}
                  </span>
                  <Icon.ExternalLink className="w-3 h-auto shrink-0" />
                </a>
              </div>

              <button
                className="w-7 h-7 shrink-0 flex justify-center items-center rounded-sm border border-input text-muted-foreground hover:text-foreground"
                aria-label="Close"
                onClick={onClose}
              >
                <Icon.X className="w-3.5 h-auto" />
              </button>
            </div>

            <div className="mt-4 flex flex-row items-center flex-wrap gap-2">
              <Button size="sm" className="h-8" asChild>
                <a href={shortcutLink} target="_blank">
                  <Icon.ExternalLink className="w-4 h-auto" />
                  Open
                </a>
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={handleCopyButtonClick}>
                <Icon.Clipboard className="w-4 h-auto" />
                Copy link
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => setShowQRCodeDialog(true)}>
                <Icon.QrCode className="w-4 h-auto" />
                QR Code
              </Button>
              {havePermission && (
                <Button variant="outline" size="sm" className="h-8" onClick={() => setShowEditDialog(true)}>
                  <Icon.Edit className="w-4 h-auto" />
                  {t("common.edit")}
                </Button>
              )}

              {/* Deleting is confirmed in this same row rather than by stacking
                  a second dialog on top of this one. */}
              {havePermission &&
                (isConfirmingDelete ? (
                  <div className="ml-auto flex flex-row items-center gap-2">
                    <span className="text-sm text-destructive">Delete this shortcut?</span>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => setIsConfirmingDelete(false)}>
                      Keep
                    </Button>
                    <Button variant="destructive" size="sm" className="h-8" onClick={handleDelete}>
                      {t("common.delete")}
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="ml-auto h-8" onClick={() => setIsConfirmingDelete(true)}>
                    <Icon.Trash className="w-4 h-auto" />
                    {t("common.delete")}
                  </Button>
                ))}
            </div>
          </div>

          <div className="max-h-[60vh] overflow-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
            {shortcut.description ? (
              <p className="text-pretty text-sm leading-6 text-muted-foreground">{shortcut.description}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground/80">No description — add one so future you remembers why this exists.</p>
            )}

            {shortcut.tags.length > 0 && (
              <div className="flex flex-row items-center flex-wrap gap-1.5">
                {shortcut.tags.map((tag) => (
                  <button
                    key={tag}
                    className="shortcut-name px-2 py-1 rounded-sm border border-border bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => handleTagClick(tag)}
                  >
                    <span className="text-muted-foreground/70">#</span>
                    {tag}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-md border border-border bg-border overflow-hidden">
              <Tile label="Visits">
                <span className="shortcut-name text-lg font-medium text-foreground">{formatCount(shortcut.viewCount)}</span>
              </Tile>
              {/* The concept asks for "Last used"; a Shortcut carries no
                  last-visited timestamp, so this is when it last changed. */}
              <Tile label={t("filter.order-by-updated")}>
                <span className="text-sm text-foreground">{shortcut.updatedTime ? dayjs(shortcut.updatedTime).fromNow() : "—"}</span>
              </Tile>
              <Tile label="Visibility">
                <span className="text-sm text-foreground">{t(`shortcut.visibility.${shortcut.visibility.toLowerCase()}.self`)}</span>
              </Tile>
              <Tile label={t("filter.order-by-created")}>
                <span className="text-sm text-foreground">
                  {shortcut.createdTime ? dayjs(shortcut.createdTime).format("MMM D, YYYY") : "—"}
                </span>
              </Tile>
            </div>

            <div>
              <div className="mb-3 flex flex-row items-center flex-wrap gap-2">
                <span className="text-sm font-medium text-foreground">{BREAKDOWNS.find((b) => b.key === breakdown)!.heading}</span>
                <div className="ml-auto flex flex-row gap-0.5 p-0.5 rounded-md border border-input">
                  {BREAKDOWNS.map((option) => (
                    <button
                      key={option.key}
                      className={cn(
                        "h-6 px-2 rounded-sm text-xs transition-colors",
                        option.key === breakdown ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                      aria-pressed={option.key === breakdown}
                      onClick={() => setBreakdown(option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {analytics === null ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="h-3.5 rounded-sm bg-muted" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nothing recorded yet.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {rows.map((row) => (
                    <div
                      key={row.name}
                      className="grid grid-cols-[minmax(0,1fr)_5rem_2.5rem] sm:grid-cols-[minmax(0,1fr)_8rem_2.5rem] items-center gap-3"
                    >
                      <span className="truncate text-sm text-muted-foreground">{row.name || "Direct"}</span>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(row.count / max) * 100}%` }} />
                      </div>
                      <span className="shortcut-name text-right text-xs text-muted-foreground">{formatCount(row.count)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-row items-center gap-4 px-4 sm:px-6 py-2.5 border-t border-border bg-muted/40 text-xs text-muted-foreground">
            <span className="shrink-0">
              Created by <span className="text-foreground">{creator.nickname || "…"}</span>
            </span>
            <span className="shortcut-name hidden sm:inline truncate">{shortcutLink}</span>
            <span className="ml-auto shrink-0">
              <span className="font-mono text-foreground">esc</span> to close
            </span>
          </div>
        </DialogContent>
      </Dialog>

      {showEditDialog && <EditShortcutDialog shortcut={shortcut} onClose={() => setShowEditDialog(false)} />}
      {showQRCodeDialog && <GenerateQRCodeDialog shortcut={shortcut} onClose={() => setShowQRCodeDialog(false)} />}
    </>
  );
};

export default ShortcutDetailDialog;
