/** Sin tildes, minúsculas y espacios simples: «José  Peña» ≈ «jose pena». */
export const normalizeSearch = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
