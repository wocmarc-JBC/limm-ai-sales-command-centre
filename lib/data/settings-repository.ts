import { getDataMode, getSystemHealth } from "./data-source";
import { getMockStore, mockClone } from "./mock-store";
import { getSupabaseServerClient } from "./supabase-server";

export async function getSettingsSummary() {
  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase!.from("settings").select("*");
    if (!error && data) {
      return {
        health: getSystemHealth(),
        settings: Object.fromEntries(data.map((item: { key: string; value: unknown }) => [item.key, item.value]))
      };
    }
  }

  return {
    health: getSystemHealth(),
    settings: mockClone(getMockStore().settings)
  };
}
