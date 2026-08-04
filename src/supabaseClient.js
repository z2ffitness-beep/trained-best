import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pkujygyibuiyyrryrswr.supabase.co';
const supabaseAnonKey = 'sb_publishable_8gDJUlRgI5A5211dEbVXXg_ykytZkn9';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
