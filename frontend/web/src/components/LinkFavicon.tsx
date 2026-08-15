import { useState } from "react";
import Icon from "./Icon";

interface Props {
  url: string;
}

const faviconProvider = "https://www.google.com/s2/favicons";

const getFaviconUrlWithProvider = (url: string, provider: string) => {
  try {
    const searchParams = new URLSearchParams();
    searchParams.set("domain", new URL(url).hostname);
    searchParams.set("sz", "64");
    return new URL(`?${searchParams.toString()}`, provider).toString();
  } catch (error) {
    return "";
  }
};

const LinkFavicon = ({ url }: Props) => {
  const faviconUrl = getFaviconUrlWithProvider(url, faviconProvider);
  // Which Links have failed, rather than whether the current one has: the same
  // instance is reused while a Link is being typed, so a single boolean would
  // stay stuck on the first host that had no icon.
  const [failedUrls, setFailedUrls] = useState<string[]>([]);

  if (!faviconUrl || failedUrls.includes(faviconUrl)) {
    return <Icon.CircleSlash className="w-full h-auto text-muted-foreground" strokeWidth={1.5} />;
  }

  return (
    <img
      key={faviconUrl}
      className="w-full h-auto rounded"
      src={faviconUrl}
      decoding="async"
      loading="lazy"
      onError={() => setFailedUrls((urls) => urls.concat(faviconUrl))}
    />
  );
};

export default LinkFavicon;
