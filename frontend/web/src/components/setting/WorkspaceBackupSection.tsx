import { DownloadIcon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { showCommonDialog } from "@/components/Alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { serverAddress } from "@/grpcweb";

const WorkspaceBackupSection = () => {
  const { t } = useTranslation();
  const [includeActivities, setIncludeActivities] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const url = new URL("/api/v1/workspace/backup", serverAddress);
    if (includeActivities) {
      url.searchParams.set("activities", "true");
    }
    // A navigation rather than fetch + Blob, so the browser streams the file
    // straight to disk instead of holding a whole workspace in memory.
    window.location.href = url.toString();
  };

  const restore = async (file: File) => {
    setRestoring(true);
    try {
      const body = new FormData();
      body.append("backup", file);
      const response = await fetch(new URL("/api/v1/workspace/backup:restore", serverAddress), {
        method: "POST",
        credentials: "include",
        body,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        // The server explains what to do about a version mismatch or a
        // non-empty instance, so surface its message rather than a generic one.
        toast.error(payload.message || t("settings.workspace.backup.restore-failed"));
        return;
      }
      toast.success(payload.message, { duration: Infinity });
    } catch (error: any) {
      toast.error(error.message || t("settings.workspace.backup.restore-failed"));
    } finally {
      setRestoring(false);
    }
  };

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so that selecting the same file twice still fires a change event.
    event.target.value = "";
    if (!file) {
      return;
    }

    showCommonDialog({
      title: t("settings.workspace.backup.restore-confirm-title"),
      content: t("settings.workspace.backup.restore-confirm-content"),
      style: "destructive",
      confirmBtnText: t("settings.workspace.backup.restore"),
      onConfirm: () => {
        void restore(file);
      },
    });
  };

  return (
    <div className="w-full flex flex-col sm:flex-row justify-start items-start gap-4 sm:gap-x-16">
      <p className="sm:w-1/4 text-2xl shrink-0 font-semibold text-foreground">{t("settings.workspace.backup.self")}</p>
      <div className="w-full sm:w-auto grow flex flex-col justify-start items-start gap-4">
        <p className="text-sm text-muted-foreground">{t("settings.workspace.backup.description")}</p>
        <p className="text-sm text-muted-foreground">{t("settings.workspace.backup.secrets-warning")}</p>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="backup-include-activities"
            checked={includeActivities}
            onCheckedChange={(checked) => setIncludeActivities(checked === true)}
          />
          <Label htmlFor="backup-include-activities" className="text-foreground">
            {t("settings.workspace.backup.include-activities")}
          </Label>
        </div>
        <Button onClick={handleExport}>
          <DownloadIcon />
          {t("settings.workspace.backup.export")}
        </Button>

        <div className="w-full pt-2 flex flex-col justify-start items-start gap-2">
          <p className="text-sm font-medium text-foreground">{t("settings.workspace.backup.restore")}</p>
          <p className="text-sm text-muted-foreground">{t("settings.workspace.backup.restore-description")}</p>
          <input ref={fileInputRef} type="file" accept=".gz" className="hidden" onChange={handleFileSelected} />
          <Button variant="outline" disabled={restoring} onClick={() => fileInputRef.current?.click()}>
            <UploadIcon />
            {restoring ? t("settings.workspace.backup.restoring") : t("settings.workspace.backup.choose-file")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceBackupSection;
