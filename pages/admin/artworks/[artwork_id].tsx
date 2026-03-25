import { useRouter } from "next/router";
import { ArtworkEditor } from "../../../components/artworks/ArtworkEditor";

export default function ArtworkEditorPage() {
  const router = useRouter();
  const artworkId = typeof router.query.artwork_id === "string" ? router.query.artwork_id : "";

  if (!artworkId) {
    return <p style={{ padding: 24 }}>Loading...</p>;
  }

  return <ArtworkEditor artworkId={artworkId} />;
}
