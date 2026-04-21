import axios from "axios";
import { useAuth } from "@/stores/auth";

export const api = axios.create({ baseURL: "/api", timeout: 3000 });

api.interceptors.request.use((cfg) => {
  const t = useAuth.getState().token;
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) useAuth.getState().logout();
    return Promise.reject(err);
  }
);
