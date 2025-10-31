import axios from "axios";

const API_BASE_URL = "https://your-app.onrender.com";
const API_TOKEN = "change-me-secret";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_TOKEN}`
  }
});

export function setAuthToken(token: string) {
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}
