import { createClient } from "@supabase/supabase-js";

// The project URL and the ANON key are public by design: they ship inside the
// app to every browser that loads it, and access is controlled by row-level
// security in the database, not by keeping these secret. They are written in
// here as fallbacks so a missing environment variable on the host can never
// again take the whole app down to a black screen - which is what happened
// when a deploy went out without them.
//
// Never put the service_role key here. That one IS secret.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || "https://pkujygyibuiyyrryrswr.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrdWp5Z3lpYnVpeXlycnlyc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NTAyNzEsImV4cCI6MjEwMTQyNjI3MX0.NXR7JwsTYOFKO45HWnmP3ZZHstrpjF6Pny9axQbWJCM";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
