import { useRouter } from "next/router";
import { ParrotMusicStyleEditor } from "../../../components/parrot-music-styles/ParrotMusicStyleEditor";

export default function ParrotMusicStyleEditorPage() {
  const router = useRouter();
  const styleId = typeof router.query.style_id === "string" ? router.query.style_id : undefined;

  return <ParrotMusicStyleEditor styleId={styleId} />;
}
