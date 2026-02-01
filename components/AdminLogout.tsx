import { useRouter } from "next/router";
import { useSupabaseClient } from "@supabase/auth-helpers-react";

export function AdminLogout() {
  const supabaseClient = useSupabaseClient();
  const router = useRouter();

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.push("/login");
  };

  return (
    <button
      onClick={handleLogout}
      className="btn-logout"
      title="Выйти"
    >
      Выйти
    </button>
  );
}