import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateRandomString } from "@/helpers/utils";
import { cn } from "@/lib/utils";
import Icon from "./Icon";

interface Props {
  name: string;
  onChange: (name: string) => void;
}

const ResourceNameInput = (props: Props) => {
  const { name, onChange } = props;
  const [modified, setModified] = useState(false);
  const [editingName, setEditingName] = useState(name || generateRandomString().toLowerCase());

  useEffect(() => {
    onChange(editingName);
  }, [editingName]);

  const handleNameInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!modified) {
      return;
    }

    setEditingName(e.target.value);
  };

  return (
    <div className="w-full flex flex-col justify-start items-start mb-3">
      <div className={cn(modified ? "mb-2" : "flex flex-row justify-start items-center")}>
        <span>Name</span>
        {modified ? (
          <span className="text-destructive"> *</span>
        ) : (
          <>
            <span>:</span>
            <span className="shortcut-name ml-1 font-medium">{editingName}</span>
            <div className="ml-1 flex flex-row justify-start items-center">
              <Button size="icon" variant="ghost" onClick={() => setModified(true)}>
                <Icon.Edit className="w-4 h-auto text-muted-foreground" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditingName(generateRandomString().toLowerCase())}>
                <Icon.RefreshCcw className="w-4 h-auto text-muted-foreground" />
              </Button>
            </div>
          </>
        )}
      </div>
      {modified && (
        <div className="relative w-full">
          <Input className="w-full" type="text" placeholder="An unique name" value={editingName} onChange={handleNameInputChange} />
        </div>
      )}
    </div>
  );
};

export default ResourceNameInput;
