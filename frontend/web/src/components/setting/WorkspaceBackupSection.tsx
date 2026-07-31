import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { serverAddress } from "@/grpcweb";

const WorkspaceBackupSection = () => {
  const { t } = useTranslation();
  const [includeActivities, setIncludeActivities] = useState(false);

  const handleExport = () => {
    const url = new URL("/api/v1/workspace/backup", serverAddress);
    if (includeActivities) {
      url.searchParams.set("activities", "true");
    }
    // A navigation rather than fetch + Blob, so the browser streams the file
    // straight to disk instead of holding a whole workspace in memory.
    window.location.href = url.toString();
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
      </div>
    </div>
  );
};

export default WorkspaceBackupSection;
