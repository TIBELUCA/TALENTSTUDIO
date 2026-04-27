import { useEffect } from "react";
import { useLocation } from "wouter";

export default function DealerLogin() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/login");
  }, [setLocation]);
  return null;
}
