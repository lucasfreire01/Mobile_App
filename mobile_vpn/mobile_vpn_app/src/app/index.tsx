import { Redirect } from "expo-router";
import { useAuth } from "../auth/auth-context";

export default function Index() {
  const { token, user } = useAuth();
  return (
    <Redirect
      href={!token ? "/login" : user?.isAdmin ? "/gateways" : "/access-denied"}
    />
  );
}
