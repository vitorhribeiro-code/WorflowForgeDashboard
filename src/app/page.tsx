import { redirect } from "next/navigation";

// A raiz encaminha para o painel; se não houver sessão, o painel manda para /login.
export default function Home() {
  redirect("/dashboard");
}
